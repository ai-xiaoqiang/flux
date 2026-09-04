/**
 * 时光 Flux - 工具：知识库语义检索
 * 让时光机"从你存的文档里"检索着回答问题(向量检索/RAG)。
 */
import { searchKb } from "../kb/rag.js";
import type { FluxTool } from "./types.js";

export const searchKbTool: FluxTool = {
  name: "search_kb",
  description:
    "在知识库(用户存过的文档)里按语义检索，返回与问题最相关的几段内容。当用户想「基于之前存的文档/资料」回答问题、或问「根据知识库里X」时使用。",
  risk: "read",
  category: "kb",
  parametersSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "要检索的问题/关键词，用自然语言描述你想要的内容" },
      k: { type: "number", description: "返回几段，默认4" },
    },
    required: ["query"],
  },
  async execute(args, ctx) {
    if (!ctx.model) return "知识库检索需要模型能力，当前不可用";
    const query = String(args.query ?? "").trim();
    if (!query) return "错误：缺少 query 参数";
    try {
      const hits = await searchKb(ctx.model, query, Number(args.k ?? 4));
      if (hits.length === 0) return "知识库里没检索到相关内容（可能还没存过文档，或没相关性）。";
      return (
        `知识库命中 ${hits.length} 段（按相关度排序）：\n\n` +
        hits
          .map((h, i) => `【${i + 1}】《${h.title}》(${h.category}) 相关度 ${(h.score * 100).toFixed(0)}%\n${h.text.slice(0, 600)}`)
          .join("\n\n")
      );
    } catch (e) {
      return `检索出错：${e instanceof Error ? e.message : String(e)}`;
    }
  },
};
