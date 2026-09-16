# ⌛ 时光 Flux

> **AI 时代的时光机** —— 一台能在任意代码库、任务、代码历史中自由往返的 AI Agent。
> slogan：**Traverse Freely**

时光 Flux 是一个自研的 **AI 命令行 + 网页双端 Agent 平台**：用自然语言让 AI 读代码、改代码、跑命令、抓网页、读文档、建知识库、基于资料语义问答……并把这些能力组合成一个个"场景"（面试冲刺、短视频工场、简历包装…）。

> 状态：**开发中但已可日常用**。本地单机工具（数据全存你自己电脑），从 Agent 核心到带 RAG 的知识库、多会话、权限审批都已跑通。
> 想快速看效果？照着 [`DEMO.md`](./DEMO.md) 走一遍 3 分钟演示。

---

## 核心概念：壳 vs 脑

时光 Flux 本身没有"智能"——它是一个**编排壳**，真正的思考由**云端大模型**完成（默认为 `qwen3-coder-plus`，阿里云 DashScope OpenAI 兼容接口）。**聊天和向量化(embedding)可以分别配不同的 key 模型**——因为一个 API key 未必同时支持这两种能力。

```
你 → Flux壳(组装人设/记忆/工具/历史) → POST 云端模型 → 模型返回文字或"调工具"指令
      ↑                                                            ↓
      └──────────── 执行工具(读写/检索/抓取) → 结果回填 ───────────┘  (循环)
```

- **壳**（本仓库，TypeScript）：组 prompt、调模型、执行工具、循环、记忆、权限、界面
- **脑**（云端）：真正的理解、推理、写代码、算向量

## 已实现的功能

### 场景工坊（第一个场景：短视频工场）
- **短视频工场**：侧边栏「场景工坊 → 短视频工场」→ 填主题(必填)+时长/平台 → 产出可直接开拍的物料包：标题 / 口播文案 / 分镜 / 封面字 / 话题标签
- 可选「写作模板」：悬念故事型 / 干货清单型 / 情绪共鸣型 三种爆款骨架，不选则通用；模板是数据（`src/scenes/videoTemplates.ts`），加模板 = 加一条记录
- 可选从知识库检索参考素材（RAG）；每字段可一键复制；可存入知识库（分类「短视频素材」）
- 通用场景框架 `src/scenes/`：SceneDef 接口 + 场景注册表 + 场景化 Agent 运行，后续场景 = 新增一个 SceneDef
- 视频生成 API 已留挂载点（`SceneDef.integrations`），本期先做文案工场

### Agent 核心
- **主循环**：事件驱动 `while(调模型 → 要工具? → 执行 → 回填)`，界面(终端/网页)只订阅事件渲染
- **12 个内置工具**（注册表 + 风险分级 read/write/dangerous）
- **三层记忆**：会话内历史 · 跨会话 `~/.flux/memory.md` · **会话持久化**（重启可续聊）
- **权限审批三档**：full(全自动) / balanced(写自动,危险命令问) / strict(读写命令都问)，按 `工具.risk` 决策，审批做成可插拔钩子（终端 y/n、网页弹窗通用）

### 工具清单
| 工具 | 用途 | 风险 |
|------|------|------|
| `list_files` | 项目结构树（分析项目先看布局）| read |
| `glob` | 按文件名/路径找文件 | read |
| `grep` | 按关键词搜代码内容 | read |
| `read_many_files` | 一次批量读多个文件 | read |
| `read_file` | 读文本文件 | read |
| `read_document` | 解析并读文档(pdf/docx/html/文本) | read |
| `fetch_url` | 抓取网页正文 | read |
| `search_kb` | 知识库语义检索(RAG，含 rerank) | read |
| `write_file` | 写文件 | write |
| `save_memory` | 保存长期记忆 | write |
| `run_shell_command` | 执行 shell 命令 | dangerous |
| `current_time` | 报当前时间 | read |

### 知识库 & RAG
- **拾光**：抓网址 / 传文件，都能解析成文字并进知识库
- **文档解析层** `src/ingest/`：pdf / docx / html / 文本 按类型抽文字，超大自动截断
- **存库**：AI 自动分类 + 附件卡片 + 卡片网格列表 + 删除
- **RAG 完整链路**：
  - 切块：500 字 + 80 重叠
  - 向量化：云端 `text-embedding-v3`（1024 维），**压缩存储**(Float32→base64，省 ~3 倍)
  - 检索：向量余弦粗召回 → **`gte-rerank-v2` 精排** → 取最准段落 → 基于资料回答
  - rerank 失败自动降级回纯向量

### Web 界面
- **多会话管理**：新建 / 切换 / 删除 / 自动标题 / 空会话自动清理 / 历史回显
- **首页空状态**（豆包式：空对话居中引导 + 示例提问）
- **语音输入** 🎤（浏览器 Web Speech API）
- **文档上传** 📎 → 解析 → AI 分类 → 存知识库
- **权限审批弹窗**（strict/balanced 下危险操作弹窗让你决定）
- **模型配置**：聊天 / 向量模型可**独立配置**（各自 key/地址/模型），保存**立即生效**（无需重启）
- **场景工坊**：预制场景开箱即用——「短视频工场」输入主题产出 标题/口播文案/分镜/封面字/话题标签 物料包（可参考知识库、一键复制、存回知识库）；场景框架已沉淀，后续场景按 SceneDef 接口新增
- **外观**：6 套渐变 + 自定义图片背景（可调强度）
- 设置抽屉折叠分区

### 终端
`flux "问题"` 一次问答 · `echo | flux` 管道 · `flux` 交互对话(支持 /quit /clear，审批可 y/n) · `flux web` 起网页

---

## 技术栈

- **语言**：TypeScript (Node ≥ 20)
- **模型**：默认 qwen3-coder-plus 聊天 + text-embedding-v3 向量 + gte-rerank-v2 精排（可配置换）
- **解析**：pdf-parse · mammoth(docx) · cheerio(html) · fast-glob
- **前端**：单文件 HTML/CSS/JS（无构建链，`public/index.html`），SSE 实时推送

## 架构一览

```
src/
├── cli.ts               入口：flux 三种模式 + flux web
├── server.ts            本地 Web 服务：/chat(SSE) /upload /categorize /fetch
│                        /kb /conversations /approval /confirm /models
├── session.ts           Agent 主循环（只发事件=界面解耦）+ 快照/恢复/重载模型
├── conversationStore.ts 多会话存储（每会话一文件 ~/.flux/conversations/）
├── model.ts             chat/embedding/rerank 三能力，可各自配端点
├── config.ts            配置（chat + 可选 embedding，读/写 ~/.flux/config.json）
├── scenes/              场景工坊：SceneDef/注册表/短视频工场
├── permission.ts        权限策略（三档模式 × 工具风险）
├── prompt.ts / memory.ts / silence.ts
├── tools/               types(接口+风险+context) / registry / 12 个工具
├── ingest/              documentParser(文档) + fetchUrl(抓网页)
└── kb/                  store(压缩向量) / chunk(切块) / rag(检索+rerank)
public/index.html        网页前端（对话/多会话/上传/语音/权限/模型/外观）
DEMO.md                  3 分钟演示脚本
```

## 安装与启动

**前置**：Node.js ≥ 20；至少一个模型 API key（默认阿里云百炼 `DASHSCOPE_API_KEY`）

```bash
cd flux
npm install
npm run build            # 已含 chmod +x dist/cli.js
npm link                 # 可选：全局 flux 命令

# 配 key：写进 ~/.flux/config.json 或设环境变量
```

## 使用

```bash
flux "帮我运行 pwd"       # 一次问答
echo "列出文件" | flux    # 管道
flux                     # 交互对话
flux web                 # 网页版 → http://localhost:8787（推荐）
```

网页里能：开多个对话切换 · 语音 · 上传/抓取文档存知识库 · 问"基于我知识库…" · ⚙ 里配模型/权限/外观。

**改了代码怎么生效**：改 `public/index.html` 只刷新浏览器；改 `src/*.ts`：
```bash
kill $(lsof -tiTCP:8787 -sTCP:LISTEN) 2>/dev/null; npm run build && flux web
```

## 数据都在你本机

| 内容 | 位置 |
|------|------|
| 模型配置 / API key | `~/.flux/config.json` |
| 多会话对话 | `~/.flux/conversations/conv-*.json` |
| 跨会话记忆 | `~/.flux/memory.md` |
| 知识库（含压缩向量）| `~/.flux/kb.json` |
| 网页外观偏好 | 浏览器 localStorage |

## 路线图

- [x] M0-M3：主循环 / 12 工具 / 三层记忆 / 审批
- [x] 交互终端 / Web / 语音 / 多会话管理
- [x] 文档解析层 + 拾光(抓网址/传文件) + AI 分类
- [x] 知识库 RAG：切块 / embedding / 余弦粗召回 / **rerank 精排** / 向量压缩
- [x] 权限三档 + 网页审批弹窗
- [x] 模型配置（chat/embedding 独立 + 即时生效）
- [x] 首页空状态 / README / DEMO
- [x] 场景工坊：短视频工场（第一个场景：主题 → 物料包，可参考知识库/复制/存库）
- [ ] 场景工坊其余场景（面试冲刺 / 简历包装 / …）
- [ ] 剪贴板粘贴 / 上传文件独立页
- [ ] Agent 新建/列表、工作流编排
- [ ] 知识库 updateKb+去重 / reindex / 分页

## 声明

- 个人学习/作品用途；模型调用走你自己的 key，费用自理
- License: Apache-2.0
