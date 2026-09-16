/**
 * 时光 Flux - 工具装配
 * 集中登记所有内置工具，返回一个填好的 ToolRegistry。
 * 未来加 Agent 专属工具/MCP 工具，也是往同一个注册表里 register。
 */
import { ToolRegistry } from "./registry.js";
import { runShellCommandTool } from "./shell.js";
import { readFileTool } from "./readFile.js";
import { writeFileTool } from "./writeFile.js";
import { saveMemoryTool } from "./saveMemory.js";
import { timeTool } from "./time.js";
import { readDocumentTool } from "./readDocument.js";
import { globFilesTool } from "./globFiles.js";
import { searchCodeTool } from "./searchCode.js";
import { readManyFilesTool } from "./readMany.js";
import { listFilesTool } from "./listFiles.js";
import { fetchUrlTool } from "./fetchUrlTool.js";
import { searchKbTool } from "./searchKb.js";

/** 内置工具注册表（会话启动时用它） */
export function builtinRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(searchKbTool);       // 知识库语义检索(RAG)
  registry.register(fetchUrlTool);       // 抓取网页(拾光)
  registry.register(listFilesTool);      // 扫代码⓪：项目结构总览
  registry.register(globFilesTool);      // 扫代码①：按名找文件
  registry.register(searchCodeTool);     // 扫代码②：搜内容
  registry.register(readManyFilesTool);  // 扫代码③：批量读
  registry.register(readDocumentTool);   // 文档解析(支持 pdf/docx/html)
  registry.register(timeTool);           // ★你的自建工具，登记在这
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(runShellCommandTool);
  registry.register(saveMemoryTool);
  return registry;
}

export type { FluxTool, ToolContext, ToolRisk } from "./types.js";
export { ToolRegistry, registryFromTools } from "./registry.js";
