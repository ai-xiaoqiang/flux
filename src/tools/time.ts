/**
 * 时光 Flux - 工具：报当前时间
 * 你的第一个自建工具。结构跟 readFile 一样，只是更简单（不需要参数）。
 */
import type { FluxTool } from "./types.js";

export const timeTool: FluxTool = {
  // ① 名字：大脑靠它指认"我要调这个"
  name: "current_time",
  // ② 描述：告诉大脑"什么时候该用我"。越具体，模型越会用你。
  description:
    "返回当前日期和精确时间。当用户问'现在几点/几号/星期几'时使用。比执行 shell 的 date 更轻、更快、无副作用。",
  // ③ 风险等级：只读信息，无副作用 → read
  risk: "read",
  // ④ 分类：system（工具类，方便以后按类启用/禁用）
  category: "system",
  // ⑤ 参数 schema：这个工具不需要任何参数 → 空对象
  parametersSchema: { type: "object", properties: {} },
  // ⑥ 执行体：真正干活的地方。返回的字符串会回填给大脑。
  async execute() {
    const now = new Date();
    const date = now.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    const time = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
    return `今天是 ${date}，${time}，星期${week}。`;
  },
};
