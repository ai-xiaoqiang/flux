/**
 * 时光 Flux - 工具：读取文件
 * 时光机"看"文件的眼睛。只读不改，风险最低(read)。
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FluxTool } from "./types.js";

export const readFileTool: FluxTool = {
  name: "read_file",
  description:
    "读取一个文本文件的内容。路径相对用户工作目录。适合先读懂代码/文档再动手，或用行动代替猜测。",
  risk: "read",
  category: "code",
  parametersSchema: {
    type: "object",
    properties: { path: { type: "string", description: "文件路径（相对工作目录）" } },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = String(args.path ?? "");
    if (!path) return "错误：缺少 path 参数";
    try {
      const content = await readFile(resolve(ctx.cwd, path), "utf-8");
      return content.length > 0 ? content : "(文件为空)";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `读取失败：${msg}`;
    }
  },
};