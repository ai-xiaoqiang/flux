/**
 * 时光 Flux - 工具：搜代码内容(grep)
 * 扫代码第②招：全项目按关键词搜，返回 文件:行号:匹配行。
 * 定位"谁在用 X""某逻辑在哪"就靠它。
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { FluxTool } from "./types.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next"]);
const MAX_RESULTS = 40;
const MAX_DEPTH = 6;

export const searchCodeTool: FluxTool = {
  name: "grep",
  description:
    "在当前项目里按关键词(不区分大小写)搜索代码内容，返回「文件:行号:匹配行」。适合回答'哪里用到了X''这个逻辑在哪个文件'之类的问题。",
  risk: "read",
  category: "code",
  parametersSchema: {
    type: "object",
    properties: { query: { type: "string", description: "要搜索的关键词" } },
    required: ["query"],
  },
  async execute(args, ctx) {
    const query = String(args.query ?? "").trim();
    if (!query) return "错误：缺少 query 参数";
    const results: string[] = [];
    await searchDir(ctx.cwd, query, ctx.cwd, results, 0);
    if (results.length === 0) return `在项目里没找到包含「${query}」的代码`;
    return `找到 ${results.length} 处：\n${results.join("\n")}`;
  },
};

async function searchDir(
  dir: string,
  query: string,
  root: string,
  results: string[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const lower = query.toLowerCase();
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await searchDir(join(dir, e.name), query, root, results, depth + 1);
    } else {
      try {
        const text = await readFile(join(dir, e.name), "utf-8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
          if (lines[i].toLowerCase().includes(lower)) {
            results.push(`${relative(root, join(dir, e.name))}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
          }
        }
      } catch {
        /* 二进制或读不了的文件跳过 */
      }
    }
  }
}
