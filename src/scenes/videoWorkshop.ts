/**
 * 时光 Flux - 场景：短视频工场
 * 输入：主题(必填) + 目标时长/平台/是否参考素材库
 * 输出：标题/口播文案/分镜/封面字/话题标签 的 JSON 物料包
 * 可选：先 search_kb 从知识库检索参考素材 → 再创作（参考但不照抄）。
 */
import type { SceneDef } from "./types.js";

export const videoWorkshopScene: SceneDef = {
  id: "video-workshop",
  name: "短视频工场",
  description: "输入一个主题，产出可直接开拍的短视频物料包：标题 / 口播文案 / 分镜 / 封面字 / 话题标签",
  icon: "📱",
  paramsSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "短视频主题（必填）" },
      duration: { type: "string", enum: ["15", "30", "60"], description: "目标时长(秒)，默认 30" },
      platform: { type: "string", enum: ["抖音", "视频号", "B站"], description: "目标平台，默认 抖音" },
      useKb: { type: "boolean", description: "是否先从知识库检索参考（默认开启）" },
    },
    required: ["topic"],
  },
  tools: ["search_kb"],
  buildSystemPrompt() {
    return `你是「时光」的短视频工场：一个爆款短视频物料工厂。
你的任务：根据用户给的主题，产出一份可以直接开拍的短视频物料包。

创作要求：
- 口播文案：口语化、有钩子（前 3 秒抓住人）、节奏紧凑、有信息量，不要空话套话。
- 分镜：逐镜头给出「画面描述 + 对应旁白 + 秒数」，总秒数约等于目标时长。
- 标题与封面字：抓眼球、口语、能让人停下来。
- 话题标签：3~8 个，贴合内容与平台。

输出格式（严格遵守）：
只输出一个 json 代码块，不要任何其它文字、解释或 markdown 标题。格式如下：
\`\`\`json
{
  "标题": "……",
  "口播文案": "第一句\\n第二句\\n……(每句一行，可带[停顿]/[镜头提示])",
  "分镜": [
    { "镜头": "画面描述", "旁白": "对应口播", "时长秒": 5 }
  ],
  "封面字": "……",
  "话题标签": ["……", "……"]
}
\`\`\``;
  },
  buildTaskMessage(params) {
    const topic = String(params.topic ?? "").trim() || "（未提供主题）";
    const duration = String(params.duration ?? "30");
    const platform = String(params.platform ?? "抖音");
    const useKb = params.useKb !== false;
    return (
      `主题：${topic}\n` +
      `目标平台：${platform}\n` +
      `目标时长：${duration} 秒\n` +
      (useKb
        ? "请先用 search_kb 检索素材库，参考其中的相关信息再创作（参考但不要照抄）。检索不到就直接创作。\n"
        : "") +
      "请按输出格式产出这份短视频物料包。"
    );
  },
  parseOutput(text) {
    const json = extractJsonBlock(text);
    if (!json) return null;
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      if (!obj || typeof obj !== "object") return null;
      // 校验五个关键字段齐不齐；不齐就当解析失败(前端回退纯文本)
      for (const k of ["标题", "口播文案", "分镜", "封面字", "话题标签"]) {
        if (!(k in obj)) return null;
      }
      return obj;
    } catch {
      return null;
    }
  },
};

/** 从模型输出里提取第一个 fenced json 代码块；没有则返回 null */
function extractJsonBlock(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}
