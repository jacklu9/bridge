import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import sanitizeHtml from "sanitize-html";
import { assertPublicUrl, escapeHtml, makeArticleId } from "./lib.mjs";

const input = process.argv[2] || process.env.ARTICLE_URL;
if (!input) throw new Error("用法: npm run capture -- https://example.com/article");

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 30;
const timeoutMs = 20_000;

async function safeFetch(rawUrl, options = {}, redirects = 0) {
  if (redirects > 5) throw new Error("重定向次数过多");
  const url = await assertPublicUrl(rawUrl);
  const response = await fetch(url, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "BridgeSnapshot/0.1 (+personal reading snapshot)",
      "accept-language": "en-US,en;q=0.9",
      ...options.headers
    }
  });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) throw new Error("重定向缺少地址");
    return safeFetch(new URL(location, url).href, options, redirects + 1);
  }
  if (!response.ok) throw new Error(`抓取失败: HTTP ${response.status}`);
  return { response, finalUrl: url };
}

async function readLimited(response, limit) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error("远程内容超过大小限制");
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > limit) throw new Error("远程内容超过大小限制");
  return data;
}

const { response, finalUrl } = await safeFetch(input, {
  headers: { accept: "text/html,application/xhtml+xml" }
});
const contentType = response.headers.get("content-type") || "";
if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
  throw new Error(`目标不是网页: ${contentType || "未知类型"}`);
}

const html = (await readLimited(response, MAX_HTML_BYTES)).toString("utf8");
const dom = new JSDOM(html, { url: finalUrl.href });
const article = new Readability(dom.window.document).parse();
if (!article?.content || article.textContent.trim().length < 120) {
  throw new Error("未能提取足够的文章正文；该页面可能需要登录或 JavaScript 渲染");
}

const articleId = process.env.ARTICLE_ID || makeArticleId(finalUrl.href);
const articleDir = path.join("public", "articles", articleId);
const imageDir = path.join(articleDir, "images");
await fs.mkdir(imageDir, { recursive: true });

const contentDom = new JSDOM(`<main>${article.content}</main>`, { url: finalUrl.href });
const doc = contentDom.window.document;
const images = [...doc.querySelectorAll("img")].slice(0, MAX_IMAGES);

for (const [index, img] of images.entries()) {
  const source = img.getAttribute("src") || img.getAttribute("data-src");
  if (!source) { img.remove(); continue; }
  try {
    const absolute = new URL(source, finalUrl).href;
    const fetched = await safeFetch(absolute, { headers: { accept: "image/*" } });
    const type = (fetched.response.headers.get("content-type") || "").split(";")[0];
    const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
    const extension = extensions[type];
    if (!extension) throw new Error("不支持的图片类型");
    const data = await readLimited(fetched.response, MAX_IMAGE_BYTES);
    const name = `${String(index + 1).padStart(2, "0")}-${crypto.createHash("sha1").update(absolute).digest("hex").slice(0, 8)}.${extension}`;
    await fs.writeFile(path.join(imageDir, name), data);
    img.setAttribute("src", `images/${name}`);
    img.removeAttribute("srcset");
    img.removeAttribute("data-src");
    img.setAttribute("loading", "lazy");
  } catch (error) {
    console.warn(`跳过图片 ${source}: ${error.message}`);
    img.remove();
  }
}

const cleanContent = sanitizeHtml(doc.querySelector("main").innerHTML, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "figure", "figcaption", "picture", "source"]),
  allowedAttributes: {
    a: ["href"], img: ["src", "alt", "title", "loading", "width", "height"],
    source: ["src", "type"], "*": ["dir"]
  },
  allowedSchemes: ["http", "https"],
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href || "#", rel: "noreferrer noopener", target: "_blank" } })
  }
});

const capturedAt = new Date().toISOString();
const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(article.title)}</title>
<link rel="stylesheet" href="../../assets/style.css"></head>
<body><article class="reader"><header><a class="brand" href="../../">Bridge</a><h1>${escapeHtml(article.title)}</h1>
${article.byline ? `<p class="byline">${escapeHtml(article.byline)}</p>` : ""}
<p class="source">来源：<a href="${escapeHtml(finalUrl.href)}" rel="noreferrer noopener">${escapeHtml(finalUrl.hostname)}</a> · 快照时间 ${escapeHtml(capturedAt.slice(0, 16).replace("T", " "))} UTC</p></header>
<main class="content">${cleanContent}</main>
<footer>这是用于个人阅读分享的内容快照。版权归原作者及原发布方所有；内容可能与原页面后续更新不同。</footer></article></body></html>`;

await fs.writeFile(path.join(articleDir, "index.html"), page);
await fs.writeFile(path.join(articleDir, "meta.json"), JSON.stringify({ id: articleId, title: article.title, source: finalUrl.href, capturedAt }, null, 2));
console.log(`ARTICLE_ID=${articleId}`);
console.log(`ARTICLE_TITLE=${article.title.replaceAll("\n", " ")}`);
