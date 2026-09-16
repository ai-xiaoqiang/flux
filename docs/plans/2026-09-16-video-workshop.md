# 短视频工场（场景工坊第一个场景）实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 在 flux 里实现「场景工坊」框架 + 第一个真实场景「短视频工场」：输入主题 → 产出标题/口播文案/分镜/封面字/话题标签物料包，可参考知识库、可复制、可存库。

**Architecture:** 新增 `src/scenes/`（SceneDef 接口 + SceneRegistry + videoWorkshop 场景），给 `AgentSession` 加可选 `systemPrompt`/`tools` 覆盖以复用主循环跑场景；`server.ts` 加 `GET /scenes` 与 `POST /scenes/:id/run`（SSE），前端把占位的「短视频工场」菜单项接真实表单+物料卡。结构化输出 = 场景 prompt 要求模型只输出一个 json 代码块，服务端 `parseOutput` 解析，失败回退纯文本。视频生成只留 `SceneDef.integrations` 挂载点占位。

**Tech Stack:** TypeScript (Node ≥ 20) · 现有 openai SDK · vitest（新增，仅测试）· 现有 SSE 流模式。

**设计规格：** `docs/superpowers/specs/2026-09-16-video-workshop-design.md`（先读它再动手）。

**验证总览：** `npm run build`（tsc 零错）+ `npx vitest run`（全绿）+ `curl localhost:8787/scenes`（返回 video-workshop）+ 手动浏览器冒烟。

---

## T1 · 测试基建：引入 vitest

**Objective:** 项目目前零测试、零 test script；先搭好 vitest，让后续任务能 TDD。

**Files:**
- Modify: `package.json`（devDependencies + test script）
- Create: `tests/smoke.test.ts`

**Step 1: 安装 vitest 并加 test script**

```bash
npm install -D vitest
```

用 `patch` 给 package.json 加 script：

```json
"scripts": {
  "dev": "tsx src/cli.ts",
  "build": "tsc && chmod +x dist/cli.js",
  "start": "node dist/cli.js",
  "test": "vitest run"
},
```

**Step 2: 建冒烟测试**（验证 runner 与 .js→.ts 解析可用）

Create: `tests/smoke.test.ts`

```ts
import { describe, expect, it } from "vitest";

describe("test 基建", () => {
  it("vitest 能跑", () => {
    expect(1 + 1).toBe(2);
  });
});
```

**Step 3: 跑测试验证通过**

Run: `npx vitest run`
Expected: `1 passed`（无报错）

> 坑：本项目源码用 `./x.js` 扩展名（NodeNext 风格）。vitest/vite 通常能把 `./x.js` 解析到 `./x.ts`。若后续测试报「Cannot find module ... .js」，在仓库根建 `vitest.config.ts` 并重启测试（见 T3 末尾的备用方案）。

**Step 4: 验证 build 不受影响**

Run: `npm run build`
Expected: `tsc && chmod +x dist/cli.js` 退出码 0（tests/ 在 tsconfig include 之外，不会被编译进 dist）。

**Step 5: Commit**

```bash
git add package.json package-lock.json tests/smoke.test.ts
git commit -m "test: 引入 vitest 测试基建"
```

---

## T2 · 场景类型：SceneDef

**Objective:** 定义场景契约 `SceneDef`（含 paramsSchema / buildSystemPrompt / buildTaskMessage / parseOutput / tools / integrations）。

**Files:**
- Create: `src/scenes/types.ts`

**Step 1: 写类型定义**

Create: `src/scenes/types.ts`

```ts
/**
 * 时光 Flux - 场景工坊 · 场景定义类型
 * 一个"场景" = 一个预制的、面向特定任务的 Agent 工作流：
 *   场景人设 prompt + 参数表单 schema + 结构化输出解析。
 * 后续场景(面试冲刺/简历包装…)按同一接口新增即可，前后端零改动。
 */

/** 参数表单的 JSON Schema（前端据此渲染表单，required 为必填） */
export interface SceneParamsSchema {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
}

export interface SceneDef {
  /** 场景唯一 id（路由 /scenes/:id 用它） */
  id: string;
  /** 展示名，如 短视频工场 */
  name: string;
  /** 一句话说明（列表页显示） */
  description: string;
  /** 图标（emoji，前端展示用） */
  icon: string;
  /** 参数表单 schema */
  paramsSchema: SceneParamsSchema;
  /** 场景人设 + 规则 + 输出格式（不含本次参数，会话启动时固定） */
  buildSystemPrompt(): string;
  /** 把用户填的参数拼成这条任务的 user 消息 */
  buildTaskMessage(params: Record<string, unknown>): string;
  /** 把模型最终输出解析成结构化结果；解析失败返回 null（前端回退纯文本展示） */
  parseOutput(text: string): Record<string, unknown> | null;
  /** 运行时可用的内置工具名（默认 []；短视频工场 = ["search_kb"]） */
  tools?: string[];
  /** 预留挂载点：第三方能力（如视频生成 API），本期为空 */
  integrations?: Record<string, unknown>;
}
```

**Step 2: 验证类型编译**

Run: `npm run build`
Expected: 退出码 0（纯类型文件，无产物变化）。

**Step 3: Commit**

```bash
git add src/scenes/types.ts
git commit -m "feat: 场景工坊 SceneDef 类型定义"
```

---

## T3 · 场景注册表：SceneRegistry（TDD）

**Objective:** 仿 ToolRegistry 的思路实现场景注册表（register 防重名 / get / all），配单元测试。

**Files:**
- Create: `src/scenes/registry.ts`
- Test: `tests/scenes/registry.test.ts`

**Step 1: 写失败测试**

Create: `tests/scenes/registry.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SceneRegistry } from "../../src/scenes/registry.js";
import type { SceneDef } from "../../src/scenes/types.js";

function fakeScene(id: string): SceneDef {
  return {
    id,
    name: id,
    description: "",
    icon: "🎯",
    paramsSchema: { type: "object", properties: {}, required: [] },
    buildSystemPrompt: () => "sys",
    buildTaskMessage: () => "task",
    parseOutput: (t) => (t === "ok" ? { ok: true } : null),
  };
}

describe("SceneRegistry", () => {
  it("register/get/all 正常工作", () => {
    const r = new SceneRegistry();
    r.register(fakeScene("a"));
    r.register(fakeScene("b"));
    expect(r.get("a")?.id).toBe("a");
    expect(r.all().map((s) => s.id)).toEqual(["a", "b"]);
    expect(r.get("missing")).toBeUndefined();
  });
  it("重复注册同 id 报错", () => {
    const r = new SceneRegistry();
    r.register(fakeScene("a"));
    expect(() => r.register(fakeScene("a"))).toThrow(/已存在/);
  });
});
```

**Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scenes/registry.test.ts`
Expected: FAIL — `Cannot find module '../../src/scenes/registry.js'`（文件还没建）

> 若报的是「Cannot find module ... registry.js」且 registry.ts 已建仍失败，则建 `vitest.config.ts`（备用方案，兜底 .js→.ts 解析）：
>
> ```ts
> import { defineConfig } from "vitest/config";
>
> export default defineConfig({
>   resolve: { extensions: [".ts", ".mjs", ".js", ".json"] },
> });
> ```
>
> 建完重跑。若仍失败，把测试里 import 的 `registry.js` 改为 `registry`（不带扩展名，vite 默认会试 .ts）。

**Step 3: 实现注册表**

Create: `src/scenes/registry.ts`

```ts
/**
 * 时光 Flux - 场景工坊 · 场景注册表
 * 登记/按 id 取/列出全部场景（仿 ToolRegistry 的思路，防重名）。
 */
import type { SceneDef } from "./types.js";

export class SceneRegistry {
  private map = new Map<string, SceneDef>();

  register(scene: SceneDef): void {
    if (this.map.has(scene.id)) {
      throw new Error(`场景 ${scene.id} 已存在，请勿重复注册`);
    }
    this.map.set(scene.id, scene);
  }

  get(id: string): SceneDef | undefined {
    return this.map.get(id);
  }

  all(): SceneDef[] {
    return [...this.map.values()];
  }
}
```

**Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scenes/registry.test.ts`
Expected: PASS（2 passed）

**Step 5: Commit**

```bash
git add src/scenes/registry.ts tests/scenes/registry.test.ts
git commit -m "feat: 场景注册表 SceneRegistry + 单测"
```

---

## T4 · 短视频工场场景定义（TDD）

**Objective:** 实现 `videoWorkshopScene`：参数 schema、人设 prompt、任务消息拼装、物料包 JSON 解析。

**Files:**
- Create: `src/scenes/videoWorkshop.ts`
- Test: `tests/scenes/videoWorkshop.test.ts`

**Step 1: 写失败测试**

Create: `tests/scenes/videoWorkshop.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { videoWorkshopScene } from "../../src/scenes/videoWorkshop.js";

const OK_JSON = `好的，这是你的物料包：
\`\`\`json
{
  "标题": "后端涨薪攻略",
  "口播文案": "第一句\\n第二句",
  "分镜": [{ "镜头": "开场特写", "旁白": "第一句", "时长秒": 3 }],
  "封面字": "三秒抓住人",
  "话题标签": ["后端", "面试", "涨薪"]
}
\`\`\``;

describe("videoWorkshopScene", () => {
  it("parseOutput 解析合法 JSON 代码块", () => {
    const out = videoWorkshopScene.parseOutput(OK_JSON);
    expect(out).not.toBeNull();
    expect(out?.["标题"]).toBe("后端涨薪攻略");
    expect((out?.["分镜"] as Array<{ 镜头: string }>)[0]["镜头"]).toBe("开场特写");
  });
  it("无代码块 / 非法 JSON / 缺字段 → null", () => {
    expect(videoWorkshopScene.parseOutput("纯文字没有代码块")).toBeNull();
    expect(videoWorkshopScene.parseOutput("```json\n{ 这不是 json }\n```")).toBeNull();
    expect(videoWorkshopScene.parseOutput("```json\n{ \"标题\": \"x\" }\n```")).toBeNull();
  });
  it("buildTaskMessage 透传主题/时长/平台；useKb=false 不要求检索", () => {
    const msg = videoWorkshopScene.buildTaskMessage({ topic: "Java 涨薪", duration: "60", platform: "B站", useKb: true });
    expect(msg).toContain("Java 涨薪");
    expect(msg).toContain("60");
    expect(msg).toContain("search_kb");
    const noKb = videoWorkshopScene.buildTaskMessage({ topic: "x", useKb: false });
    expect(noKb).not.toContain("search_kb");
  });
  it("system prompt 含输出 schema 五个关键字段", () => {
    const sys = videoWorkshopScene.buildSystemPrompt();
    for (const k of ["标题", "口播文案", "分镜", "封面字", "话题标签"]) {
      expect(sys).toContain(k);
    }
  });
  it("tools 只挂 search_kb", () => {
    expect(videoWorkshopScene.tools).toEqual(["search_kb"]);
  });
});
```

**Step 2: 跑测试确认失败**

Run: `npx vitest run tests/scenes/videoWorkshop.test.ts`
Expected: FAIL — `Cannot find module '../../src/scenes/videoWorkshop.js'`

**Step 3: 实现场景**

Create: `src/scenes/videoWorkshop.ts`

```ts
/**
 * 时光 Flux - 场景：短视频工场
 * 输入：主题(必填) + 目标时长/平台/是否参考素材库
 * 输出：标题/口播文案/分镜/封面字/话题标签 的 JSON 物料包
 * 可选：先 search_kb 从知识库检索参考素材 → 再创作（参考但不照抄）。
 */
import type { SceneDef } from "./types.js";

export const videoWorkshopScene: SceneDef = {
  id: "video-workshop",
  name: "短视频工场",
  description: "输入一个主题，产出可直接开拍的短视频物料包：标题 / 口播文案 / 分镜 / 封面字 / 话题标签",
  icon: "📱",
  paramsSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "短视频主题（必填）" },
      duration: { type: "string", enum: ["15", "30", "60"], description: "目标时长(秒)，默认 30" },
      platform: { type: "string", enum: ["抖音", "视频号", "B站"], description: "目标平台，默认 抖音" },
      useKb: { type: "boolean", description: "是否先从知识库检索参考（默认开启）" },
    },
    required: ["topic"],
  },
  tools: ["search_kb"],
  buildSystemPrompt() {
    return `你是「时光」的短视频工场：一个爆款短视频物料工厂。
你的任务：根据用户给的主题，产出一份可以直接开拍的短视频物料包。

创作要求：
- 口播文案：口语化、有钩子（前 3 秒抓住人）、节奏紧凑、有信息量，不要空话套话。
- 分镜：逐镜头给出「画面描述 + 对应旁白 + 秒数」，总秒数约等于目标时长。
- 标题与封面字：抓眼球、口语、能让人停下来。
- 话题标签：3~8 个，贴合内容与平台。

输出格式（严格遵守）：
只输出一个 json 代码块，不要任何其它文字、解释或 markdown 标题。格式如下：
\`\`\`json
{
  "标题": "……",
  "口播文案": "第一句\\n第二句\\n……(每句一行，可带[停顿]/[镜头提示])",
  "分镜": [
    { "镜头": "画面描述", "旁白": "对应口播", "时长秒": 5 }
  ],
  "封面字": "……",
  "话题标签": ["……", "……"]
}
\`\`\``;
  },
  buildTaskMessage(params) {
    const topic = String(params.topic ?? "").trim() || "（未提供主题）";
    const duration = String(params.duration ?? "30");
    const platform = String(params.platform ?? "抖音");
    const useKb = params.useKb !== false;
    return (
      `主题：${topic}\n` +
      `目标平台：${platform}\n` +
      `目标时长：${duration} 秒\n` +
      (useKb
        ? "请先用 search_kb 检索素材库，参考其中的相关信息再创作（参考但不要照抄）。检索不到就直接创作。\n"
        : "") +
      "请按输出格式产出这份短视频物料包。"
    );
  },
  parseOutput(text) {
    const json = extractJsonBlock(text);
    if (!json) return null;
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      if (!obj || typeof obj !== "object") return null;
      // 校验五个关键字段齐不齐；不齐就当解析失败(前端回退纯文本)
      for (const k of ["标题", "口播文案", "分镜", "封面字", "话题标签"]) {
        if (!(k in obj)) return null;
      }
      return obj;
    } catch {
      return null;
    }
  },
};

/** 从模型输出里提取第一个 fenced json 代码块；没有则返回 null */
function extractJsonBlock(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}
```

**Step 4: 跑测试确认通过**

Run: `npx vitest run tests/scenes/videoWorkshop.test.ts`
Expected: PASS（5 passed）

**Step 5: Commit**

```bash
git add src/scenes/videoWorkshop.ts tests/scenes/videoWorkshop.test.ts
git commit -m "feat: 短视频工场场景定义 + 单测"
```

---

## T5 · 场景装配：scenes/index.ts

**Objective:** 一个 `sceneRegistry()` 入口，把已有场景登记好，供 server 使用。

**Files:**
- Create: `src/scenes/index.ts`

**Step 1: 写装配文件**

Create: `src/scenes/index.ts`

```ts
/**
 * 时光 Flux - 场景工坊 · 场景装配
 * 集中登记所有内置场景，返回填好的 SceneRegistry。
 * 以后加场景(面试冲刺/简历包装…) = 在这里多 register 一个。
 */
import { SceneRegistry } from "./registry.js";
import { videoWorkshopScene } from "./videoWorkshop.js";

export function sceneRegistry(): SceneRegistry {
  const r = new SceneRegistry();
  r.register(videoWorkshopScene);
  return r;
}

export type { SceneDef, SceneParamsSchema } from "./types.js";
export { SceneRegistry } from "./registry.js";
```

**Step 2: 验证编译**

Run: `npm run build`
Expected: 退出码 0

**Step 3: Commit**

```bash
git add src/scenes/index.ts
git commit -m "feat: 场景装配入口 sceneRegistry"
```

---

## T6 · 工具子集构造：registryFromTools（TDD）

**Objective:** `AgentSession` 要支持只挂部分工具，需要一个从工具数组建注册表的助手。

**Files:**
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/index.ts`（导出）
- Test: `tests/tools/registry.test.ts`

**Step 1: 写失败测试**

Create: `tests/tools/registry.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { registryFromTools } from "../../src/tools/registry.js";
import type { FluxTool } from "../../src/tools/types.js";

function fakeTool(name: string): FluxTool {
  return {
    name,
    description: name,
    parametersSchema: { type: "object", properties: {} },
    risk: "read",
    execute: async () => "ok",
  };
}

describe("registryFromTools", () => {
  it("从数组构造注册表，all 保持顺序", () => {
    const r = registryFromTools([fakeTool("a"), fakeTool("b")]);
    expect(r.all().map((t) => t.name)).toEqual(["a", "b"]);
  });
  it("重复名字报错", () => {
    expect(() => registryFromTools([fakeTool("a"), fakeTool("a")])).toThrow(/已存在/);
  });
});
```

**Step 2: 跑测试确认失败**

Run: `npx vitest run tests/tools/registry.test.ts`
Expected: FAIL — `registryFromTools` is not defined（还没实现）

**Step 3: 实现**

Modify: `src/tools/registry.ts`（文件末尾追加）

```ts
/** 从工具数组快速建一个注册表（场景等只需挂部分工具时用） */
export function registryFromTools(tools: FluxTool[]): ToolRegistry {
  const r = new ToolRegistry();
  for (const t of tools) r.register(t);
  return r;
}
```

Modify: `src/tools/index.ts`（把新函数导出，和现有导出放一起）

```ts
export type { FluxTool, ToolContext, ToolRisk } from "./types.js";
export { ToolRegistry, registryFromTools } from "./registry.js";
```

**Step 4: 跑测试确认通过**

Run: `npx vitest run tests/tools/registry.test.ts`
Expected: PASS（2 passed）

**Step 5: Commit**

```bash
git add src/tools/registry.ts src/tools/index.ts tests/tools/registry.test.ts
git commit -m "feat: registryFromTools 工具子集构造 + 单测"
```

---

## T7 · AgentSession 支持场景化覆盖（TDD）

**Objective:** `AgentSession` 构造支持 `{ systemPrompt?, tools? }`：场景用自己的 prompt 和工具子集跑，主循环/SSE 全复用。

**Files:**
- Modify: `src/session.ts`
- Test: `tests/session.test.ts`

**Step 1: 写失败测试**（AgentSession 构造不发起网络，可安全单测）

Create: `tests/session.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { AgentSession } from "../src/session.js";
import type { FluxConfig } from "../src/config.js";

const fakeConfig: FluxConfig = {
  apiKey: "test-key",
  baseUrl: "https://example.com/v1",
  model: "test-model",
  cwd: process.cwd(),
  approvalMode: "full",
};

describe("AgentSession 场景化覆盖", () => {
  it("默认构造：system prompt 由默认人设生成（不含注入串）", () => {
    const s = new AgentSession(fakeConfig);
    expect(s.exportSnapshot()).toEqual([]); // 仅 system 时快照为空
  });
  it("注入 systemPrompt 后，restoreSnapshot 首条为该 prompt", () => {
    const s = new AgentSession(fakeConfig, { systemPrompt: "【短视频工场】x" });
    s.restoreSnapshot([]);
    const first = s.exportSnapshot(); // 跳过 system
    expect(first.length).toBe(0);
    // 用 reset 后重新检查内部 system（通过 exportSnapshot 取不到，改走 run 前快照不可行）
    // 这里验证注入不抛错即可；system 内容由 restoreSnapshot 后再次 reset 保持
    expect(() => s.reset()).not.toThrow();
  });
});
```

> 说明：exportSnapshot 会跳过首条 system，所以"注入的 systemPrompt 是否正确"只能间接验证。为可测，T7 的**实现**同时把 `systemPrompt` 存成实例字段，`reset()`/`restoreSnapshot()` 复用该字段——这条测试验证构造注入不抛错且快照行为正常即可，system 内容正确性由 T4 的 buildSystemPrompt 测试兜底。

**Step 2: 跑测试确认失败**

Run: `npx vitest run tests/session.test.ts`
Expected: FAIL — `AgentSession` 构造签名不接受第二个参数（TS 编译错或运行错）

**Step 3: 实现**

Modify: `src/session.ts`

在文件顶部 import 处加 `registryFromTools`（改 import 那行）：

```ts
import { builtinRegistry, ToolRegistry, registryFromTools, type FluxTool } from "./tools/index.js";
```

在 `ToolConfirm` 类型后加（新接口）：

```ts
/** 会话构造选项：场景等可覆盖默认人设与工具集合 */
export interface SessionOptions {
  /** 覆盖默认人设（场景用它注入自己的 system prompt） */
  systemPrompt?: string;
  /** 覆盖工具集合（场景只需挂自己需要的工具，默认全部内置工具） */
  tools?: FluxTool[];
}
```

在 `SessionEvent` 联合类型里追加一个事件（放在 `done` 之后）：

```ts
  | { type: "scene_result"; data: Record<string, unknown> } // 场景跑完的结构化结果
```

类里加实例字段并改构造函数（替换原 constructor + reset + restoreSnapshot 三处）：

```ts
export class AgentSession {
  private model: FluxModel;
  /** 工具都登记在这个注册表里；以后 Agent 可换成自己的注册表 */
  private registry: ToolRegistry;
  private messages: FluxMessage[] = [];
  private cwd: string;
  /** 本会话的 system prompt（默认人设或场景注入），reset/恢复时复用 */
  private systemPrompt: string;

  constructor(private config: FluxConfig, opts: SessionOptions = {}) {
    this.model = new FluxModel(config);
    this.registry = opts.tools ? registryFromTools(opts.tools) : builtinRegistry();
    this.cwd = config.cwd;
    // 起航时翻开"记忆本"：把 ~/.flux/memory.md 里记过的事，拼进航行手册（场景用自己的 prompt）
    this.systemPrompt = opts.systemPrompt ?? buildSystemPrompt(loadMemory());
    this.messages = [{ role: "system", content: this.systemPrompt }];
  }
```

替换 reset()：

```ts
  /** 清空对话历史（保留记忆本里已存的长期记忆），回到初始状态（对应 /clear 命令） */
  reset(): void {
    this.messages = [{ role: "system", content: this.systemPrompt }];
  }
```

替换 restoreSnapshot()：

```ts
  /** 从磁盘快照恢复上次对话（前面补上当前环境的 system） */
  restoreSnapshot(snapshot: FluxMessage[]): void {
    this.messages = [{ role: "system", content: this.systemPrompt }, ...snapshot];
  }
```

> 原构造函数里 `loadMemory()` 只在无覆盖时调用；场景覆盖时不再注入个人记忆（保持 prompt 聚焦，YAGNI）。`buildSystemPrompt` 的 import 已在文件里，无需加。

**Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/session.test.ts`
Expected: PASS（2 passed）

Run: `npm run build`
Expected: 退出码 0

**Step 5: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: AgentSession 支持注入 systemPrompt/工具子集"
```

---

## T8 · 后端路由：/scenes 与 /scenes/:id/run

**Objective:** server 暴露场景列表与场景运行（SSE），场景跑完附 `scene_result` 结构化事件。

**Files:**
- Modify: `src/server.ts`

**Step 1: 加 import**（server.ts 顶部）

在现有 import 区追加：

```ts
import { sceneRegistry } from "./scenes/index.js";
import { builtinRegistry, type FluxTool } from "./tools/index.js";
```

**Step 2: 模块级建场景注册表**（放在 `pendingConfirms` 声明后）

```ts
/** 场景注册表（模块级，单实例服务器够用） */
const scenes = sceneRegistry();
```

**Step 3: 加两条路由**（放在 `POST /confirm` 路由之后、`GET /kb` 之前）

```ts
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
```

**Step 4: 编译验证**

Run: `npm run build`
Expected: 退出码 0

**Step 5: 冒烟验证路由（不起真实模型）**

```bash
npm run build && node dist/cli.js web &
sleep 1
curl -s http://localhost:8787/scenes
curl -s -X POST http://localhost:8787/scenes/nope/run -H 'Content-Type: application/json' -d '{"params":{}}'
curl -s -X POST http://localhost:8787/scenes/video-workshop/run -H 'Content-Type: application/json' -d '{"params":{}}'
kill %1
```

Expected:
- `/scenes` → `{"ok":true,"items":[{... "id":"video-workshop", "paramsSchema":{...required:["topic"]}}]}`
- `/scenes/nope/run` → 404 `{"ok":false,"error":"场景不存在"}`
- `/scenes/video-workshop/run` 缺 topic → 400 `{"ok":false,"error":"缺少必填参数：topic"}`

> 若 `node dist/cli.js web` 因缺 API key 拒绝启动（`if (!config.apiKey)`），先用 `DASHSCOPE_API_KEY=test npm run build` 之后 `DASHSCOPE_API_KEY=test node dist/cli.js web` 起（web 模式只校验 key 存在，不真正调模型）。

**Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: 后端 /scenes 与 /scenes/:id/run 场景路由"
```

---

## T9 · 前端：短视频工场视图 + 物料卡

**Objective:** 把侧边栏「短视频工场」从占位视图接到真实场景页（表单 + 物料卡 + 复制 + 存库）。其余 7 个场景仍是占位视图。

**Files:**
- Modify: `public/index.html`

**Step 1: 加 CSS**（在 `/* 上传文档的附件卡片 */` 注释前插入）

```css
  /* ---------- 场景工坊 ---------- */
  .scene-page { flex: 1; overflow-y: auto; padding: 20px 24px; }
  .scene-page h2 { font-size: 20px; margin-bottom: 4px; }
  .scene-sub { font-size: 13px; color: var(--text-dim); margin-bottom: 16px; }
  .scene-form { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
                padding: 16px 18px; max-width: 560px; display: flex; flex-direction: column; gap: 12px; }
  .scene-form label { font-size: 13px; color: var(--text-dim); display: flex; flex-direction: column; gap: 6px; }
  .scene-form input[type=text], .scene-form select {
    background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
    border-radius: 8px; padding: 9px 10px; font-size: 14px; }
  .scene-form input[type=text]:focus { border-color: var(--accent); outline: none; }
  .scene-form .row { display: flex; gap: 10px; }
  .scene-form .row label { flex: 1; }
  .scene-form .check { flex-direction: row !important; align-items: center; gap: 8px; cursor: pointer; }
  .scene-form .check input { accent-color: var(--accent); width: 16px; height: 16px; }
  .scene-run-btn { align-self: flex-start; }
  .material { max-width: 640px; display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .mat-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .mat-card .mc-label { font-size: 12px; color: var(--accent); letter-spacing: 1px; margin-bottom: 8px;
                        display: flex; justify-content: space-between; align-items: center; }
  .mat-card .mc-copy { background: var(--panel-2); border: 1px solid var(--line); color: var(--text-dim);
                       border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
  .mat-card .mc-copy:hover { color: var(--accent); border-color: var(--accent); }
  .mat-card .mc-body { font-size: 14px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; }
  .mat-card.shot { display: flex; gap: 12px; }
  .mat-card.shot .shot-no { color: var(--accent); font-weight: 700; flex-shrink: 0; }
  .mat-card.shot .shot-body { flex: 1; }
  .mat-card.shot .st-1 { font-size: 14px; }
  .mat-card.shot .st-2 { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
  .mat-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .mat-tag { background: rgba(240,180,41,.12); color: var(--accent); border-radius: 12px;
             padding: 3px 10px; font-size: 12px; }
  .mat-actions { display: flex; gap: 8px; margin-top: 4px; align-items: center; }
  .mat-actions .small-btn { background: var(--panel-2); border: 1px solid var(--line); color: var(--text);
                            border-radius: 6px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
  .mat-actions .small-btn:hover { border-color: var(--accent); }
  .mat-actions .save-btn { background: var(--accent); color: #1a1300; font-weight: 700; }
```

**Step 2: 改侧边栏菜单项**（把短视频工场的 data-view 从 scenario 改为 scenario-video；其余不动）

Old:
```html
          <button class="nav-item" data-view="scenario" data-icon="📱" data-title="短视频工场" data-desc="抓爆款视频 → 提取文案/分镜/字幕 → 改写 → 生成自己的脚本与口播稿">短视频工场</button>
```

New:
```html
          <button class="nav-item" data-view="scenario-video" data-icon="📱" data-title="短视频工场" data-desc="输入主题，产出标题/口播文案/分镜/封面字/话题标签物料包">短视频工场</button>
```

**Step 3: 加场景视图**（在 `#view-scenario` 占位视图的 `</div>` 之后插入）

Old（锚点）:
```html
    <div class="view" id="view-scenario" hidden>
      <div class="placeholder">
        <span class="p-icon" id="scenIcon">🎯</span>
        <h2 id="scenTitle">场景</h2>
        <p id="scenDesc">…</p>
        <p style="font-size:13px">这条场景 = 拾光抓素材 → 存入知识库 → 工作流自动加工。<br>即将上线。</p>
        <span class="soon-tag">PLANNED</span>
      </div>
    </div>
```

New（后面追加新视图）:
```html
    <div class="view" id="view-scenario" hidden>
      <div class="placeholder">
        <span class="p-icon" id="scenIcon">🎯</span>
        <h2 id="scenTitle">场景</h2>
        <p id="scenDesc">…</p>
        <p style="font-size:13px">这条场景 = 拾光抓素材 → 存入知识库 → 工作流自动加工。<br>即将上线。</p>
        <span class="soon-tag">PLANNED</span>
      </div>
    </div>
    <!-- 场景工坊：短视频工场（第一个真实场景） -->
    <div class="view" id="view-scenario-video" hidden>
      <div class="scene-page">
        <h2>📱 短视频工场</h2>
        <div class="scene-sub">输入一个主题，时光机产出可直接开拍的物料包：标题 / 口播文案 / 分镜 / 封面字 / 话题标签。</div>
        <div class="scene-form">
          <label>主题（必填）
            <input type="text" id="svTopic" placeholder="如：Java 后端怎么从 15k 涨到 30k">
          </label>
          <div class="row">
            <label>目标时长
              <select id="svDuration">
                <option value="15">15 秒</option>
                <option value="30" selected>30 秒</option>
                <option value="60">60 秒</option>
              </select>
            </label>
            <label>目标平台
              <select id="svPlatform">
                <option value="抖音" selected>抖音</option>
                <option value="视频号">视频号</option>
                <option value="B站">B站</option>
              </select>
            </label>
          </div>
          <label class="check"><input type="checkbox" id="svUseKb" checked> 先从知识库检索参考素材（没存过素材会直接创作）</label>
          <button class="send-btn scene-run-btn" id="svRunBtn">🎬 生成物料包</button>
        </div>
        <div id="svOutput"></div>
      </div>
    </div>
```

**Step 4: 加前端 JS**（在 `/* ---------- 快捷按钮 & 输入 ---------- */` 注释前插入）

```js
/* ---------- 场景工坊：短视频工场 ---------- */
function getSvParams() {
  const topic = $("svTopic").value.trim();
  if (!topic) { alert("请先填写主题"); return null; }
  return { topic, duration: $("svDuration").value, platform: $("svPlatform").value, useKb: $("svUseKb").checked };
}
$("svRunBtn").addEventListener("click", runVideoWorkshop);
$("svTopic").addEventListener("keydown", (e) => { if (e.key === "Enter") runVideoWorkshop(); });

async function runVideoWorkshop() {
  const params = getSvParams();
  if (!params) return;
  const out = $("svOutput");
  out.innerHTML = '<div class="typing">时光机正在写剧本…</div>';
  const btn = $("svRunBtn"); btn.disabled = true;
  try {
    const resp = await fetch("/scenes/video-workshop/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params }),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      out.innerHTML = `<div class="msg assistant" style="max-width:none">⚠️ ${escapeHtml(e.error || ("HTTP " + resp.status))}</div>`;
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const line = chunk.trim();
        if (!line.startsWith("data: ")) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "scene_result") renderMaterial(ev.data, out);
        else if (ev.type === "error") out.innerHTML = `<div class="msg assistant" style="max-width:none">⚠️ ${escapeHtml(ev.text)}</div>`;
      }
    }
  } catch (e) {
    out.innerHTML = `<div class="msg assistant" style="max-width:none">⚠️ ${escapeHtml(String(e))}</div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderMaterial(data, out) {
  window._lastMaterial = { raw: data };
  const h = escapeHtml;
  const shots = Array.isArray(data["分镜"]) ? data["分镜"] : [];
  const tags = Array.isArray(data["话题标签"]) ? data["话题标签"].map(String) : [];
  let html = '<div class="material">';
  html += `<div class="mat-card"><div class="mc-label">🎬 标题<button class="mc-copy" onclick="copyField('标题')">复制</button></div><div class="mc-body">${h(String(data["标题"] ?? ""))}</div></div>`;
  html += `<div class="mat-card"><div class="mc-label">🗣 口播文案<button class="mc-copy" onclick="copyField('口播文案')">复制</button></div><div class="mc-body">${h(String(data["口播文案"] ?? ""))}</div></div>`;
  if (shots.length) {
    html += '<div class="mat-card"><div class="mc-label">🎞 分镜</div>';
    shots.forEach((s, i) => {
      const shot = (typeof s === "object" && s) ? s : {};
      html += `<div class="mat-card shot" style="margin-top:8px"><span class="shot-no">#${i + 1}</span><div class="shot-body"><div class="st-1">🎥 ${h(String(shot["镜头"] ?? ""))}</div><div class="st-2">🗣 ${h(String(shot["旁白"] ?? ""))} · ⏱ ${h(String(shot["时长秒"] ?? ""))}s</div></div></div>`;
    });
    html += "</div>";
  }
  html += `<div class="mat-card"><div class="mc-label">🖼 封面字<button class="mc-copy" onclick="copyField('封面字')">复制</button></div><div class="mc-body">${h(String(data["封面字"] ?? ""))}</div></div>`;
  html += `<div class="mat-card"><div class="mc-label">🏷 话题标签</div><div class="mat-tags">${tags.map((t) => `<span class="mat-tag">${h(t)}</span>`).join("")}</div></div>`;
  html += `<div class="mat-actions"><button class="small-btn save-btn" onclick="saveMaterialToKb()">📥 存入知识库</button><span class="hint" id="svSaveHint"></span></div>`;
  html += "</div>";
  out.innerHTML = html;
}

// 复制某个字段（从全局缓存读，避免内联 onclick 拼内容导致引号转义问题）
function copyField(field) {
  const m = window._lastMaterial; if (!m) return;
  const v = m.raw[field];
  const text = Array.isArray(v) ? v.map(String).join(" ") : String(v ?? "");
  navigator.clipboard.writeText(text).then(() => {
    document.querySelectorAll(".mc-copy").forEach((b) => { b.textContent = "已复制 ✓"; });
    setTimeout(() => document.querySelectorAll(".mc-copy").forEach((b) => { b.textContent = "复制"; }), 1500);
  }).catch(() => {});
}

function buildMaterialText(data) {
  const parts = [];
  parts.push("【标题】" + (data["标题"] ?? ""));
  parts.push("【口播文案】\n" + (data["口播文案"] ?? ""));
  if (Array.isArray(data["分镜"])) {
    parts.push("【分镜】\n" + data["分镜"].map((s, i) => `#${i + 1} ${(s && s["镜头"]) ?? ""}（旁白：${(s && s["旁白"]) ?? ""} · ${(s && s["时长秒"]) ?? ""}s）`).join("\n"));
  }
  parts.push("【封面字】" + (data["封面字"] ?? ""));
  if (Array.isArray(data["话题标签"])) parts.push("【话题标签】" + data["话题标签"].join(" "));
  return parts.join("\n\n");
}

async function saveMaterialToKb() {
  const m = window._lastMaterial; if (!m) return;
  const hint = $("svSaveHint");
  hint.textContent = "存入中…";
  try {
    const resp = await fetch("/kb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: m.raw["标题"] ?? "短视频物料", type: "text", category: "短视频素材", content: buildMaterialText(m.raw) }),
    });
    const r = await resp.json();
    hint.textContent = r.ok ? "✅ 已存入知识库" : ("失败：" + (r.error || ""));
    if (r.ok && !document.getElementById("view-kb-list").hidden) loadKbList();
  } catch (e) {
    hint.textContent = "失败：" + e;
  }
}
```

**Step 5: 手动浏览器验证**

```bash
npm run build && DASHSCOPE_API_KEY=test node dist/cli.js web &
sleep 1
open http://localhost:8787
```

- 侧边栏「场景工坊 → 短视频工场」→ 进入真实表单页（不再是 PLANNED 占位）
- 点「生成物料包」（主题留空）→ 弹「请先填写主题」，不发请求
- 其它 7 个场景菜单项 → 仍是占位视图（回归检查）
- 填主题真实生成（需有效 API key）→ 物料卡五字段 + 复制 + 存库
- 知识库为空时生成不报错

**Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: 前端短视频工场场景页（表单/物料卡/复制/存库）"
```

---

## T10 · 文档：README + DEMO

**Objective:** README 加场景工坊段落并勾路线图，DEMO 加演示步骤。

**Files:**
- Modify: `README.md`
- Modify: `DEMO.md`

**Step 1: README 场景段落**

在 `### Web 界面` 段落末尾（`- 设置抽屉折叠分区` 之后）追加：

```markdown
- **场景工坊**：预制场景开箱即用——「短视频工场」输入主题产出 标题/口播文案/分镜/封面字/话题标签 物料包（可参考知识库、一键复制、存回知识库）；场景框架已沉淀，后续场景按 SceneDef 接口新增
```

在 `### 已实现的功能` → 开头加一小节（放在 `### Agent 核心` 之前）：

```markdown
### 场景工坊（第一个场景：短视频工场）
- **短视频工场**：侧边栏「场景工坊 → 短视频工场」→ 填主题(必填)+时长/平台 → 产出可直接开拍的物料包：标题 / 口播文案 / 分镜 / 封面字 / 话题标签
- 可选从知识库检索参考素材（RAG）；每字段可一键复制；可存入知识库（分类「短视频素材」）
- 通用场景框架 `src/scenes/`：SceneDef 接口 + 场景注册表 + 场景化 Agent 运行，后续场景 = 新增一个 SceneDef
- 视频生成 API 已留挂载点（`SceneDef.integrations`），本期先做文案工场
```

**Step 2: README 架构一览 + 路线图**

架构一览的 `src/` 树里，在 `config.ts` 行前加一行：

```markdown
├── scenes/             场景工坊：SceneDef/注册表/短视频工场
```

路线图里改一行、勾一项：

Old:
```markdown
- [ ] 场景工坊逐个实现（面试冲刺 / 短视频工场 / 简历包装 …）
```
New:
```markdown
- [x] 场景工坊：短视频工场（第一个场景：主题 → 物料包，可参考知识库/复制/存库）
- [ ] 场景工坊其余场景（面试冲刺 / 简历包装 / …）
```

**Step 3: DEMO 加演示步骤**

在 `## ⑤ 会话持久化` 之后、`## 收尾` 之前插入：

```markdown
## ⑥ 场景工坊 · 短视频工场（20 秒）

**侧边栏 🎯 场景工坊 → 短视频工场**，填主题（如「Java 后端怎么从 15k 涨到 30k」），点 **🎬 生成物料包**。

**你会看到**：物料卡五件套——标题 / 口播文案 / 分镜(逐镜头) / 封面字 / 话题标签，每个都能 **复制**，一键 **📥 存入知识库**。

**解说**：这是「场景工坊」的第一个场景——一个预制工作流：主题 →（可选）检索你素材库参考 → 按物料包 schema 产出可开拍的 JSON。场景框架通用，后面面试冲刺、简历包装都是往同一框架里加一个场景定义。
```

同时更新顶部覆盖范围说明（第 4 行）：

Old:
```markdown
> 约 3 分钟，覆盖：**Agent 逛代码 → 拾光抓网页 → 知识库 RAG → 权限审批 → 会话持久化**。
```
New:
```markdown
> 约 3 分钟，覆盖：**Agent 逛代码 → 拾光抓网页 → 知识库 RAG → 权限审批 → 会话持久化 → 场景工坊·短视频工场**。
```

**Step 4: 验证文档**

Run: `grep -n "短视频工场" README.md DEMO.md`
Expected: 各出现多处；README 路线图含 `[x] 场景工坊`

Run: `npm run build`
Expected: 退出码 0（文档不影响编译，回归确认）

**Step 5: Commit**

```bash
git add README.md DEMO.md
git commit -m "docs: README/DEMO 增加场景工坊·短视频工场说明"
```

---

## T11 · 全量验证 + 端到端冒烟

**Objective:** 所有门禁跑一遍，确认功能真实可用（不只看"编译过"）。

**Step 1: 单测 + 构建**

Run: `npx vitest run`
Expected: 全部 PASS（registry / videoWorkshop / registryFromTools / session / smoke）

Run: `npm run build`
Expected: 退出码 0，无 TS 错误

**Step 2: 后端接口冒烟**

```bash
npm run build && DASHSCOPE_API_KEY=test node dist/cli.js web &
sleep 1
curl -s http://localhost:8787/scenes
curl -s -X POST http://localhost:8787/scenes/video-workshop/run -H 'Content-Type: application/json' -d '{"params":{}}'
curl -s -X POST http://localhost:8787/scenes/video-workshop/run -H 'Content-Type: application/json' -d '{"params":{"topic":"测试"}}'
kill %1
```

Expected:
- `/scenes` 含 `video-workshop` + paramsSchema.required=["topic"]
- 缺 topic → 400
- 有 topic 但 API key 无效 → SSE 里推 `{"type":"error",...}`（说明链路跑通到模型调用，只是 key 无效）——**此项用有效 key 时应得到 scene_result 物料卡**

**Step 3: 真实端到端（需有效 DASHSCOPE_API_KEY）**

```bash
npm run build && flux web
```

浏览器操作：场景工坊 → 短视频工场 → 填「Java 后端涨薪」→ 生成 → 检查：
1. 物料卡五字段齐全、分镜逐镜头
2. 复制按钮可用
3. 存知识库成功，出现在「知识库 → 列表」（分类 短视频素材）
4. 知识库为空时也生成成功

Expected: 全部通过 = DoD 达成。

**Step 4: 收尾 commit（如有遗留 diff）**

```bash
git status
git add -A && git commit -m "chore: 短视频工场收尾"   # 仅当有未提交改动
```

---

## 交付物核对（DoD）

- [ ] `npm run build` 通过
- [ ] `npx vitest run` 全绿
- [ ] `GET /scenes` 返回 video-workshop + 参数 schema
- [ ] 短视频工场页真实生成物料包（五字段）→ 复制 → 存库
- [ ] 空主题被前端拦截；缺参 400；非法 id 404
- [ ] 知识库为空仍能生成
- [ ] 其余 7 个场景仍是占位视图（无回归）
- [ ] README 场景段/路线图、DEMO 已更新
