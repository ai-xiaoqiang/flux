/**
 * 时光 Flux - 工具：抓取网页
 * 给一个网址，抓取网页正文返回文字。适合"抓取某网页内容/文档网页"。
 */
import { fetchUrl } from "../ingest/fetchUrl.js";
import type { FluxTool } from "./types.js";

export const fetchUrlTool: FluxTool = {
  name: "fetch_url",
  description:
    "抓取一个网页的正文内容并返回文字。当用户给出网址想让你读/分析某个网页、或想把网页内容存下来时使用。",
  risk: "read",
  category: "document",
  parametersSchema: {
    type: "object",
    properties: { url: { type: "string", description: "要抓取的完整网址(含 https://)" } },
    required: ["url"],
  },
  async execute(args) {
    const url = String(args.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return "错误：url 需要以 http:// 或 https:// 开头";
    try {
      const page = await fetchUrl(url);
      return `【网页】${page.title}\n来源: ${page.url}\n\n${page.text}`;
    } catch (e) {
      return `抓取失败：${e instanceof Error ? e.message : String(e)}`;
    }
  },
};
