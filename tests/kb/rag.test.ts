import { describe, expect, it } from "vitest";
import { isKbCategoryAllowed } from "../../src/kb/rag.js";

describe("isKbCategoryAllowed（分类联动：存库分类决定哪些场景能引用）", () => {
  it("未设分类限制 → 允许引用全部分类（向后兼容）", () => {
    expect(isKbCategoryAllowed("技术文档", undefined)).toBe(true);
    expect(isKbCategoryAllowed("短视频素材", [])).toBe(true);
  });
  it("命中允许列表 → 允许", () => {
    expect(isKbCategoryAllowed("短视频素材", ["短视频素材"])).toBe(true);
    expect(isKbCategoryAllowed("求职·面试题", ["短视频素材", "求职·面试题"])).toBe(true);
  });
  it("不在允许列表 → 拒绝（场景搜不到，按 prompt 直接创作）", () => {
    expect(isKbCategoryAllowed("技术文档", ["短视频素材"])).toBe(false);
    expect(isKbCategoryAllowed("其他", ["短视频素材"])).toBe(false);
  });
});
