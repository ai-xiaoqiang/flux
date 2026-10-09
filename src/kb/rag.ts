/**
 * 时光 Flux - 知识库 RAG（向量检索）
 * Tier2：存文档时切成块 → 云端 embedding → 带向量落库；
 *       提问时把 query 也 embedding → 余弦相似度找最相关的几块。
 * 全程靠云端 embedding API(和聊天同一条路)，本地不装任何向量库。
 */
import { chunkText } from "./chunk.js";
import { addKb, listKb, vecToB64, vecFromB64, type KbEntry } from "./store.js";

/** 只要会 embed 就能用（FluxModel 满足；工具 ctx.model 也满足，避免耦合具体类） */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  rerank?(query: string, documents: string[], topN?: number): Promise<Array<{ index: number; relevance_score: number }>>;
}

/** 存一条文档，自动切块 + 向量化 */
export async function saveDoc(
  model: Embedder,
  input: { title: string; type: string; category: string; content: string },
): Promise<KbEntry> {
  const chunkTexts = chunkText(input.content);
  const vecs = chunkTexts.length ? await model.embed(chunkTexts) : [];
  const chunks = chunkTexts.map((text, i) => ({ text, vec: vecToB64(vecs[i] ?? []) }));
  return addKb({ ...input, chunks });
}

/** 一条检索命中 */
export interface KbHit {
  score: number;
  title: string;
  category: string;
  text: string;
}

/** 分类联动判定：categories 为空/未设 = 允许引用全部分类；否则必须命中允许列表 */
export function isKbCategoryAllowed(category: string, categories?: string[]): boolean {
  return !categories || categories.length === 0 || categories.includes(category);
}

/** 语义检索（两段式）：向量粗召回 → rerank 精排(若模型支持)。rerank 失败自动退回纯向量。
 *  categories 可选：只检索这些分类的文档（分类联动：场景声明可引用的分类，存库时打的标签决定谁能引用它）。 */
export async function searchKb(model: Embedder, query: string, k = 4, categories?: string[]): Promise<KbHit[]> {
  const [qvec] = await model.embed([query]);
  const scored: KbHit[] = [];
  for (const doc of listKb()) {
    if (!isKbCategoryAllowed(doc.category, categories)) continue; // 分类联动：跳过场景不允许引用的分类
    for (const c of doc.chunks ?? []) {
      if (!c.vec || c.vec.length === 0) continue;
      scored.push({ score: cosine(qvec, vecFromB64(c.vec)), title: doc.title, category: doc.category, text: c.text });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  // 精排：拿向量粗召回的更多候选，交给 cross-encoder 精确重排
  if (model.rerank && scored.length > 0) {
    const RECALL = Math.max(k * 3, 10);
    const recall = scored.slice(0, RECALL);
    try {
      const rr = await model.rerank(
        query,
        recall.map((r) => r.text),
        k,
      );
      // rerank 结果按 index 对应回 recall，score 用精排分数
      return rr.map((r) => ({ ...recall[r.index], score: r.relevance_score }));
    } catch {
      return recall.slice(0, k); // rerank 挂了退回向量结果
    }
  }
  return scored.slice(0, k);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
