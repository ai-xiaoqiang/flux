/**
 * 时光 Flux - 场景：咸鱼爆款文案
 * 输入：商品信息（名称/款式/入手价/转让价/成色/转卖原因/卖点）
 * 输出：标题 / 转卖原因 / 产品卖点 / 款式 / 购买须知 的 JSON 物料包
 * 红线：闲鱼平台规则（禁导流 / 禁违禁品 / 成色必须真实 / 不夸大不仿冒）
 */
import type { SceneDef } from "./types.js";

export const xianyuListingScene: SceneDef = {
  id: "xianyu-listing",
  name: "咸鱼爆款文案",
  description: "输入商品信息，产出闲鱼爆款文案：标题 / 转卖原因 / 产品卖点 / 款式 / 购买须知",
  icon: "🐟",
  paramsSchema: {
    type: "object",
    properties: {
      product: { type: "string", description: "商品名称（必填），如：iPhone 14 Pro" },
      spec: { type: "string", description: "款式/规格（可选），如：256G 远峰蓝" },
      originalPrice: { type: "string", description: "入手价（可选）" },
      price: { type: "string", description: "转让价（可选）" },
      variants: { type: "string", description: "多款式与价格（可选）：每行一个款式，格式“款式|价格”，如：黑色128G|1999" },
      condition: { type: "string", enum: ["全新", "99新", "95新", "9成新", "8成新", "有瑕疵"], description: "成色，默认 95新" },
      reason: { type: "string", description: "转卖原因（可选），填真实原因更可信" },
      sellingPoints: { type: "string", description: "产品卖点（可选），逗号分隔" },
    },
    required: ["product"],
  },
  tools: ["search_kb"],
  buildSystemPrompt(params) {
    const base = `你是「时光」的咸鱼爆款文案工场：专门写闲鱼二手交易的爆款文案。
你的任务：根据用户提供的商品信息，产出一份可以直接发布的闲鱼文案。

创作要求：
- 标题：20~30 字，关键词堆叠（品类词+品牌+型号+规格+成色），卖点前置，像个人卖家手打的，不像广告。
- 转卖原因：真实可信的个人理由（升级换新/用不上/闲置/朋友送的），一两句带过，别编离谱故事；用户给了原因就按用户的说。
- 产品卖点：3~5 条，具体（参数/功能/使用感受/成色细节），每条一句，别空话。
- 款式：把规格/成色/颜色/配置讲清楚，跟用户输入一致；用户没给就写"具体款式可看实拍/私聊"。
- 多款式：如果用户给了多款式与价格（每行 款式|价格），"款式"字段必须输出数组，逐款写清名称和价格，如 [{"款":"黑色128G","价格":1999},{"款":"白色256G","价格":2299}]；标题和卖点里选一款最主打的做重点，其它款式在"款式"里列全。单款时"款式"仍是字符串。
- 购买须知：固定按下面 4 条输出（每条一行，不要改动措辞）：
  1、默认拍下发普通款【款式一】
  2、需要其他款点击右下角(我想要/聊一聊)联系客服改价。
  3、本交易仅支持邮寄，拍下后48小时内发货。偏远地区不包邮，详情咨询客服
  4、运输破损包退换，请及时拍照留证。非质量问题不退不换。

输出格式（严格遵守）：
只输出一个 json 代码块，不要任何其它文字、解释或 markdown 标题。格式如下：
\`\`\`json
{
  "标题": "……",
  "转卖原因": "……",
  "产品卖点": ["……", "……", "……"],
  "款式": "……",
  "购买须知": "……"
}
\`\`\`

【闲鱼红线（硬约束，逐条必须遵守，踩线即违规）】
- 禁止导流：不得出现微信号、QQ号、手机号、二维码、外链、淘宝口令、引导站外交易等内容。
- 禁止违禁品：不得涉及闲鱼禁售品类（烟草、处方药、管制刀具、仿品假货、虚拟账号交易等）。
- 成色必须真实：不得虚假描述成色、不得隐瞒瑕疵；有瑕疵必须明说，宁低勿高。
- 不夸大：不得夸大功效/来源/使用体验，不得仿冒品牌或官方授权、不得声称"正品保证"以外的官方背书。
- 广告法：不得使用"最""第一""100%""绝对""无敌"等极限词。
- 个人闲置口吻：真实、接地气，可用"不喜勿喷""可小刀""同城可自提"等闲鱼生态话术，不写成职业卖家广告。`;
    // 可选：检索素材库参考（场景级 tools 已挂 search_kb）
    return base;
  },
  buildTaskMessage(params) {
    const product = String(params.product ?? "").trim() || "（未提供商品名称）";
    const spec = String(params.spec ?? "").trim();
    const originalPrice = String(params.originalPrice ?? "").trim();
    const price = String(params.price ?? "").trim();
    const variants = String(params.variants ?? "").trim();
    const condition = String(params.condition ?? "95新");
    const reason = String(params.reason ?? "").trim();
    const sellingPoints = String(params.sellingPoints ?? "").trim();
    const useKb = params.useKb !== false;

    const lines: string[] = [`商品名称：${product}`];
    if (spec) lines.push(`款式/规格：${spec}`);
    if (originalPrice) lines.push(`入手价：${originalPrice}`);
    if (price) lines.push(`转让价（想挂的价格）：${price}`);
    if (variants) lines.push(`多款式与价格（每行 款式|价格）：\n${variants}`);
    lines.push(`成色：${condition}`);
    if (reason) lines.push(`转卖原因：${reason}`);
    if (sellingPoints) lines.push(`产品卖点：${sellingPoints}`);
    if (useKb) lines.push("请先用 search_kb 检索素材库，参考其中的相关信息再创作（参考但不要照抄）。检索不到就直接创作。");
    lines.push("请按输出格式产出这份闲鱼文案。");
    return lines.join("\n");
  },
  parseOutput(text) {
    const json = extractJsonBlock(text);
    if (!json) return null;
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      if (!obj || typeof obj !== "object") return null;
      for (const k of ["标题", "转卖原因", "产品卖点", "款式", "购买须知"]) {
        if (!(k in obj)) return null;
      }
      return obj;
    } catch {
      return null;
    }
  },
  buildCheckMessage(outputText) {
    return `这是你刚生成的闲鱼文案：

${outputText}

请以「评审」身份严格自检这份文案，逐条判定下面三点：
1. 真实性 —— 成色/款式描述是否与用户输入一致？有没有隐瞒瑕疵、编造转卖原因、虚构使用感受？
2. 红线合规 —— 有没有导流信息（微信/外链/口令）、违禁品、夸大功效、绝对化用语、仿冒品牌？
3. 标题吸引力 —— 标题有没有关键词堆叠、卖点前置，能不能在闲鱼搜索结果里抓眼？

判定规则：
- 任何一点不通过，必须重写对应部分，直到三点全部通过。
- 严禁放水：只有真正满足才算通过，不能为通过而改稿。
- 修订后输出完整物料包（五字段齐全），并附带"自检"字段：
\`\`\`json
{
  "标题": "……",
  "转卖原因": "……",
  "产品卖点": ["……", "……", "……"],
  "款式": "……",
  "购买须知": "……",
  "自检": [
    { "要点": "真实性", "通过": true, "说明": "……" },
    { "要点": "红线合规", "通过": true, "说明": "……" },
    { "要点": "标题吸引力", "通过": true, "说明": "……" }
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
