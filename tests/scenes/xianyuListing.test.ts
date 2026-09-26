import { describe, expect, it } from "vitest";
import { xianyuListingScene } from "../../src/scenes/xianyuListing.js";

const OK_JSON = `这是你的闲鱼文案：
\`\`\`json
{
  "标题": "iPhone14Pro 256G 远峰蓝 99新 国行 双卡 电池92",
  "转卖原因": "换 15 Pro 了，这部出掉回血",
  "产品卖点": ["电池健康92%耐用", "国行双卡全网通", "无拆无修无暗病", "原装配件都在"],
  "款式": "iPhone 14 Pro 256G 远峰蓝 国行 双卡 电池92%",
  "购买须知": "可小刀，顺丰包邮，同城可自提，售出不退换"
}
\`\`\``;

const OK_JSON_WITH_CHECK = `修订版：
\`\`\`json
{
  "标题": "iPhone14Pro 256G 远峰蓝 99新 国行 双卡",
  "转卖原因": "换 15 Pro 了，这部出掉回血",
  "产品卖点": ["电池健康92%", "国行双卡", "无拆无修"],
  "款式": "iPhone 14 Pro 256G 远峰蓝",
  "购买须知": "可小刀，顺丰包邮",
  "自检": [
    { "要点": "真实性", "通过": true, "说明": "成色与输入一致" },
    { "要点": "红线合规", "通过": true, "说明": "无导流无违禁" },
    { "要点": "标题吸引力", "通过": true, "说明": "关键词堆叠" }
  ]
}
\`\`\``;

describe("xianyuListingScene", () => {
  it("parseOutput 解析合法 JSON 代码块", () => {
    const out = xianyuListingScene.parseOutput(OK_JSON);
    expect(out).not.toBeNull();
    expect(out?.["标题"]).toContain("iPhone14Pro");
    expect(Array.isArray(out?.["产品卖点"])).toBe(true);
  });
  it("无代码块 / 非法 JSON / 缺字段 → null", () => {
    expect(xianyuListingScene.parseOutput("纯文字没有代码块")).toBeNull();
    expect(xianyuListingScene.parseOutput("```json\n{ 不是 json }\n```")).toBeNull();
    expect(xianyuListingScene.parseOutput("```json\n{ \"标题\": \"x\" }\n```")).toBeNull();
  });
  it("buildTaskMessage 透传商品/款式/价格/成色/原因/卖点", () => {
    const msg = xianyuListingScene.buildTaskMessage({
      product: "iPhone 14 Pro", spec: "256G 远峰蓝", originalPrice: "8999",
      price: "5500", condition: "99新", reason: "换新机", sellingPoints: "电池92,国行",
    });
    expect(msg).toContain("iPhone 14 Pro");
    expect(msg).toContain("256G 远峰蓝");
    expect(msg).toContain("8999");
    expect(msg).toContain("5500");
    expect(msg).toContain("99新");
    expect(msg).toContain("换新机");
    expect(msg).toContain("电池92");
  });
  it("useKb=false 不要求检索", () => {
    const msg = xianyuListingScene.buildTaskMessage({ product: "x", useKb: false });
    expect(msg).not.toContain("search_kb");
  });
  it("buildTaskMessage 透传多款式与价格", () => {
    const msg = xianyuListingScene.buildTaskMessage({ product: "耳机", variants: "黑色 128G | 1999\n白色 256G | 2299" });
    expect(msg).toContain("多款式与价格");
    expect(msg).toContain("黑色 128G | 1999");
    expect(msg).toContain("白色 256G | 2299");
  });
  it("system prompt 含多款式输出规则", () => {
    expect(xianyuListingScene.buildSystemPrompt()).toContain("多款式");
    expect(xianyuListingScene.buildSystemPrompt()).toContain("款式\"字段必须输出数组");
  });
  it("parseOutput 接受款式为数组（多款式带价格）", () => {
    const out = xianyuListingScene.parseOutput(`\`\`\`json
{
  "标题": "耳机多款可选",
  "转卖原因": "闲置",
  "产品卖点": ["降噪"],
  "款式": [{"款": "黑色 128G", "价格": 1999}, {"款": "白色 256G", "价格": 2299}],
  "购买须知": "可小刀"
}
\`\`\``);
    expect(out).not.toBeNull();
    expect(Array.isArray(out?.["款式"])).toBe(true);
    expect((out?.["款式"] as Array<{ 款: string }>)[0]["款"]).toBe("黑色 128G");
  });
  it("system prompt 含闲鱼红线（导流/违禁品/成色真实/极限词）", () => {
    const sys = xianyuListingScene.buildSystemPrompt();
    for (const k of ["禁止导流", "违禁品", "成色必须真实", "极限词", "个人闲置口吻"]) {
      expect(sys).toContain(k);
    }
  });
  it("system prompt 购买须知为固定 4 条模板", () => {
    const sys = xianyuListingScene.buildSystemPrompt();
    expect(sys).toContain("默认拍下发普通款【款式一】");
    expect(sys).toContain("联系客服改价");
    expect(sys).toContain("48小时内发货");
    expect(sys).toContain("非质量问题不退不换");
  });
  it("system prompt 含输出 schema 五个关键字段", () => {
    const sys = xianyuListingScene.buildSystemPrompt();
    for (const k of ["标题", "转卖原因", "产品卖点", "款式", "购买须知"]) {
      expect(sys).toContain(k);
    }
  });
  it("tools 只挂 search_kb", () => {
    expect(xianyuListingScene.tools).toEqual(["search_kb"]);
  });
  it("buildCheckMessage 含三点检查判据与第一段原文", () => {
    const msg = xianyuListingScene.buildCheckMessage!("我的第一版文案内容");
    expect(msg).toContain("我的第一版文案内容");
    expect(msg).toContain("真实性");
    expect(msg).toContain("红线合规");
    expect(msg).toContain("标题吸引力");
  });
  it("parseOutput 接受带自检字段的物料包", () => {
    const out = xianyuListingScene.parseOutput(OK_JSON_WITH_CHECK);
    expect(out).not.toBeNull();
    expect(Array.isArray(out?.["自检"])).toBe(true);
  });
});
