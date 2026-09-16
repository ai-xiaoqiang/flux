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

const OK_JSON_WITH_CHECK = `这是修订版：
\`\`\`json
{
  "标题": "后端涨薪攻略",
  "口播文案": "第一句\\n第二句",
  "分镜": [{ "镜头": "开场特写", "旁白": "第一句", "时长秒": 3 }],
  "封面字": "三秒抓住人",
  "话题标签": ["后端", "面试", "涨薪"],
  "自检": [
    { "要点": "讲的是谁或什么事", "通过": true, "说明": "主角明确" },
    { "要点": "发生了什么反常、冲突或意外", "通过": true, "说明": "有反转" },
    { "要点": "为什么值得继续听", "通过": true, "说明": "有悬念" }
  ]
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
  it("buildSystemPrompt 默认不注入写作模板", () => {
    expect(videoWorkshopScene.buildSystemPrompt()).not.toContain("【本任务使用");
  });
  it("buildSystemPrompt 按 template 参数注入对应爆款模板", () => {
    const story = videoWorkshopScene.buildSystemPrompt({ template: "story" });
    expect(story).toContain("悬念故事型");
    expect(story).toContain("反差钩子");
    const list = videoWorkshopScene.buildSystemPrompt({ template: "list" });
    expect(list).toContain("干货清单型");
    const emotional = videoWorkshopScene.buildSystemPrompt({ template: "emotional" });
    expect(emotional).toContain("情绪共鸣型");
  });
  it("buildSystemPrompt 非法 template 回退通用", () => {
    expect(videoWorkshopScene.buildSystemPrompt({ template: "nope" })).not.toContain("【本任务使用");
  });
  it("buildCheckMessage 包含三点检查判据与第一段原文", () => {
    const msg = videoWorkshopScene.buildCheckMessage("我的第一版稿子内容");
    expect(msg).toContain("我的第一版稿子内容");
    expect(msg).toContain("讲的是谁或什么事");
    expect(msg).toContain("反常、冲突或意外");
    expect(msg).toContain("值得继续听");
  });
  it("parseOutput 接受带自检字段的物料包", () => {
    const out = videoWorkshopScene.parseOutput(OK_JSON_WITH_CHECK);
    expect(out).not.toBeNull();
    expect(Array.isArray(out?.["自检"])).toBe(true);
  });
});
