/**
 * 时光 Flux - 工具：保存记忆
 * 让时光机"记住"重要的事 → 写入记忆文件，下次启动还记着。
 * 会改记忆文件，标 write。
 */
import { addMemory } from "../memory.js";
import type { FluxTool } from "./types.js";

export const saveMemoryTool: FluxTool = {
  name: "save_memory",
  description:
    "把一条重要信息或事实保存到长期记忆。当用户明确要求记住某事，或陈述了明确、简短、对以后有用的个人偏好/背景时使用。",
  risk: "write",
  category: "memory",
  parametersSchema: {
    type: "object",
    properties: { fact: { type: "string", description: "要记住的具体事实，应是一句清晰完整的话" } },
    required: ["fact"],
  },
  async execute(args) {
    const fact = String(args.fact ?? "").trim();
    if (!fact) return "错误：缺少 fact 参数";
    addMemory(fact);
    return `已记住：${fact}`;
  },
};
