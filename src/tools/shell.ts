/**
 * 时光 Flux - 工具：执行 shell 命令
 * 时光机的"脚"，能跑任何命令。风险最高（能删库），标 dangerous。
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { FluxTool } from "./types.js";

const execAsync = promisify(exec);

export const runShellCommandTool: FluxTool = {
  name: "run_shell_command",
  description:
    "在用户的工作目录下执行一条 shell 命令，返回标准输出。适合运行程序、git 操作、查环境等。注意：命令有副作用，仅在确有必要时调用。",
  risk: "dangerous",
  category: "code",
  parametersSchema: {
    type: "object",
    properties: { command: { type: "string", description: "要执行的完整 shell 命令" } },
    required: ["command"],
  },
  async execute(args, ctx) {
    const command = String(args.command ?? "");
    if (!command) return "错误：缺少 command 参数";
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: ctx.cwd,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      const out = stdout.trim();
      const err = stderr.trim();
      if (out && err) return `${out}\n\n[stderr] ${err}`;
      return out || err || "(命令执行完成，无输出)";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return `命令执行失败：${msg}`;
    }
  },
};