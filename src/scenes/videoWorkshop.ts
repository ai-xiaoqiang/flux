/**
 * 时光 Flux - 场景：短视频工场
 * 输入：主题(必填) + 目标时长/平台/是否参考素材库
 * 输出：标题/口播文案/分镜/封面字/话题标签 的 JSON 物料包
 * 可选：先 search_kb 从知识库检索参考素材 → 再创作（参考但不照抄）。
 */
import type { SceneDef } from "./types.js";
import { getVideoTemplate } from "./videoTemplates.js";
import { getRedLines } from "./videoRedLines.js";

export const videoWorkshopScene: SceneDef = {
  id: "video-workshop",
  name: "短视频工场",
  description: "输入一个主题，产出可直接开拍的短视频物料包：标题 / 口播文案 / 分镜 / 封面字 / 话题标签",
  icon: "📱",
  paramsSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "短视频主题（必填）" },
      inputText: { type: "string", description: "已有文案（可选）：填写后改为「二次改写」模式，按平台红线合规 + 爆款逻辑改写" },
      duration: { type: "string", enum: ["15", "30", "60", "120", "300"], description: "目标时长(秒)：120=2分钟、300=5分钟；自定义可传任意秒数，默认 30" },
      platform: { type: "string", enum: ["抖音", "视频号", "B站"], description: "目标平台，默认 抖音" },
      useKb: { type: "boolean", description: "是否先从知识库检索参考（默认开启）" },
      template: { type: "string", enum: ["story", "list", "emotional"], description: "写作模板：story 悬念故事 / list 干货清单 / emotional 情绪共鸣，不填=通用" },
    },
    required: ["topic"],
  },
  tools: ["search_kb"],
  buildSystemPrompt(params) {
    const base = `你是「时光」的短视频工场：一个爆款短视频物料工厂。
你的任务：根据用户给的主题，产出一份可以直接开拍的短视频物料包。

创作要求：
- 口播文案：口语化、有钩子（前 3 秒抓住人）、节奏紧凑、有信息量，不要空话套话。
- 真实性：不编造事实、数据、案例、原话引用；数字/案例要经得起推敲，没有依据的不写死、用留有余地的说法（“大约/部分/举例”）。
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
    // 平台红线：硬约束，生成与二次改写都要遵守（按所选平台 + 通用）
    const platform = params && String(params.platform ?? "").trim();
    const redLines = getRedLines(platform);
    const redLineBlock = redLines.length
      ? `\n\n【内容红线（硬约束，逐条必须遵守，踩线即审核不过）】\n- ${redLines.join("\n- ")}`
      : "";
    // 选中的爆款模板：把结构骨架指令追加进人设（不选/非法 id 回退通用）
    const tpl = getVideoTemplate(params && String(params.template ?? ""));
    const withRedLines = `${base}${redLineBlock}`;
    return tpl ? `${withRedLines}\n\n${tpl.stylePrompt}` : withRedLines;
  },
  buildTaskMessage(params) {
    const topic = String(params.topic ?? "").trim() || "（未提供主题）";
    const inputText = String(params.inputText ?? "").trim();
    const duration = String(params.duration ?? "30");
    const platform = String(params.platform ?? "抖音");
    const useKb = params.useKb !== false;
    const kbHint = useKb
      ? "请先用 search_kb 检索素材库，参考其中的相关信息再创作（参考但不要照抄）。检索不到就直接创作。\n"
      : "";

    // 二次改写模式：给了已有文案 → 先对照红线审稿，再合规化 + 爆款化改写，不是从零创作
    if (inputText) {
      return (
        `主题：${topic}\n` +
        `目标平台：${platform}\n` +
        `目标时长：${formatDuration(duration)}\n` +
        `任务：对下面的「已有文案」做二次改写。\n\n` +
        `【已有文案】\n${inputText}\n\n` +
        `【改写要求】\n` +
        `1. 先逐条对照 system 里的内容红线，找出原文踩线的地方（导流、绝对化用语、医疗/金融承诺、搬运侵权、低俗擦边等）；\n` +
        `2. 内容级改写（关键）：逐句必须与原文字面不同——同一意思换句式、换词、打散重组，禁止出现与原文完全相同的整句；删口水话与重复、压缩铺垫、强化画面感；事实、数字、人名、地名、时间必须原样保留（可改说法，不可改事实）；删减只能砍次要细节（铺垫/重复/修辞），不能删关键事实链：人物、核心事件、关键转折（如退赛/逆袭）、关键数字、情感高点都要在。改写示例：原文“您没听错，他在武汉送外卖那阵子，别人骑电驴，他跑着送”→ 改写“别不信，他在武汉送外卖时别人骑电动车，他全靠两条腿跑”。\n` +
        `3. 钩子前置：把最抓人的一句（反差/悬念/具体数字）放到口播文案第一句；原文顺序只是素材，按「3 秒抓人 → 信息推进 → 情绪高点 → 收尾互动」重排。\n` +
        `4. 不伪造、不夸大：不得编造事实/数据/案例/引语/内心独白——原文里没有的人物台词一律不写，引用必须来自原文；不得脑补原文没有的背景、动机、经历（如“出身山区”“锻炼了意志”这类推测）；数字和案例要经得起推敲，没有依据的说法要留余地（“大约/部分/举例”），不确定就不写死；\n` +
        `5. 按目标时长控量（字数不足同样不合格）：档位越高覆盖原文越多，口播文案必须落在档位区间——15秒≈40~60字（只留钩子+最核心一件事）/ 30秒≈80~120字（钩子+核心事件）/ 60秒≈180~220字（主线：人物+核心事件+关键转折）/ 120秒≈350~450字（完整主线+关键细节）/ 300秒≈900~1100字（完整故事：外卖→赛道→退赛→逆袭→梁晶→夺冠→升华收尾，从头到尾只删重复修辞）；超出就砍次要细节，不足就用原文的故事细节补充，禁止用“努力/梦想/永不放弃/命运”等抽象升华句或鸡汤凑字数；\n` +
        `6. 踩线的表述必须合规化改写（换说法、去绝对化、去承诺、去导流），不得原样保留、不得打擦边球；\n` +
        `7. 输出完整物料包（五字段 JSON），不要输出审稿过程。\n` +
        kbHint
      );
    }

    // 全新生成模式
    return (
      `主题：${topic}\n` +
      `目标平台：${platform}\n` +
      `目标时长：${formatDuration(duration)}\n` +
      kbHint +
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
  buildCheckMessage(outputText) {
    return `这是你刚生成的短视频物料包：

${outputText}

请以「评审」身份严格自检这份稿子，逐条判定下面四点：
1. 讲的是谁或什么事 —— 观众能不能在开头就听明白主角/主题？
2. 发生了什么反常、冲突或意外 —— 稿子里有没有一个具体的冲突、反转或意外？
3. 为什么值得继续听 —— 有没有一个理由让观众愿意听完（悬念/利益/共鸣）？
4. 平台红线合规 —— 逐条对照 system 里的内容红线：有没有导流、绝对化用语、医疗/金融承诺、搬运侵权、低俗擦边等踩线表述？
5. 事实真实性 —— 有没有编造事实/数据/案例/引语/内心独白（尤其是原文里没有的“某人说”）？有没有脑补原文没有的背景/动机/经历？有没有用抽象鸡汤句（努力/梦想/永不放弃）替代具体事实？关键事实链（人物/核心事件/转折/关键数字/情感点）是否完整、是否丢了主线事实（如梁晶支线）？口播文案字数是否落在目标时长档位区间（明显不足也算不通过）？
6. 改写度 —— 是否大量逐句照搬原文？对照原文逐句检查：连续三句以上与原文字面相同即为不合格；修订时必须找出所有与原文相同的整句并逐句重写（换句式/换词/打散重组），确保输出里不存在整句与原文相同的情况。只保留事实，不保留原句。

判定规则：
- 任何一点不通过，必须重写口播文案（必要时改标题/分镜/封面字），直到六点全部通过。
- 严禁放水：自检必须逐句对照原文，任何“原文没有的引语/数字/事件/内心独白/脑补背景”都算不通过；关键事实链缺失、用鸡汤句凑字数、字数明显少于档位、连续三句以上照搬原文也算不通过。
- 修订后输出完整物料包（五字段齐全），并附带"自检"字段：
\`\`\`json
{
  "标题": "……",
  "口播文案": "……",
  "分镜": [ { "镜头": "画面描述", "旁白": "对应口播", "时长秒": 5 } ],
  "封面字": "……",
  "话题标签": ["……", "……"],
  "自检": [
    { "要点": "讲的是谁或什么事", "通过": true, "说明": "……" },
    { "要点": "发生了什么反常、冲突或意外", "通过": true, "说明": "……" },
    { "要点": "为什么值得继续听", "通过": true, "说明": "……" },
    { "要点": "平台红线合规", "通过": true, "说明": "……" },
    { "要点": "事实真实性", "通过": true, "说明": "……" },
    { "要点": "改写度", "通过": true, "说明": "……" }
  ]
}
\`\`\`
只输出这一个 json 代码块，不要任何其它文字。`;
  },
};

/** 从模型输出里提取第一个 fenced json 代码块；没有则返回 null */
function extractJsonBlock(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

/** 把秒数格式化成模型更好理解的时长描述：60 秒 → "60 秒"，120 → "2 分钟（120 秒）"，90 → "90 秒（约 1.5 分钟）" */
function formatDuration(seconds: string): string {
  const s = Number.parseInt(seconds, 10);
  if (!Number.isFinite(s) || s <= 0) return `${seconds} 秒`;
  if (s % 60 === 0) return `${s / 60} 分钟（${s} 秒）`;
  if (s >= 60) return `${s} 秒（约 ${(s / 60).toFixed(1)} 分钟）`;
  return `${s} 秒`;
}
