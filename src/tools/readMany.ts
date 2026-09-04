/**
 * 时光 Flux - 工具：批量读文件
 * 扫代码第③招：一次读多个文件（不用一次一次 read_file）。
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FluxTool } from "./types.js";

const MAX_FILES = 8;      // 一次最多读几个
const PER_FILE = 8000;    // 每个文件最多带多少字符

export const readManyFilesTool: FluxTool = {
  name: "read_many_files",
  description:
    "一次性读取多个文本文件的内容，返回时按文件名分段。适合同时理解几个相关文件（如组件+其样式、接口+实现）。",
  risk: "read",
  category: "code",
  parametersSchema: {
    type: "object",
    properties: { paths: { type: "array", items: { type: "string" }, description: "要读取的文件路径列表(相对工作目录)" } },
    required: ["paths"],
  },
  async execute(args, ctx) {
    const raw = args.paths;
    const paths = Array.isArray(raw) ? raw.map(String) : [];
    if (paths.length === 0) return "错误：缺少 paths 参数";
    const picked = paths.slice(0, MAX_FILES);
    const parts: string[] = [];
    for (const p of picked) {
      try {
        const full = resolve(ctx.cwd, p);
        let text = await readFile(full, "utf-8");
        if (text.length > PER_FILE) text = text.slice(0, PER_FILE) + "\n…(已截断)";
        parts.push(`===== ${p} =====\n${text}`);
      } catch (e) {
        parts.push(`===== ${p} =====\n(读取失败：${e instanceof Error ? e.message : String(e)})`);
      }
    }
    if (paths.length > MAX_FILES) parts.push(`…(还有 ${paths.length - MAX_FILES} 个文件未读，可分批)`);
    return parts.join("\n\n");
  },
};
