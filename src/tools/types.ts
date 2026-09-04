/**
 * 时光 Flux - 工具类型定义
 * 工具 = 时光机的"手"。这里定义一只手的标准长相 + 一些给未来的约定。
 *
 * 兼容性约定（埋点）：
 * - risk：给工具标风险等级，未来审批/权限策略按它走（读免确认、写要确认…）
 * - category：给工具分类，未来 Agent 可以按类启用/禁用一组工具（如"代码工具"）
 * - ToolContext：执行时传上下文对象而非散参数，未来加"会话id/用户/知识库"不破接口
 */

/** 工具的风险等级：决定默认要不要用户确认 */
export type ToolRisk = "read" | "write" | "dangerous";

/** 工具执行时拿到的上下文（对象形式，方便以后扩展不破坏签名） */
export interface ToolContext {
  /** 工作目录：读写命令相对它执行 */
  cwd: string;
  /** 模型客户端（需要调模型/embedding/rerank 的工具使用；结构化类型避免循环 import） */
  model?: {
    embed(texts: string[]): Promise<number[][]>;
    rerank?(query: string, documents: string[], topN?: number): Promise<Array<{ index: number; relevance_score: number }>>;
  };
}

/** 一个工具的契约。新增工具 = 实现这个接口然后注册 */
export interface FluxTool {
  /** 工具名：大脑用它指认要调哪个 */
  name: string;
  /** 给大脑看的：何时该用它 */
  description: string;
  /** 给大脑看的：参数 JSON Schema */
  parametersSchema: Record<string, unknown>;
  /** 风险等级 */
  risk: ToolRisk;
  /** 功能分类（埋点：未来按类批量启用/禁用工具） */
  category?: string;
  /** 真正执行。返回的字符串会回填给大脑 */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}
