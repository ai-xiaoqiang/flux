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
  it("buildTaskMessage 二次改写模式：含原文、改写要求与红线审稿提示", () => {
    const src = "只要每天喝这个，三天根治高血压，加微信领取配方";
    const msg = videoWorkshopScene.buildTaskMessage({ topic: "健康", inputText: src, platform: "视频号" });
    expect(msg).toContain("二次改写");
    expect(msg).toContain(src);
    expect(msg).toContain("内容红线");
    expect(msg).toContain("合规化改写");
    expect(msg).toContain("不伪造");
    expect(msg).toContain("经得起推敲");
    expect(msg).toContain("内容级改写");
    expect(msg).toContain("逐句必须与原文字面不同");
    expect(msg).toContain("改写示例");
    expect(msg).toContain("控量");
    expect(msg).toContain("字数不足同样不合格");
    expect(msg).toContain("900~1100");
    expect(msg).toContain("关键事实链");
    expect(msg).toContain("鸡汤");
  });
  it("buildTaskMessage 无 inputText 时为生成模式，不含改写指令", () => {
    const msg = videoWorkshopScene.buildTaskMessage({ topic: "x" });
    expect(msg).not.toContain("二次改写");
  });
  it("buildSystemPrompt 注入内容红线（通用 + 所选平台特色）", () => {
    const douyin = videoWorkshopScene.buildSystemPrompt({ platform: "抖音" });
    expect(douyin).toContain("内容红线");
    expect(douyin).toContain("资质认证"); // 抖音财经特色
    expect(douyin).toContain("真实性");   // 不伪造/经得起推敲的创作纪律
    const bili = videoWorkshopScene.buildSystemPrompt({ platform: "B站" });
    expect(bili).toContain("站外导流");   // B站特色
    expect(bili).toContain("绝对化用语"); // 通用
  });
  it("buildCheckMessage 含平台红线合规检查点", () => {
    const msg = videoWorkshopScene.buildCheckMessage!("x");
    expect(msg).toContain("平台红线合规");
    expect(msg).toContain("事实真实性");
    expect(msg).toContain("某人说");
    expect(msg).toContain("字数明显少于档位");
    expect(msg).toContain("关键事实链");
    expect(msg).toContain("改写度");
  });
  it("buildTaskMessage 长档位/自定义时长格式化成可读描述", () => {
    expect(videoWorkshopScene.buildTaskMessage({ topic: "x", duration: "120" })).toContain("2 分钟");
    expect(videoWorkshopScene.buildTaskMessage({ topic: "x", duration: "300" })).toContain("5 分钟");
    const custom = videoWorkshopScene.buildTaskMessage({ topic: "x", duration: "90" });
    expect(custom).toContain("90 秒");
    expect(custom).toContain("1.5 分钟");
  });
  it("paramsSchema 时长预设含 2 分钟/5 分钟档位", () => {
    const d = videoWorkshopScene.paramsSchema.properties.duration as { enum?: string[] };
    expect(d.enum).toContain("120");
    expect(d.enum).toContain("300");
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
    const msg = videoWorkshopScene.buildCheckMessage!("我的第一版稿子内容");
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
