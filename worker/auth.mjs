/* 会话签名与密码校验（Worker 端） */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes) {
  let s = "";
  const a = new Uint8Array(bytes);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}
export async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function sign(secret, data) {
  const k = await hmacKey(secret);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
export async function verifySig(secret, data, sig) {
  const k = await hmacKey(secret);
  return crypto.subtle.verify("HMAC", k, b64urlDecode(sig), enc.encode(data));
}
export async function makeSession(secret, days = 90) {
  const payload = b64url(enc.encode(JSON.stringify({ exp: Date.now() + days * 86400e3 })));
  return payload + "." + (await sign(secret, payload));
}
export async function sessionOk(secret, token) {
  if (!secret || !token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  try {
    if (!(await verifySig(secret, payload, sig))) return false;
    const o = JSON.parse(dec.decode(b64urlDecode(payload)));
    return o && typeof o.exp === "number" && o.exp > Date.now();
  } catch { return false; }
}
export function getCookie(req, name) {
  const h = req.headers.get("cookie") || "";
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
export function timingEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
