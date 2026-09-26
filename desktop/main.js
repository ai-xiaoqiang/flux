/**
 * 时光 Flux 桌面版 - Electron 主进程（ESM）
 * 职责：拉起内嵌的 Flux Node 服务（复用现有 dist/server.js，不走 cli.ts——
 *       cli.ts 会因缺 apiKey 直接退出，而桌面版首次打开就是要引导配置 key）
 *       → 打开原生窗口加载 localhost 前端 → 管理窗口生命周期。
 */
import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 桌面版专用端口（避开手动 `flux web` 的 8787）
const PORT = 18787;
let server = null;

/** 定位编译后的服务入口：开发时在 desktop/dist（prepare 脚本复制）；打包后 dist 平铺到 app.asar 根 */
function resolveDist(name) {
  const candidates = [
    path.join(__dirname, "dist", name),
    path.join(__dirname, "..", "dist", name),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error("[flux-desktop] 找不到 dist/" + name + "，请先 npm run build");
  return found;
}

async function startFluxServer() {
  // 服务进程的工作目录切到用户主目录：文件类工具的默认起点（而不是 app 目录）
  process.chdir(os.homedir());

  const { loadConfig } = await import(resolveDist("config.js"));
  const { startWebServer } = await import(resolveDist("server.js"));

  const config = loadConfig();
  server = startWebServer(config, PORT);
  await new Promise((resolve) => {
    server.on("listening", resolve);
    server.on("error", (err) => {
      console.error("[flux-desktop] 服务启动失败:", err);
      resolve(); // 不阻塞窗口打开，页面会显示连接失败
    });
  });
  console.log("[flux-desktop] Flux 服务已启动 → http://localhost:" + PORT);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "时光 Flux",
    backgroundColor: "#0b0f1a",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 站外链接一律交给系统浏览器，不让它离开 App
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(`http://localhost:${PORT}`);
  return win;
}

app.whenReady().then(async () => {
  await startFluxServer();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  if (server) { try { server.close(); } catch { /* 忽略 */ } }
});
