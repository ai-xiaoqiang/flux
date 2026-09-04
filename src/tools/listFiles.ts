/**
 * 时光 Flux - 工具：列出项目结构(树)
 * 扫代码第⓪招：先看整体布局，再决定精读谁。避免"分析项目时逐个文件乱读"。
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { FluxTool } from "./types.js";

const SKIP = new Set(["node_modules", ".git", "dist", ".next", ".cache", "coverage"]);
const MAX_LINES = 250;
const MAX_DEPTH = 6;

export const listFilesTool: FluxTool = {
  name: "list_files",
  description:
    "列出项目的目录结构(树形，已忽略 node_modules/.git/dist)。当用户要你分析整个项目/了解代码结构时，先调用它看布局，再挑关键文件精读；不要逐个文件盲目读取。",
  risk: "read",
  category: "code",
  parametersSchema: { type: "object", properties: {} },
  async execute(_args, ctx) {
    const lines: string[] = [];
    await walk(ctx.cwd, "", lines, 0);
    if (lines.length === 0) return "(目录为空或读取失败)";
    const more = lines.length >= MAX_LINES ? "\n…(内容过多已截断)" : "";
    return lines.join("\n") + more;
  },
};

async function walk(dir: string, prefix: string, lines: string[], depth: number): Promise<void> {
  if (lines.length >= MAX_LINES || depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  // 目录在前，各自按字母序
  entries.sort((a, b) =>
    a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1,
  );
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith(".")) continue;
    lines.push(prefix + (e.isDirectory() ? `[${e.name}]` : e.name));
    if (e.isDirectory()) {
      await walk(join(dir, e.name), prefix + "  ", lines, depth + 1);
    }
  }
}
