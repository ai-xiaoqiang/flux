/**
 * 时光 Flux - 知识库存储（Tier 1 最小版）
 * 就是一个 JSON 文件当库：能存、能列、能删。够"存库按钮"用。
 * 将来要检索/RAG，再在这个 store 上叠 T2/T3，不推翻重来。
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

/**
 * 向量压缩存储：1024 维 float 数组直接存 JSON 文本约 18KB/块，太大。
 * 改成 Float32Array 的二进制 → base64(约 5.5KB/块，小 ~3 倍)，检索时再解码。
 * vec 在存储里是 base64 字符串；兼容老数据(number[]数组)。
 */
export interface KbChunk {
  text: string;
  vec: string; // base64 编码的 Float32 向量（也可能是老格式 number[]，解码时兼容）
}

/** 一条知识库记录。chunks 是向量化后的小块(用于检索)；老数据可能没有 */
export interface KbEntry {
  id: string;
  title: string;
  type: string;      // pdf/docx/html/text/web…
  category: string;  // 用户/模型定的分类
  content: string;
  createdAt: string;
  chunks?: KbChunk[];
}

/** number[] → base64(Float32) */
export function vecToB64(vec: number[]): string {
  const buf = new Float32Array(vec);
  return Buffer.from(buf.buffer).toString("base64");
}

/** base64(Float32) → number[]（兼容老的 number[] 直接透传） */
export function vecFromB64(vec: string | number[]): number[] {
  if (typeof vec !== "string") return vec;
  const buf = Buffer.from(vec, "base64");
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

const DIR = join(homedir(), ".flux");
const FILE = join(DIR, "kb.json");

function loadAll(): KbEntry[] {
  if (!existsSync(FILE)) return [];
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveAll(entries: KbEntry[]): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(entries, null, 2), "utf-8");
}

/** 列出全部（含内容；列表页可只取部分字段） */
export function listKb(): KbEntry[] {
  return loadAll();
}

/** 存一条，返回带 id 的完整记录 */
export function addKb(entry: Omit<KbEntry, "id" | "createdAt">): KbEntry {
  const all = loadAll();
  const record: KbEntry = {
    ...entry,
    id: `kb-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  all.push(record);
  saveAll(all);
  return record;
}

/** 删一条 */
export function deleteKb(id: string): boolean {
  const all = loadAll();
  const next = all.filter((e) => e.id !== id);
  if (next.length === all.length) return false;
  saveAll(next);
  return true;
}
