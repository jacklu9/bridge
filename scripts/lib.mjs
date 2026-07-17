import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

export function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (net.isIPv6(address)) {
    const ip = address.toLowerCase();
    return ip === "::" || ip === "::1" || ip.startsWith("fc") ||
      ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") ||
      ip.startsWith("fea") || ip.startsWith("feb");
  }
  return true;
}

export async function assertPublicUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("只允许 http/https 地址");
  }
  if (url.username || url.password) throw new Error("URL 不允许包含用户名或密码");
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some(({ address }) => isPrivateIp(address))) {
    throw new Error("不允许访问本机、内网或保留地址");
  }
  return url;
}

export function makeArticleId(url) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const hash = crypto.createHash("sha256").update(`${url}\n${Date.now()}`).digest("hex").slice(0, 10);
  return `${stamp}-${hash}`;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}
