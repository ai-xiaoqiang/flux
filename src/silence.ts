/**
 * 时光 Flux - 警告消音器
 * 某个传递依赖会触发 Node 对 punycode 的弃用警告（DEP0040），本身无害，
 * 但在交互模式下会刷屏干扰对话。这里在程序最开头把它静默掉。
 *
 * 注意：这个文件必须在 cli.ts 里被"第一个" import，
 * 因为 ESM 按 import 顺序执行副作用，要先装上"消音器"再加载会触发警告的依赖。
 */
type EmitWarning = typeof process.emitWarning;
const origEmitWarning: EmitWarning = process.emitWarning.bind(process);

function patched(...args: unknown[]): void {
  const [first] = args;
  const warning = first as string | Error;
  const text = typeof warning === "string" ? warning : warning.message;
  // 只放过这个已知无害的弃用警告，其余照常
  if (text.includes("punycode") || text.includes("DEP0040")) return;
  (origEmitWarning as (...args: unknown[]) => void)(...args);
}

(process as unknown as { emitWarning: (...args: unknown[]) => void }).emitWarning = patched;