/**
 * 时光 Flux - 工具：读取文档(带解析)
 * 比 read_file 更强：能解析 PDF / Word / 网页 / 文本，抽成文字给大脑。
 * 底层走文档解析层(documentParser)，以后加格式不用改这里。
 */
import { parseDocument } from "../ingest/documentParser.js";
import type { FluxTool } from "./types.js";

export const readDocumentTool: FluxTool = {
  name: "read_document",
  description:
    "读取并解析一个文档文件，返回其中的文字内容。支持 pdf、docx(Word)、html、以及所有文本文件。当用户要读文档/PDF/Word 时用它；读纯代码文件用 read_file 更合适。",
  risk: "read",
  category: "document",
  parametersSchema: {
    type: "object",
    properties: { path: { type: "string", description: "文档路径（相对工作目录）" } },
    required: ["path"],
  },
  async execute(args, ctx) {
    const path = String(args.path ?? "");
    if (!path) return "错误：缺少 path 参数";
    try {
      const doc = await parseDocument(path, ctx.cwd);
      return `【${doc.type} 文档：${doc.name}】\n\n${doc.text}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `解析失败：${msg}`;
    }
  },
};