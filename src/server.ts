/**
 * 时光 Flux - 本地 Web 服务
 * 让浏览器成为时光机的第二个"前端"。
 * 核心：把 session 广播的事件，用 SSE(Server-Sent Events) 推给网页——
 * 浏览器只需要一个 <script> 用 EventSource 监听即可，简单可靠。
 */
import { createServer, type Server } from "node:http";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { saveModels, type FluxConfig } from "./config.js";
import { needsConfirm, APPROVAL_MODES, type ApprovalMode } from "./permission.js";
import { AgentSession, type SessionEvent } from "./session.js";
import { sceneRegistry } from "./scenes/index.js";
import { builtinRegistry, type FluxTool } from "./tools/index.js";
import { parseDocument } from "./ingest/documentParser.js";
import { fetchUrl } from "./ingest/fetchUrl.js";
import { listKb, deleteKb } from "./kb/store.js";
import { saveDoc } from "./kb/rag.js";
import { FluxModel } from "./model.js";
import {
  createConversation,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  titleFromMessages,
  type Conversation,
} from "./conversationStore.js";

/** 回 JSON 的小工具 */
function json(res: import("node:http").ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

/** 读完整请求体（原始字节） */
async function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** 权限状态（模块级；单实例服务器够用） */
let approvalMode: ApprovalMode = "full";
let currentId = ""; // 当前会话 id（多会话）
const pendingConfirms = new Map<string, { resolve: (v: boolean) => void; timer: NodeJS.Timeout }>();
/** 场景注册表（模块级，单实例服务器够用） */
const scenes = sceneRegistry();

/** 项目根目录：dist/server.js 的上一级就是 flux 根（public/ 在那里） */
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

export function startWebServer(config: FluxConfig, port: number): Server {
  // 一个常驻会话：浏览器里连着聊多句都共享历史（多轮记忆）
  const session = new AgentSession(config);
  // 多会话：挑最近的一个作为当前(重启后可接着聊)，否则新建一个
  approvalMode = config.approvalMode;
  // 启动：清理"没有任何内容"的空会话(避免"新对话"堆积)，只保留最近一个当当前
  const recent = listConversations();
  let chosen: Conversation | null = null;
  for (let i = 0; i < recent.length; i++) {
    const full = getConversation(recent[i].id);
    if (i === 0) {
      chosen = full; // 最近一个无论如何先留住
      continue;
    }
    if (!full || full.messages.length === 0) deleteConversation(recent[i].id);
  }
  if (chosen) {
    if (chosen.messages.length > 0) {
      session.restoreSnapshot(chosen.messages);
      console.log(`[flux] 恢复最近对话「${chosen.title}」(${chosen.messages.length} 条)`);
    }
    currentId = chosen.id;
  }
  if (!currentId) {
    const c = createConversation();
    currentId = c.id;
  }

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, session, port, config);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Error");
      }
      res.end();
    }
  });

  server.listen(port);
  return server;
}

/** 路由分发：/ 返回页面，/chat 走 SSE 推事件 */
async function handle(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  session: AgentSession,
  port: number,
  config: FluxConfig,
): Promise<void> {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // GET / —— 返回前端页面
    if (req.method === "GET" && url.pathname === "/") {
      const html = await readFile(join(PROJECT_ROOT, "public", "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    // 会话管理：GET /conversations(列表)  POST /conversations(新建)
    //  GET/DELETE /conversations/:id(载入/删除)
    if (url.pathname === "/conversations" && req.method === "GET") {
      // 列表里不显示"空会话"(标题新对话但没内容)，除非它正是当前会话
      const items = listConversations().filter(
        (c) => c.id === currentId || (getConversation(c.id)?.messages.length ?? 0) > 0,
      );
      json(res, 200, { ok: true, current: currentId, items });
      return;
    }
    if (url.pathname === "/conversations" && req.method === "POST") {
      // 当前会话若还是空的，直接复用它当"新对话"，避免空会话堆积
      const cur = currentId ? getConversation(currentId) : null;
      if (cur && cur.messages.length === 0) {
        session.reset();
        json(res, 200, { ok: true, id: cur.id, title: cur.title });
        return;
      }
      const c = createConversation();
      currentId = c.id;
      session.reset();
      json(res, 200, { ok: true, id: c.id, title: c.title });
      return;
    }
    if (url.pathname.startsWith("/conversations/") && req.method === "GET") {
      const id = url.pathname.slice("/conversations/".length);
      const conv = getConversation(id);
      if (!conv) {
        json(res, 404, { ok: false, error: "会话不存在" });
        return;
      }
      session.restoreSnapshot(conv.messages); // 载入该会话历史，接着聊
      currentId = id;
      json(res, 200, { ok: true, id: conv.id, title: conv.title, messages: conv.messages });
      return;
    }
    if (url.pathname.startsWith("/conversations/") && req.method === "DELETE") {
      const id = url.pathname.slice("/conversations/".length);
      deleteConversation(id);
      if (currentId === id) {
        const c = createConversation();
        currentId = c.id;
        session.reset();
      }
      json(res, 200, { ok: true });
      return;
    }
    // GET /reset —— 兼容旧调用：开个新对话（等价 POST /conversations）
    if (req.method === "GET" && url.pathname === "/reset") {
      const c = createConversation();
      currentId = c.id;
      session.reset();
      json(res, 200, { ok: true, id: c.id, title: c.title });
      return;
    }

    // /chat —— 建立 SSE 流，把这一轮的 session 事件推给网页
    // 支持两种入参：GET ?text=… （URL，小文本）；POST {text} （body，支持长文本/文档内容）
    if (url.pathname === "/chat" && (req.method === "GET" || req.method === "POST")) {
      let text = url.searchParams.get("text") ?? "";
      if (req.method === "POST") {
        try {
          const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
          text = body.text ?? "";
        } catch {
          res.writeHead(400);
          res.end("Bad Request: body must be JSON {text}");
          return;
        }
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // SSE 协议：每条消息是 `data: <json>\n\n`
      const push = (event: SessionEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      // 审批钩子：按当前模式判断要不要问；要问 → 推 confirm_request，挂起等 /confirm 答复
      const confirm = (tool: { name: string; risk: string }, args: Record<string, unknown>): Promise<boolean> => {
        if (!needsConfirm(approvalMode, tool.risk)) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          const id = randomUUID();
          const timer = setTimeout(() => {
            pendingConfirms.delete(id);
            resolve(false); // 60 秒没答复 = 拒绝
          }, 60_000);
          pendingConfirms.set(id, {
            resolve: (v) => {
              clearTimeout(timer);
              pendingConfirms.delete(id);
              resolve(v);
            },
            timer,
          });
          push({ type: "confirm_request", id, tool: tool.name, risk: tool.risk, args });
        });
      };
      try {
        await session.run(text, push, confirm);
        // 本轮跑完，存进"当前会话"文件（多会话；自动生成标题）
        const msgs = session.exportSnapshot();
        saveConversation(currentId, msgs, titleFromMessages(msgs) ?? undefined);
      } catch (err) {
        push({ type: "error", text: String(err) });
      }
      res.end();
      return;
    }

    // POST /upload?name=文件名 —— 接收文件原始字节，用文档解析层抽成文字
    if (req.method === "POST" && url.pathname === "/upload") {
      const name = url.searchParams.get("name") ?? "file";
      const bytes = await readBody(req);
      // 存到系统临时目录，保留原扩展名（解析层靠它识别类型）
      const tmpPath = join(tmpdir(), `flux-upload-${Date.now()}-${Math.random().toString(16).slice(2)}${extname(name)}`);
      await writeFile(tmpPath, bytes);
      try {
        const doc = await parseDocument(tmpPath, tmpdir());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, name, type: doc.type, chars: doc.text.length, text: doc.text }));
      } catch (err) {
        res.writeHead(422, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      } finally {
        unlink(tmpPath).catch(() => {}); // 用完即删临时文件
      }
      return;
    }

    // POST /fetch —— 抓取网址正文（拾光：给链接 → 抽文字）
    if (url.pathname === "/fetch" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
      const target = String(body.url ?? "").trim();
      if (!/^https?:\/\//i.test(target)) {
        json(res, 400, { ok: false, error: "url 需要以 http:// 或 https:// 开头" });
        return;
      }
      try {
        const page = await fetchUrl(target);
        json(res, 200, { ok: true, url: page.url, title: page.title, chars: page.text.length, text: page.text });
      } catch (err) {
        json(res, 422, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // POST /categorize —— 让模型给文档自动分类（一次独立小调用，不进对话）
    if (url.pathname === "/categorize" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
      const title = String(body.title ?? "");
      const text = String(body.text ?? "").slice(0, 4000); // 分类只看开头就够
      const categories = ["求职·面试题", "技术文档", "项目文档", "学习笔记", "简历·求职材料", "短视频素材", "工作资料", "其他"];
      try {
        const model = new FluxModel(config);
        const resp = await model.chat(
          [
            { role: "system", content: `你是文档分类器。请从这些分类里选出最合适的一个，只输出分类名：${categories.join("、")}` },
            { role: "user", content: `标题：${title}\n\n内容开头：\n${text}` },
          ],
          [],
        );
        const hit = categories.find((c) => resp.text.includes(c)) ?? "其他";
        json(res, 200, { ok: true, category: hit });
      } catch (err) {
        json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // 模型配置：GET /models(读当前)  POST /models(保存，重启生效)
    if (url.pathname === "/models" && req.method === "GET") {
      json(res, 200, {
        ok: true,
        chat: { baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey },
        embedding: config.embedding
          ? { provider: config.embedding.provider, baseUrl: config.embedding.baseUrl, model: config.embedding.model, apiKey: config.embedding.apiKey }
          : null,
      });
      return;
    }
    if (url.pathname === "/models" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
      try {
        saveModels({
          apiKey: body.chat?.apiKey ?? undefined,
          baseUrl: body.chat?.baseUrl ?? undefined,
          model: body.chat?.model ?? undefined,
          embedding: body.embedding ? body.embedding : null,
        });
        session.reloadModel(); // 立即生效：重建模型客户端(对话历史不受影响)
        json(res, 200, { ok: true, note: "已保存并立即生效" });
      } catch (err) {
        json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // 权限：GET /approval(读当前模式)  POST /approval(切换模式)
    if (url.pathname === "/approval" && req.method === "GET") {
      json(res, 200, { ok: true, mode: approvalMode });
      return;
    }
    if (url.pathname === "/approval" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
      if (APPROVAL_MODES.includes(body.mode)) {
        approvalMode = body.mode;
        json(res, 200, { ok: true, mode: approvalMode });
      } else {
        json(res, 400, { ok: false, error: `无效模式，可选：${APPROVAL_MODES.join("/")}` });
      }
      return;
    }
    // POST /confirm —— 网页弹窗后用户点允许/拒绝，答复挂起的请求
    if (url.pathname === "/confirm" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
      const pending = pendingConfirms.get(String(body.id ?? ""));
      if (!pending) {
        json(res, 404, { ok: false, error: "没有这个待确认请求（可能已超时）" });
        return;
      }
      pending.resolve(body.allow === true);
      json(res, 200, { ok: true });
      return;
    }

    // 场景工坊：GET /scenes —— 场景列表（含参数 schema，前端据此渲染表单）
    if (url.pathname === "/scenes" && req.method === "GET") {
      const items = scenes.all().map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon,
        paramsSchema: s.paramsSchema,
      }));
      json(res, 200, { ok: true, items });
      return;
    }
    // 场景运行：POST /scenes/:id/run —— SSE 流（同 /chat 风格），跑完附带 scene_result
    if (url.pathname.startsWith("/scenes/") && req.method === "POST") {
      const id = url.pathname.slice("/scenes/".length).replace(/\/run$/, "");
      const scene = scenes.get(id);
      if (!scene) {
        json(res, 404, { ok: false, error: "场景不存在" });
        return;
      }
      let params: Record<string, unknown> = {};
      try {
        const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
        params = body.params ?? {};
      } catch {
        /* 空参数 */
      }
      const missing = (scene.paramsSchema.required ?? []).filter((k) => !String(params[k] ?? "").trim());
      if (missing.length) {
        json(res, 400, { ok: false, error: `缺少必填参数：${missing.join("、")}` });
        return;
      }

      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      const push = (event: SessionEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      try {
        // 按场景声明的工具名，从内置注册表取（读类工具，无需审批）
        const tools = (scene.tools ?? [])
          .map((name) => builtinRegistry().get(name))
          .filter((t): t is FluxTool => !!t);
        const sceneSession = new AgentSession(config, {
          systemPrompt: scene.buildSystemPrompt(),
          tools,
        });
        await sceneSession.run(scene.buildTaskMessage(params), push);
        // 取最后一条 assistant 文本 → 解析结构化物料
        const snapshot = sceneSession.exportSnapshot();
        const last = [...snapshot]
          .reverse()
          .find((m) => m.role === "assistant" && typeof m.content === "string" && m.content.trim());
        const text = last && typeof last.content === "string" ? last.content : "";
        const data = text ? scene.parseOutput(text) : null;
        if (data) push({ type: "scene_result", data });
      } catch (err) {
        push({ type: "error", text: String(err) });
      }
      res.end();
      return;
    }

    // 知识库 API：GET /kb(列表)  POST /kb(存入)  DELETE /kb/:id(删除)
    if (url.pathname === "/kb" && req.method === "GET") {
      const items = listKb().map(({ id, title, type, category, createdAt }) => ({ id, title, type, category, createdAt }));
      json(res, 200, { ok: true, items });
      return;
    }
    if (url.pathname === "/kb" && req.method === "POST") {
      try {
        const body = JSON.parse((await readBody(req)).toString("utf-8") || "{}");
        // 存库即向量化：切块 + embedding，落库后可供语义检索
        const model = new FluxModel(config);
        const entry = await saveDoc(model, {
          title: String(body.title ?? "未命名"),
          type: String(body.type ?? "text"),
          category: String(body.category ?? "未分类"),
          content: String(body.content ?? ""),
        });
        json(res, 200, { ok: true, entry });
      } catch (err) {
        json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }
    if (url.pathname.startsWith("/kb/") && req.method === "DELETE") {
      const id = url.pathname.slice("/kb/".length);
      const deleted = deleteKb(id);
      json(res, deleted ? 200 : 404, { ok: deleted });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
}