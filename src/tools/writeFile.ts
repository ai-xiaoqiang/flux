/**
 * 时光 Flux - 工具：写入文件
 * 时光机的"手"——把内容写进文件。会改动文件系统，标 write（默认需确认）。
 */
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { FluxTool } from "./types.js";

export const writeFileTool: FluxTool = {
  name: "write_file",
  description:
    "把一个字符串内容写入文件（覆盖）。目录不存在会自动创建。路径相对用户工作目录。写代码/文档用这个。",
  risk: "write",
  category: "code",
  parametersSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（相对工作目录）" },
      content: { type: "string", description: "要写入的完整内容" },
    },
    required: ["path", "content"],
  },
  async execute(args, ctx) {
    const path = String(args.path ?? "");
    const content = String(args.content ?? "");
    if (!path) return "错误：缺少 path 参数";
    const full = resolve(ctx.cwd, path);
    try {
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, "utf-8");
      return `已写入 ${path}（${content.length} 字符）`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `写入失败：${msg}`;
    }
  },
};
