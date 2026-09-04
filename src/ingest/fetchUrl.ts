/**
 * 时光 Flux - 抓取网址
 * 拾光的第一种"拾"法：给个 URL，抓网页正文抽成文字。
 * 底层用 Node 内置 fetch + cheerio 抽正文（跟本地 html 解析同一套思路）。
 */
import { load } from "cheerio";

const MAX_CHARS = 30000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

/** 抓取并抽取网页正文。非 HTML(如 PDF)会给提示，让用户下载后走上传 */
export async function fetchUrl(url: string): Promise<FetchedPage> {
  const resp = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`抓取失败：HTTP ${resp.status}`);

  const ctype = (resp.headers.get("content-type") || "").toLowerCase();
  if (ctype.includes("pdf") || /\.pdf$/i.test(new URL(url).pathname)) {
    throw new Error("该链接是 PDF。请下载后通过 📎 上传，或让我用 read_document 读本地 PDF。");
  }

  const html = await resp.text();
  const $ = load(html);
  // 去掉脚本/样式/导航/页脚等噪音
  $("script, style, noscript, nav, footer, header, aside, iframe, form").remove();
  const title = ($("title").first().text().trim() || new URL(url).hostname || url).slice(0, 200);
  const text = $("body").text().replace(/\s+/g, " ").trim();

  if (!text) throw new Error("该页面正文为空（可能是需要 JS 渲染的页面）");

  const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n…(内容过长已截断)" : text;
  return { url, title, text: truncated };
}
