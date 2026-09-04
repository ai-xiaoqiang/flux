/**
 * 时光 Flux - 会话存储（多会话版）
 * 每个对话存成一个文件：~/.flux/conversations/conv-<id>.json
 * 能开多个对话、列表、切换、续聊——侧边栏"最近对话"的数据来源。
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import type { FluxMessage } from "./model.js";

const DIR = join(homedir(), ".flux", "conversations");

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: FluxMessage[]; // 不含 system（重启按环境重建）
}

export type ConversationMeta = Omit<Conversation, "messages">;

function ensureDir(): void {
  mkdirSync(DIR, { recursive: true });
}
function pathOf(id: string): string {
  return join(DIR, `${id}.json`);
}
function now(): string {
  return new Date().toISOString();
}
function genId(): string {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

/** 新建一个空会话 */
export function createConversation(): Conversation {
  ensureDir();
  const c: Conversation = { id: genId(), title: "新对话", createdAt: now(), updatedAt: now(), messages: [] };
  writeFileSync(pathOf(c.id), JSON.stringify(c), "utf-8");
  return c;
}

/** 列出所有会话（按最近更新排序），只带元信息 */
export function listConversations(): ConversationMeta[] {
  ensureDir();
  const items: ConversationMeta[] = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(readFileSync(join(DIR, f), "utf-8"));
      items.push({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt });
    } catch {
      /* 跳过坏文件 */
    }
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return items;
}

/** 读一个会话的完整内容 */
export function getConversation(id: string): Conversation | null {
  try {
    return JSON.parse(readFileSync(pathOf(id), "utf-8"));
  } catch {
    return null;
  }
}

/** 保存/更新一个会话（保留 createdAt，刷新 updatedAt） */
export function saveConversation(id: string, messages: FluxMessage[], title?: string): void {
  ensureDir();
  const existing = getConversation(id);
  const conv: Conversation = {
    id,
    title: title || existing?.title || "新对话",
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
    messages,
  };
  writeFileSync(pathOf(id), JSON.stringify(conv), "utf-8");
}

export function deleteConversation(id: string): boolean {
  const p = pathOf(id);
  if (existsSync(p)) {
    unlinkSync(p);
    return true;
  }
  return false;
}

/** 从消息里取一句当标题（第一条用户消息，截断） */
export function titleFromMessages(msgs: FluxMessage[]): string | null {
  const firstUser = msgs.find((m) => m.role === "user" && typeof m.content === "string" && m.content.trim());
  if (!firstUser || typeof firstUser.content !== "string") return null;
  const t = firstUser.content.replace(/\s+/g, " ").trim();
  return t.length > 24 ? t.slice(0, 24) + "…" : t;
}