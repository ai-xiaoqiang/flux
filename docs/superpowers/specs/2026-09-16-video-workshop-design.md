# 短视频工场（场景工坊第一个场景）· 设计规格

> 日期：2026-09-16
> 状态：已与作者对齐（brainstorming 定稿，方案 A：轻量场景框架 + 短视频工场做第一个场景）

---

## 1. 背景与目标

README 路线图里「场景工坊逐个实现（面试冲刺 / 短视频工场 / 简历包装 …）」目前只是前端占位（`#view-scenario` 通用占位视图 + 8 个菜单项）。本期实现第一个真实场景 **短视频工场**：

输入一个主题，产出**可直接开拍的短视频物料包**：标题 / 口播文案 / 分镜 / 封面字 / 话题标签。可选从知识库检索参考素材（RAG），产出可一键复制、可存回知识库（分类「短视频素材」）。

同时沉淀一个**通用场景框架**（SceneDef 接口 + 场景注册表 + 场景化 Agent 运行），后续 面试冲刺 / 简历包装 等场景 = 各新增一个 SceneDef，前后端零改动。

## 2. 范围

本期做：
- 场景框架：`src/scenes/`（SceneDef 类型、SceneRegistry、index 组装）
- `session.ts` 支持注入自定义 systemPrompt 与工具子集（场景化运行，复用主循环/SSE）
- 短视频工场场景定义（参数 schema + 人设 prompt + 物料包 JSON 解析）
- 后端路由：`GET /scenes`、`POST /scenes/:id/run`（SSE）
- 前端：侧边栏「短视频工场」菜单项接真实视图（表单 + 物料卡 + 复制 + 存库）
- 测试基建：引入 vitest，为场景框架/短视频工场/注册表写单元测试（不调真实模型）
- 文档：README 场景段 + 路线图勾选 + DEMO 加演示步骤

本期不做（YAGNI）：
- 不接真实视频生成（即梦/可灵等）；只留 `SceneDef.integrations` 挂载点占位
- 不做场景的对话历史持久化（场景是一次性运行，不进 conversationStore）
- 不碰 Agent 新建/工作流编排（仍是占位视图）
- 不改 ROADMAP.md（那是 M0-M4 里程碑文档，场景不在其范畴）

## 3. 架构

```
前端(场景表单/物料卡)
   │ POST /scenes/:id/run (SSE 事件流)
   ▼
server.ts ── GET /scenes（场景列表：id/name/icon/paramsSchema）
   │  new AgentSession(config, { systemPrompt: scene.buildSystemPrompt(),
   │                            tools: [search_kb] })
   ▼
AgentSession（复用主循环：chat → 工具执行 → 回填 → 直到给出结论）
   │  工具：search_kb → kb/rag.ts → 素材库(可选参考)
   ▼
模型最终输出 JSON 物料包 → scene.parseOutput(text) → scene_result 事件
   ▼
前端渲染物料卡（标题/文案/分镜/封面字/标签）→ 复制 / 存知识库(复用 POST /kb)
```

设计要点：
- **脑壳分离不动**：场景不新写循环，`AgentSession` 加两个可选构造参数（systemPrompt、tools）即可注入场景人设与工具子集。
- **结构化输出**：场景 prompt 要求模型"只输出一个 json 代码块"；服务端用 `parseOutput` 解析，失败回退纯文本展示（模型输出不可控，必须兜底）。
- **可插拔工具**：SceneDef 声明自己需要的工具名（短视频工场 = `["search_kb"]`），服务端从 builtinRegistry 按名解析，场景不知道具体实现。
- **知识库可选**：`useKb=true` 时任务消息里要求先 search_kb；知识库为空/检索不到时 search_kb 返回提示，模型直接创作，不报错。

## 4. 数据结构

### SceneDef（场景契约，src/scenes/types.ts）

```ts
interface SceneDef {
  id: string;                      // 唯一 id，路由 /scenes/:id 用它
  name: string;                    // 展示名
  description: string;             // 一句话说明
  icon: string;                    // emoji
  paramsSchema: SceneParamsSchema; // 参数表单 JSON Schema（required 必填校验）
  buildSystemPrompt(): string;     // 场景人设+规则+输出格式（不含本次参数）
  buildTaskMessage(params): string;// 参数 → 这条任务的 user 消息
  parseOutput(text): object|null;  // 模型输出 → 结构化结果；失败 null（回退纯文本）
  tools?: string[];                // 运行时可用的内置工具名（默认 []）
  integrations?: Record<string, unknown>; // 预留：视频生成 API 等（本期空）
}
```

### 短视频物料包（模型输出 JSON，五字段）

```json
{
  "标题": "……",
  "口播文案": "第一句\n第二句……",
  "分镜": [ { "镜头": "画面描述", "旁白": "对应口播", "时长秒": 5 } ],
  "封面字": "……",
  "话题标签": ["……"]
}
```

解析规则：取第一个 fenced `json` 代码块 → JSON.parse → 校验五个 key 都在 → 返回对象；任一环节失败返回 null。

## 5. 执行流程

1. 前端收集参数：`topic`（必填）、`duration`（15/30/60，默认 30）、`platform`（抖音/视频号/B站，默认 抖音）、`useKb`（默认 true）
2. `POST /scenes/video-workshop/run`，body `{ params }`
3. 服务端：查场景（404）→ 必填校验（400）→ 建 sceneSession（注入 prompt + [search_kb]）
4. `session.run(buildTaskMessage(params), push)`：模型视情况先 search_kb 检索素材 → 再按 schema 输出 JSON 物料包（事件逐条 SSE 推送）
5. 跑完取最后一条 assistant 文本 → `parseOutput` → 成功推 `{type:"scene_result", data}`；失败无额外事件（前端拿 text 事件原样展示）
6. 前端收到 scene_result 渲染物料卡；「存入知识库」→ 复用 `POST /kb`（type:"text", category:"短视频素材"）

## 6. API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/scenes` | GET | 场景列表（id/name/description/icon/paramsSchema），前端据此渲染表单 |
| `/scenes/:id/run` | POST | SSE 流：body `{params}`；事件类型复用 SessionEvent，追加 `scene_result` |

`scene_result` 事件：`{ "type": "scene_result", "data": {物料包} }`（加入 session.ts 的 SessionEvent 联合类型）。

## 7. 前端

- 侧边栏「短视频工场」菜单项 `data-view` 由 `scenario` 改为 `scenario-video`（其余 7 个场景保持占位视图不变；nav 点击处理器无需改动——通用逻辑就是 `showView("view-"+data-view)`）
- 新视图 `#view-scenario-video`：标题/副标题 + 表单（主题 input、时长/平台 select、useKb checkbox、生成按钮）+ 输出容器
- 运行：fetch SSE 流（复用 /chat 的 reader 解析模式），处理 `scene_result` → `renderMaterial()` 物料卡（每字段一张卡 + 复制按钮；分镜逐镜头展示）+「存入知识库」按钮
- 复制用全局 `window._lastMaterial` + `copyField(field)`，避免内联 onclick 里拼内容导致引号转义问题
- 存库用现有 `POST /kb`，分类固定「短视频素材」，标题取物料包「标题」

## 8. 错误处理

| 情况 | 表现 |
|------|------|
| 场景 id 不存在 | 404 `{ok:false,error:"场景不存在"}` |
| 缺少必填参数 | 400 `{ok:false,error:"缺少必填参数：topic"}` |
| 模型输出解析失败 | 不推 scene_result；前端把 text 事件原样展示（纯文本兜底） |
| 知识库无素材/检索不到 | search_kb 返回提示文本，模型直接创作（不中断） |
| 模型/网络错误 | SSE 推 `{type:"error"}`，前端展示 ⚠️ |
| 存库失败 | 物料卡下方提示「失败：…」，不影响已生成的物料 |

## 9. 测试策略

- 新增 devDependency：vitest；`npm test` = `vitest run`
- 测试放仓库根 `tests/`（tsconfig include 只有 src，build 不会编译测试）
- 单测（全部 stub，不调真实模型）：
  - `tests/scenes/registry.test.ts`：注册/取/列/重复注册报错
  - `tests/scenes/videoWorkshop.test.ts`：parseOutput 合法/非法/缺字段、buildTaskMessage 参数透传、system prompt 含五字段
  - `tests/tools/registry.test.ts`：registryFromTools 子集构造
  - `tests/session.test.ts`：构造注入 systemPrompt/tools 后 exportSnapshot/restoreSnapshot 行为（构造不发起网络，可安全单测）
- 端到端：build + `curl /scenes` + 手动浏览器跑一次真实生成（需 API key）

## 10. 验收标准（DoD）

1. `npm run build` 通过（tsc 无错）；`npx vitest run` 全绿
2. `flux web` 启动后：侧边栏「场景工坊 → 短视频工场」进入真实表单页
3. 填主题点生成 → 出现物料卡（五字段齐全，分镜逐镜头）→ 各字段可复制 → 可存入知识库（出现在「知识库→列表」，分类短视频素材）
4. 不填主题点生成 → 前端提示"请先填写主题"（不发请求）
5. 给非法场景 id 调 `/scenes/xxx/run` → 404；缺 topic → 400
6. 知识库为空时生成也能成功（不报错）
7. `GET /scenes` 返回含 video-workshop 场景及参数 schema
8. README 场景段/路线图、DEMO 已更新

## 11. 预留（本期不做）

- `SceneDef.integrations`：视频生成 API（即梦/可灵）未来在这里声明；物料包可扩展 `video` 字段。本期只留类型挂载点，不写实现。
