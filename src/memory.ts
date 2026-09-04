/**
 * 时光 Flux - 记忆
 * 时光机本身没有记忆，所谓"记得"= 把重要的话写进一个 markdown 文件，
 * 每次起航(启动会话)时读出来拼进"航行手册"(system prompt)。
 * 这文件就是 wucai 的 WUCAI.md，只是改名叫时光自己的。
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

/** 记忆文件位置：~/.flux/memory.md（用户级，跨项目共享） */
const MEMORY_FILE = join(homedir(), ".flux", "memory.md");
/** 记忆在文件里的分区标题 */
const MEMORY_SECTION = "## 时光记得的事";

/** 读出全部记忆文本（没有就返回空串）。启动时会拼进 system prompt */
export function loadMemory(): string {
  if (!existsSync(MEMORY_FILE)) return "";
  try {
    return readFileSync(MEMORY_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

/** 追加一条记忆。如果文件里还没有分区标题，先写上再追加 */
export function addMemory(fact: string): void {
  const existing = existsSync(MEMORY_FILE) ? readFileSync(MEMORY_FILE, "utf-8") : "";
  if (!existing.includes(MEMORY_SECTION)) {
    // 文件不存在或还没这个分区 → 先补上头
    appendFileSync(MEMORY_FILE, existing ? `\n\n${MEMORY_SECTION}\n` : `${MEMORY_SECTION}\n`);
  }
  appendFileSync(MEMORY_FILE, `- ${fact.trim()}\n`);
}
