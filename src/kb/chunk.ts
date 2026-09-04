/**
 * 时光 Flux - 文本切块
 * 向量检索前要把长文档切成小块(带重叠，避免切断语义)。每块单独向量化。
 */
export function chunkText(text: string, size = 500, overlap = 80): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + size, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}
