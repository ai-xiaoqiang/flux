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
