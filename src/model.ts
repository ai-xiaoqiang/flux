/**
 * 时光 Flux - 模型客户端
 * 时光机与"大脑"（云端大模型）之间的通信层。
 * 负责：把消息 + 工具说明书发出去 → 取回文字回复和"大脑想调哪个工具"的指令。
 */
import OpenAI from "openai";
import type { FluxConfig } from "./config.js";
import type { FluxTool } from "./tools/index.js";

/** 一条消息（大脑能理解的全部角色都覆盖了） */
export type FluxMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** 大脑一次回复的完整结果 */
export interface ModelResponse {
  /** 纯文字回复（没有工具调用时的答案） */
  text: string;
  /** 大脑想调用的工具（没调用时为空数组） */
  functionCalls: Array<{ name: string; args: Record<string, unknown>; callId: string }>;
  /** 大脑这次回复的原始消息，主循环需要原样塞回历史，工具结果才能接得上 */
  assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessage;
}

/** 把我们的工具接口翻译成大脑认识的 tools 格式 */
function toToolSpecs(tools: FluxTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parametersSchema },
  }));
}

export class FluxModel {
  private client: OpenAI;
  /** embedding 可能用独立的 key/地址/模型（用户未必一个 key 全能）；没配则复用 chat */
  private embedClient: OpenAI;
  private embedModel: string;

  constructor(private config: FluxConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
    const emb = config.embedding;
    if (emb && emb.apiKey && (emb.baseUrl !== config.baseUrl || emb.apiKey !== config.apiKey)) {
      this.embedClient = new OpenAI({ apiKey: emb.apiKey, baseURL: emb.baseUrl });
    } else {
      this.embedClient = this.client;
    }
    this.embedModel = emb?.model || "text-embedding-v3";
  }

  /** 向量化：把若干段文字转成向量（知识库检索用），走独立的 embedding 端点 */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const batch: string[] = [];
    const result: number[][] = [];
    for (const t of texts) {
      batch.push(t);
      if (batch.length >= 20) {
        result.push(...(await this.embedOnce(batch)));
        batch.length = 0;
      }
    }
    if (batch.length) result.push(...(await this.embedOnce(batch)));
    return result;
  }

  private async embedOnce(texts: string[]): Promise<number[][]> {
    const resp = await this.embedClient.embeddings.create({
      model: this.embedModel,
      input: texts,
    });
    return resp.data.map((d) => d.embedding);
  }

  /** 重排(rerank)：给 query + 若干候选文档，返回按相关度排序的结果(index 指向候选数组位置)。
   *  走 DashScope 独立的 rerank 端点(非 OpenAI 兼容)，模型 gte-rerank-v2。 */
  async rerank(
    query: string,
    documents: string[],
    topN = 5,
  ): Promise<Array<{ index: number; relevance_score: number }>> {
    if (documents.length === 0) return [];
    const key = this.config.embedding?.apiKey || this.config.apiKey; // rerank 走 dashscope，取可用的 dashscope key
    const resp = await fetch("https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gte-rerank-v2",
        input: { query, documents },
        parameters: { top_n: Math.min(topN, documents.length) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) throw new Error(`rerank 失败：HTTP ${resp.status}`);
    const data = (await resp.json()) as {
      output: { results: Array<{ index: number; relevance_score: number }> };
    };
    return data.output.results;
  }

  async chat(messages: FluxMessage[], tools: FluxTool[]): Promise<ModelResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      tools: toToolSpecs(tools),
    });

    const assistantMessage = completion.choices[0]?.message;
    if (!assistantMessage) throw new Error("模型没有返回任何内容");

    const text = assistantMessage.content ?? "";
    const functionCalls = (assistantMessage.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
      callId: tc.id,
    }));

    return { text, functionCalls, assistantMessage };
  }
}