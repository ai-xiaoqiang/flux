#!/usr/bin/env node
/**
 * 时光 Flux - 程序入口
 * 三种用法：
 *   1) flux "问题"          一次问答
 *   2) echo "问题" | flux   管道喂一次
 *   3) flux                 交互对话模式（像 claude 那样，进去一句句聊）
 */
import "./silence.js"; // 必须最先加载：屏蔽无害的 punycode 弃用警告
import * as readline from "node:readline";
import { loadConfig, type FluxConfig } from "./config.js";
import { AgentSession, type SessionEvent } from "./session.js";
import type { FluxTool } from "./tools/index.js";
import { needsConfirm } from "./permission.js";

/** 终端展示器：把 session 广播的事件画到终端上（网页会有另一个展示器） */
function terminalSink(): (event: SessionEvent) => void {
  return (event) => {
    switch (event.type) {
      case "text":
        console.log(event.text);
        break;
      case "tool":
        // 让工具调用"打报告"，用户看得见它在干什么
        console.log(`\n  ⚙ 调用 ${event.name} ${JSON.stringify(event.args)}`);
        break;
      case "tool_result":
        console.log(`  ✓ ${event.name} 返回了 ${event.content.length} 字`);
        break;
      case "done":
        break;
    }
  };
}

/** 从命令行参数取问题（对应 `flux "xxx"`） */
function argPrompt(argv: string[]): string {
  return argv[2] ?? "";
}

/** 从管道(stdin)读完整输入（对应 `echo xxx | flux`） */
async function readPipedInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8").trim();
}

/** 交互对话模式：显示「时光> 」提示符，一句句聊，直到 /quit 退出 */
async function startRepl(config: FluxConfig): Promise<void> {
  const session = new AgentSession(config);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`
  ╭──────────────────────────────────────────────╮
  │  时光 Flux  ·  一台在代码时间线里自由往返的    │
  │  AI 时光机                                    │
  │                                              │
  │  直接输入任务，我就会动手帮你解决             │
  │  /quit 退出      /clear 清空记忆              │
  ╰──────────────────────────────────────────────╯`);
  const sink = terminalSink();
  // 审批钩子：ask 模式下，写文件/危险命令执行前问用户 y/n；auto 或非交互不传 → 一律放行
  // 审批钩子：按模式+工具风险判断；要问就在终端问 y/n
  const confirm = async (tool: FluxTool) => {
    if (!needsConfirm(config.approvalMode, tool.risk)) return true;
    return new Promise<boolean>((resolve) => {
      rl.question(`  ⚠️ 是否允许执行「${tool.name}」(${tool.risk})? [y/n] `, (ans) =>
        resolve(ans.trim().toLowerCase().startsWith("y")),
      );
    });
  };
  rl.setPrompt("时光> ");
  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) return; // 空行忽略
    if (input === "/quit" || input === "/exit") return rl.close();
    if (input === "/clear") {
      session.reset();
      console.log("(记忆已清空)");
      return rl.prompt();
    }
    await session.run(input, sink, confirm); // 跑完这一轮，事件交给终端展示
    rl.prompt(); // 回到「时光> 」等你下一句
  });

  rl.on("close", () => {
    console.log("\n再见，时光会记得你。");
    process.exit(0);
  });
}

async function main() {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error("缺少 DASHSCOPE_API_KEY。请设置环境变量后重试。");
    process.exit(1);
  }

  // 子命令：`flux web [端口]` —— 启动网页版（图形界面 + 语音）
  if (process.argv[2] === "web") {
    const { startWebServer } = await import("./server.js");
    const port = Number(process.argv[3] ?? process.env.FLUX_PORT ?? 8787);
    startWebServer(config, port);
    console.log(`\n  时光 Flux 网页版已启动  →  http://localhost:${port}\n`);
    console.log("  在浏览器打开上面的地址。Ctrl+C 停止。");
    return;
  }

  // 场景 1：`flux "问题"` —— 带参数，直接一次问答
  const prompt = argPrompt(process.argv);
  if (prompt) {
    const session = new AgentSession(config);
    await session.run(prompt, terminalSink());
    return;
  }

  // 场景 3：`flux` —— 没参数，且在真人终端里，进入对话模式
  // 关键：process.stdin.isTTY —— 管道喂时是 false，真人键盘时是 true
  if (process.stdin.isTTY) {
    await startRepl(config);
    return;
  }

  // 场景 2：`echo xxx | flux` —— 没参数但 stdin 被管道喂了，读管道做一次问答
  const piped = await readPipedInput();
  if (piped) {
    const session = new AgentSession(config);
    await session.run(piped, terminalSink());
    return;
  }

  console.error("用法：flux '问题'   |   echo '问题' | flux   |   直接 flux 进入对话");
  process.exit(1);
}

main().catch((err) => {
  console.error("运行出错:", err instanceof Error ? err.message : err);
  process.exit(1);
});