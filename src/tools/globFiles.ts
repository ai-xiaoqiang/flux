/**
 * 时光 Flux - 工具：glob 找文件
 * 扫代码第①招：按文件名/路径模式定位文件。先找到候选，再决定读谁。
 */
import fg from "fast-glob";
import type { FluxTool } from "./types.js";

export const globFilesTool: FluxTool = {
  name: "glob",
  description:
    "按文件名/路径模式查找文件，返回匹配路径列表。适合先定位代码再读取。支持 glob 语法，如 src/**\/*.ts、**\/*.test.ts、**\/*.py。",
  risk: "read",
  category: "code",
  parametersSchema: {
    type: "object",
    properties: { pattern: { type: "string", description: "glob 匹配模式，如 src/**\/*.ts" } },
    required: ["pattern"],
  },
  async execute(args, ctx) {
    const pattern = String(args.pattern ?? "");
    if (!pattern) return "错误：缺少 pattern 参数";
    try {
      const matched = await fg(pattern, {
        cwd: ctx.cwd,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.next/**"],
        onlyFiles: true,
      });
      const files = matched.slice(0, 100); // 最多返回 100 个，避免刷屏
      if (files.length === 0) return "没有匹配的文件";
      const more = matched.length > files.length ? `\n…(还有 ${matched.length - files.length} 个)` : "";
      return `找到 ${matched.length} 个文件：\n${files.join("\n")}${more}`;
    } catch (e) {
      return `glob 出错：${e instanceof Error ? e.message : String(e)}`;
    }
  },
};
