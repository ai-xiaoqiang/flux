/**
 * 时光 Flux - 配置
 * 集中管理 API key、模型、端点地址与工作目录。
 *
 * 设计：chat 与 embedding 可独立配置——因为"一个 API key ≠ 全能"。
 *  - chat      必须有（对话命脉）
 *  - embedding 可选（知识库向量化）；不配时回退用 chat 的端点
 * 读取顺序：环境变量 > ~/.flux/config.json > 内置默认值。
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { normalizeMode, type ApprovalMode } from "./permission.js";

/** dashscope 的 OpenAI 兼容端点 —— 这就是"壳"通往"脑"的那根管子 */
const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3-coder-plus";

/** 一个模型端点（chat 或 embedding 通用） */
export interface ModelEndpoint {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface FluxConfig {
  /** 聊天端点（旧版平铺字段 = chat，向后兼容） */
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 可选：向量端点。没配时 embedding 回退用 chat 端点 */
  embedding?: ModelEndpoint;
  /** 项目工作目录，工具读写都相对它 */
  cwd: string;
  /** 审批模式 */
  approvalMode: ApprovalMode;
}

export function configPath() {
  return join(homedir(), ".flux", "config.json");
}

/** 配置文件里的原始形状（chat 用平铺字段，embedding 单独一块） */
interface FileConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  approvalMode?: string;
  embedding?: Partial<ModelEndpoint>;
}

/** 从 ~/.flux/config.json 读配置（支持 DASHSCOPE_API_KEY 环境变量覆盖） */
export function loadConfig(): FluxConfig {
  const fileCfg = loadConfigFile();
  const mode = process.env.FLUX_APPROVAL_MODE ?? fileCfg.approvalMode ?? "full";
  const chatKey = process.env.DASHSCOPE_API_KEY ?? fileCfg.apiKey ?? "";
  const chatBase = process.env.FLUX_BASE_URL ?? fileCfg.baseUrl ?? DASHSCOPE_BASE_URL;
  const chatModel = fileCfg.model ?? DEFAULT_MODEL;

  const embedding = fileCfg.embedding
    ? {
        provider: fileCfg.embedding.provider ?? "dashscope",
        apiKey: fileCfg.embedding.apiKey || chatKey, // 没填 key 就用 chat 的（dashscope 通用）
        baseUrl: fileCfg.embedding.baseUrl || DASHSCOPE_BASE_URL,
        model: fileCfg.embedding.model || "text-embedding-v3",
      }
    : undefined;

  return {
    apiKey: chatKey,
    baseUrl: chatBase,
    model: chatModel,
    embedding,
    cwd: process.cwd(),
    approvalMode: normalizeMode(mode),
  };
}

/** 把模型设置持久化到 ~/.flux/config.json（保留其它字段） */
export function saveModels(cfg: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  embedding?: ModelEndpoint | null;
}): void {
  mkdirSync(join(homedir(), ".flux"), { recursive: true });
  const existing = loadConfigFile();
  const next: FileConfig = { ...existing };
  if (cfg.apiKey !== undefined) next.apiKey = cfg.apiKey;
  if (cfg.baseUrl !== undefined) next.baseUrl = cfg.baseUrl;
  if (cfg.model !== undefined) next.model = cfg.model;
  if (cfg.embedding !== undefined) {
    if (cfg.embedding === null) delete next.embedding;
    else next.embedding = cfg.embedding;
  }
  writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf-8");
}

function loadConfigFile(): FileConfig {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    console.warn(`[flux] 配置文件解析失败，忽略: ${p}`);
    return {};
  }
}
