/**
 * 时光 Flux - 会话（主循环）
 * 时光机真正"干活"的地方。它现在只负责编排 + 发事件，不再直接打印——
 * 终端界面、网页界面都靠订阅这些事件来展示。这就是"核心与界面解耦"。
 */
import { loadConfig, type FluxConfig } from "./config.js";
import { FluxModel, type FluxMessage } from "./model.js";
import { builtinRegistry, ToolRegistry, registryFromTools, type FluxTool } from "./tools/index.js";
import { buildSystemPrompt } from "./prompt.js";
import { loadMemory } from "./memory.js";

/** 工具执行前的确认钩子：返回 false 则拒绝执行（谁提供、怎么提示由调用方定） */
export type ToolConfirm = (tool: FluxTool, args: Record<string, unknown>) => Promise<boolean>;

/** 会话构造选项：场景等可覆盖默认人设与工具集合 */
export interface SessionOptions {
  /** 覆盖默认人设（场景用它注入自己的 system prompt） */
  systemPrompt?: string;
  /** 覆盖工具集合（场景只需挂自己需要的工具，默认全部内置工具） */
  tools?: FluxTool[];
}

/** 单次会话最多来回多少轮，防止大脑陷入死循环。分析类任务常需多轮，故放宽 */
const MAX_TURNS = 40;

/** 会话对外广播的事件。前端(终端/网页)订阅它来渲染 */
export type SessionEvent =
  | { type: "text"; text: string } // 模型说了一段话
  | { type: "tool"; name: string; args: Record<string, unknown> } // 模型要调工具
  | { type: "tool_result"; name: string; content: string } // 工具执行完
  | { type: "error"; text: string } // 出了错
  | { type: "confirm_request"; id: string; tool: string; risk: string; args: Record<string, unknown> } // 要用户确认
  | { type: "done" } // 本轮结束
  | { type: "scene_result"; data: Record<string, unknown> }; // 场景跑完的结构化结果

/** 事件接收器：谁把事件怎么展示，由调用者决定 */
export type EventSink = (event: SessionEvent) => void;

export class AgentSession {
  private model: FluxModel;
  /** 工具都登记在这个注册表里；以后 Agent 可换成自己的注册表 */
  private registry: ToolRegistry;
  private messages: FluxMessage[] = [];
  private cwd: string;
  /** 本会话的 system prompt（默认人设或场景注入），reset/恢复时复用 */
  private systemPrompt: string;

  constructor(private config: FluxConfig, opts: SessionOptions = {}) {
    this.model = new FluxModel(config);
    this.registry = opts.tools ? registryFromTools(opts.tools) : builtinRegistry();
    this.cwd = config.cwd;
    // 起航时翻开"记忆本"：把 ~/.flux/memory.md 里记过的事，拼进航行手册（场景用自己的 prompt）
    this.systemPrompt = opts.systemPrompt ?? buildSystemPrompt(loadMemory());
    this.messages = [{ role: "system", content: this.systemPrompt }];
  }

  /** 跑完整轮：处理一次用户输入，把过程广播给 emit，直到模型给出最终答案。
   *  confirm：可选的审批钩子——非 read 级工具(写/危险)执行前会调用它；不传 = 一律放行 */
  async run(input: string, emit: EventSink, confirm?: ToolConfirm): Promise<void> {
    this.messages.push({ role: "user", content: input });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const resp = await this.model.chat(this.messages, this.registry.all());

      // 大脑不想调工具了 → 这就是最终答案，广播出去并结束
      if (resp.functionCalls.length === 0) {
        if (resp.text) {
          emit({ type: "text", text: resp.text });
          // 记进历史，下一轮才"记得自己说过啥"
          this.messages.push({ role: "assistant", content: resp.text });
        }
        emit({ type: "done" });
        return;
      }

      // 大脑要调工具：先把它的这条"调用指令"原样记进历史
      //（OpenAI 要求：工具结果必须跟在带 tool_calls 的 assistant 消息后面）
      this.messages.push(resp.assistantMessage);

      // 逐个执行它要的工具（通过注册表按名取，执行时传上下文对象）
      for (const call of resp.functionCalls) {
        emit({ type: "tool", name: call.name, args: call.args });
        const tool = this.registry.get(call.name);
        let result: string;
        if (!tool) {
          result = `未知工具：${call.name}（可用的工具：${this.registry.all().map((t) => t.name).join(", ")}）`;
        } else if (tool.risk !== "read" && confirm && !(await confirm(tool, call.args))) {
          result = `用户拒绝了执行「${tool.name}」。如确有必要，请先征求用户同意再试。`; // 审批不过：不执行，如实告诉大脑
        } else {
          result = await tool.execute(call.args, { cwd: this.cwd, model: this.model });
        }
        emit({ type: "tool_result", name: call.name, content: result });
        // 工具结果作为一条 role=tool 的消息回填，下一轮大脑就"看到"了
        this.messages.push({ role: "tool", tool_call_id: call.callId, content: result });
      }
      // 回到循环顶部，带着工具结果再去问大脑
    }

    emit({ type: "done" });
  }

  /** 清空对话历史（保留记忆本里已存的长期记忆），回到初始状态（对应 /clear 命令） */
  reset(): void {
    this.messages = [{ role: "system", content: this.systemPrompt }];
  }

  /** 重载模型：从最新配置重建模型客户端（保存设置后调用，立即生效，不影响对话历史） */
  reloadModel(): void {
    this.model = new FluxModel(loadConfig());
  }

  /** 取出可持久化的对话消息（不含 system 首条——重启时按当前环境重建） */
  exportSnapshot(): FluxMessage[] {
    return this.messages.slice(1);
  }

  /** 从磁盘快照恢复上次对话（前面补上当前环境的 system） */
  restoreSnapshot(snapshot: FluxMessage[]): void {
    this.messages = [{ role: "system", content: this.systemPrompt }, ...snapshot];
  }
}
