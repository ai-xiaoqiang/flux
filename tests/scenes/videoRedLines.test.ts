import { describe, expect, it } from "vitest";
import { getRedLines, VIDEO_PLATFORM_RED_LINES } from "../../src/scenes/videoRedLines.js";

describe("videoRedLines", () => {
  it("平台数据至少含 通用 + 抖音/视频号/B站", () => {
    const platforms = VIDEO_PLATFORM_RED_LINES.map((p) => p.platform);
    for (const name of ["通用", "抖音", "视频号", "B站"]) {
      expect(platforms).toContain(name);
    }
  });
  it("getRedLines(抖音) 含通用条款与抖音特色条款", () => {
    const lines = getRedLines("抖音");
    expect(lines.some((l) => l.includes("绝对化用语"))).toBe(true); // 通用红线
    expect(lines.some((l) => l.includes("事实真实性"))).toBe(true);  // 通用：不伪造/经得起推敲
    expect(lines.some((l) => l.includes("资质认证"))).toBe(true);   // 抖音财经特色
  });
  it("getRedLines(B站) 含站外导流条款", () => {
    const lines = getRedLines("B站");
    expect(lines.some((l) => l.includes("站外导流"))).toBe(true);
  });
  it("未知平台回退到通用（不含平台特色条款）", () => {
    const lines = getRedLines("不存在");
    expect(lines.some((l) => l.includes("资质认证"))).toBe(false);
    expect(lines.some((l) => l.includes("绝对化用语"))).toBe(true);
  });
  it("空参数只返回通用", () => {
    const lines = getRedLines();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes("站外导流"))).toBe(false);
  });
});
