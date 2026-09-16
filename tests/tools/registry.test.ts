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
