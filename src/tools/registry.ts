/**
 * 时光 Flux - 工具注册表
 * 所有工具在这里"登记"。会话不直接认识具体工具，只通过注册表按名字取——
 * 这样未来 Agent 可以有自己的工具组合、MCP 工具也能插进同一个表。
 */
import type { FluxTool } from "./types.js";

export class ToolRegistry {
  private map = new Map<string, FluxTool>();

  /** 登记一个工具（重复名字会报错，避免混乱） */
  register(tool: FluxTool): void {
    if (this.map.has(tool.name)) {
      throw new Error(`工具 ${tool.name} 已存在，请勿重复注册`);
    }
    this.map.set(tool.name, tool);
  }

  /** 按名字取工具（没有返回 undefined） */
  get(name: string): FluxTool | undefined {
    return this.map.get(name);
  }

  /** 全部工具（有序） */
  all(): FluxTool[] {
    return [...this.map.values()];
  }

  /** 只取某种风险等级的工具（埋点：审批/沙箱可能只放行某类） */
  byRisk(risk: FluxTool["risk"]): FluxTool[] {
    return this.all().filter((t) => t.risk === risk);
  }
}
