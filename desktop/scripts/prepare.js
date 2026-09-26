/**
 * 打包前准备：把主仓库编译产物 dist/ 和前端 public/ 复制到 desktop 下，
 * 让 electron-builder 能打进 app.asar（它不支持 "../" 父目录引用，会静默忽略）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", ".."); // flux 仓库根
const here = path.join(__dirname, "..");      // desktop/

for (const name of ["dist", "public"]) {
  const src = path.join(root, name);
  const dest = path.join(here, name);
  if (!fs.existsSync(src)) {
    console.error(`[prepare] 缺少 ${src}，请先在仓库根 npm run build`);
    process.exit(1);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[prepare] 已复制 ${name}/ → desktop/${name}/`);
}
