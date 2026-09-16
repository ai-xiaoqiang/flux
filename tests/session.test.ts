import { describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/session.js";
import type { FluxConfig } from "../src/config.js";
import type { FluxTool } from "../src/tools/types.js";

// stub 模型：不碰网络，记录 chat 收到的消息/工具
vi.mock("../src/model.js", () => ({
  FluxModel: class {
    chat = vi.fn(async () => ({
      text: "done",
      functionCalls: [],
      assistantMessage: { role: "assistant", content: "done" },
    }));
  },
}));

const fakeConfig: FluxConfig = {
  apiKey: "test-key",
  baseUrl: "https://example.com/v1",
  model: "test-model",
  cwd: process.cwd(),
  approvalMode: "full",
};

const fakeTool: FluxTool = {
  name: "fake_read",
  description: "fake",
  parametersSchema: { type: "object", properties: {} },
  risk: "read",
  execute: async () => "ok",
};

function chatCallsOf(s: AgentSession) {
  const model = (s as unknown as { model: { chat: ReturnType<typeof vi.fn> } }).model;
  return model.chat.mock.calls[0];
}

describe("AgentSession 场景化覆盖", () => {
  it("默认构造：快照为空，chat 收到默认人设 system", async () => {
    const s = new AgentSession(fakeConfig);
    expect(s.exportSnapshot()).toEqual([]);
    await s.run("hi", () => {});
    const [messages] = chatCallsOf(s);
    expect((messages[0] as { role: string }).role).toBe("system");
    expect((messages[0] as { content: string }).content).toContain("你是「时光」");
  });
  it("注入 systemPrompt：chat 首条 system 用注入的人设", async () => {
    const s = new AgentSession(fakeConfig, { systemPrompt: "【短视频工场】你是物料工厂" });
    await s.run("hi", () => {});
    const [messages] = chatCallsOf(s);
    expect((messages[0] as { content: string }).content).toBe("【短视频工场】你是物料工厂");
  });
  it("注入 tools：chat 只带子集工具", async () => {
    const s = new AgentSession(fakeConfig, { tools: [fakeTool] });
    await s.run("hi", () => {});
    const [, tools] = chatCallsOf(s);
    expect((tools as { name: string }[]).map((t) => t.name)).toEqual(["fake_read"]);
  });
});
