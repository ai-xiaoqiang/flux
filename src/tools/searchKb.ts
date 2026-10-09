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
      const hits = await searchKb(ctx.model, query, Number(args.k ?? 4), ctx.kbCategories);
      const scope = ctx.kbCategories && ctx.kbCategories.length ? `（仅检索「${ctx.kbCategories.join("、")}」分类）` : "";
      const kbOnly = ctx.kbMode === "kb_only";
      if (hits.length === 0)
        return kbOnly
          ? `知识库${scope}里没检索到相关内容。请如实告知用户「知识库里没有相关内容」，不要用你自己的知识补充。`
          : `知识库${scope}里没检索到相关内容。请直接用你自己的知识回答，不要因为知识库没有而拒绝回答。`;
      const topScore = hits[0].score;
      const list = hits
        .map((h, i) => `【${i + 1}】《${h.title}》(${h.category}) 相关度 ${(h.score * 100).toFixed(0)}%\n${h.text.slice(0, 600)}`)
        .join("\n\n");
      // 相关度低于阈值 = 没检索到真正相关的内容：auto 模式给模型明确的"用自己的知识"信号（此刻正是它决定拒绝与否的时刻）
      if (topScore < 0.3) {
        return `知识库命中 ${hits.length} 段${scope}（按相关度排序），但相关度都较低：\n\n${list}\n\n${
          kbOnly
            ? "（提示：以上结果与问题直接相关度较低。请仅依据与问题直接相关的片段回答；没有直接相关的，请如实告知用户「知识库里没有相关内容」。）"
            : "（提示：以上结果相关度较低，未检索到与问题直接相关的内容。按系统规则：请以自己的专业知识为主回答，知识库内容仅作参考，不要拒绝回答。）"
        }`;
      }
      return `知识库命中 ${hits.length} 段${scope}（按相关度排序）：\n\n${list}`;
    } catch (e) {
      return `检索出错：${e instanceof Error ? e.message : String(e)}`;
    }
  },
};
