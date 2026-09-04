/**
 * 时光 Flux - 权限策略
 * 三档审批模式 × 工具风险等级 → 要不要确认。这是"Agent 安全"的决策核心。
 *
 * 模式：
 *  - strict   （严格） 读免确认；写文件、跑命令都需确认
 *  - balanced （均衡） 读+写文件免确认；跑命令(危险)需确认   ← 开发常用
 *  - full     （完全） 全部自动放行（效率优先，信任模型）
 */
export type ApprovalMode = "strict" | "balanced" | "full";

/** 该模式下，某种风险等级的工具是否需要用户确认 */
export function needsConfirm(mode: ApprovalMode, risk: string): boolean {
  if (mode === "full") return false;
  if (mode === "balanced") return risk === "dangerous";
  // strict：任何写操作或危险命令都要确认
  return risk === "write" || risk === "dangerous";
}

export const APPROVAL_MODES: ApprovalMode[] = ["strict", "balanced", "full"];

export const MODE_LABEL: Record<ApprovalMode, string> = {
  strict: "严格（读写命令都要问）",
  balanced: "均衡（只危险命令问）",
  full: "完全（全自动）",
};

/** 把旧配置里的 auto/ask 归一成三档：auto→full, ask→strict */
export function normalizeMode(m?: string): ApprovalMode {
  if (m === "ask") return "strict";
  if (m === "balanced" || m === "strict") return m;
  return "full"; // auto / 其它/默认 → full（向后兼容）
}
