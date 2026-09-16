/**
 * 时光 Flux - 场景工坊 · 场景定义类型
 * 一个"场景" = 一个预制的、面向特定任务的 Agent 工作流：
 *   场景人设 prompt + 参数表单 schema + 结构化输出解析。
 * 后续场景(面试冲刺/简历包装…)按同一接口新增即可，前后端零改动。
 */

/** 参数表单的 JSON Schema（前端据此渲染表单，required 为必填） */
export interface SceneParamsSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
}

export interface SceneDef {
  /** 场景唯一 id（路由 /scenes/:id 用它） */
  id: string;
  /** 展示名，如 短视频工场 */
  name: string;
  /** 一句话说明（列表页显示） */
  description: string;
  /** 图标（emoji，前端展示用） */
  icon: string;
  /** 参数表单 schema */
  paramsSchema: SceneParamsSchema;
  /** 场景人设 + 规则 + 输出格式（不含本次参数，会话启动时固定） */
  buildSystemPrompt(): string;
  /** 把用户填的参数拼成这条任务的 user 消息 */
  buildTaskMessage(params: Record<string, unknown>): string;
  /** 把模型最终输出解析成结构化结果；解析失败返回 null（前端回退纯文本展示） */
  parseOutput(text: string): Record<string, unknown> | null;
  /** 运行时可用的内置工具名（默认 []；短视频工场 = ["search_kb"]） */
  tools?: string[];
  /** 预留挂载点：第三方能力（如视频生成 API），本期为空 */
  integrations?: Record<string, unknown>;
}
