/**
 * 时光 Flux - 文档解析层
 * 拾光的地基：不管喂进来 PDF / Word / 网页 / 纯文本，都抽成"一段文字"，
 * 让时光机(和未来的知识库)能读懂任何文档。
 *
 * 兼容性埋点：
 * - 每种格式一个函数，将来加新格式(如 xlsx/epub)就补一个分支
 * - 图片暂不在此(需要视觉模型)，单独走 qwen-vl，见 TODO
 */
import { readFile } from "node:fs/promises";
import { extname, basename, resolve } from "node:path";
import { load } from "cheerio";
import mammoth from "mammoth";

/** 抽取结果 */
export interface ParsedDocument {
  name: string;
  type: string;
  text: string;
}

/** 纯文本直接读的扩展名（代码/配置/笔记…） */
const TEXT_EXT = new Set([
  ".md", ".txt", ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs",
  ".json", ".yml", ".yaml", ".toml", ".xml", ".csv", ".log", ".sh", ".css",
]);

/** 单篇文档进上下文的上限（防超大 PDF 撑爆对话） */
const MAX_CHARS = 30000;

/** 解析入口：识别类型 → 分发给对应解析器 */
export async function parseDocument(filePath: string, cwd: string): Promise<ParsedDocument> {
  const full = resolve(cwd, filePath);
  const ext = extname(full).toLowerCase();
  const name = basename(full);

  if (ext === ".pdf") return { name, type: "pdf", text: truncate(await parsePdf(full)) };
  if (ext === ".docx") return { name, type: "docx", text: truncate(await parseDocx(full)) };
  if (ext === ".html" || ext === ".htm") return { name, type: "html", text: truncate(await parseHtml(full)) };
  if (TEXT_EXT.has(ext) || ext === "") {
    const text = await readFile(full, "utf-8");
    return { name, type: "text", text: truncate(text) };
  }
  throw new Error(`暂不支持 .${ext || "未知"} 文件（支持：文本、pdf、docx、html；图片需视觉模型，待实现）`);
}

async function parsePdf(full: string): Promise<string> {
  const buf = await readFile(full);
  // pdf-parse v2：导出的是 PDFParse 类。new PDFParse({ data: Uint8Array, verbosity }) → getText()
  const mod = (await import("pdf-parse")) as unknown as {
    PDFParse: new (opts: { data: Uint8Array; verbosity?: number }) => { getText(): Promise<unknown> };
  };
  const parser = new mod.PDFParse({ data: new Uint8Array(buf), verbosity: 0 });
  const out = (await parser.getText()) as { text?: string } | string;
  return (typeof out === "string" ? out : out.text ?? "").trim();
}

async function parseDocx(full: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: full });
  return result.value.trim();
}

async function parseHtml(full: string): Promise<string> {
  const html = await readFile(full, "utf-8");
  const $ = load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text || "(网页正文为空)";
}

function truncate(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + `\n…(内容过长已截断，共 ${text.length} 字符)` : text;
}