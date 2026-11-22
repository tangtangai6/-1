import { sha256Hex, makeSession, sessionOk, getCookie, timingEqual, sleep } from "./auth.mjs";
import { queryTeam, queryZones } from "./team.mjs";

const COOKIE = "lt_session";
const MAX_AGE = 10 * 86400;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function loginPage(err) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>LGNS Terminal · 登录</title>
<style>
*{box-sizing:border-box}html,body{height:100%}body{margin:0;display:flex;align-items:center;justify-content:center;
background:radial-gradient(circle at 50% 28%,#1d3f8f 0%,#0d1726 58%,#070b11 100%);
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif;color:#e4e9f1}
.box{width:min(360px,88vw);padding:32px 26px 24px;border-radius:14px;background:rgba(18,24,34,.94);
border:1px solid rgba(130,160,210,.22);box-shadow:0 24px 70px rgba(0,0,0,.55);text-align:center}
.logo{width:52px;height:52px;margin:0 auto 16px;border-radius:12px;background:linear-gradient(135deg,#2f5fd0,#1d3f8f);
display:flex;align-items:center;justify-content:center;font:800 20px/1 Menlo,monospace;color:#fff}
h1{margin:0 0 6px;font-size:19px}p.sub{margin:0 0 20px;font-size:12.5px;color:#8591a5}
input{width:100%;height:44px;padding:0 14px;border-radius:8px;border:1px solid #2a3648;background:#0b0f16;color:#e4e9f1;font-size:15px;outline:none}
input:focus{border-color:#3f6fd8;box-shadow:0 0 0 3px rgba(63,111,216,.18)}
button{width:100%;height:44px;margin-top:12px;border:0;border-radius:8px;background:linear-gradient(135deg,#2f5fd0,#1d3f8f);color:#fff;font-size:15px;font-weight:600;cursor:pointer}
button:hover{filter:brightness(1.08)}.err{min-height:18px;margin:10px 0 0;font-size:12.5px;color:#ff8a8f}
.foot{margin:14px 0 0;font-size:11px;color:#5c6779}
</style></head><body>
<form class="box" method="post" action="/login" autocomplete="off">
<div class="logo">LT</div><h1>LGNS Terminal</h1><p class="sub">私密终端 · 请输入访问密码</p>
<input type="password" name="password" placeholder="访问密码" autocomplete="current-password" autofocus required>
<button type="submit">进入</button>
<p class="err">${err ? "密码不对，请重试" : ""}</p>
<p class="foot">仅限本人使用</p>
</form></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const token = getCookie(request, COOKIE);
    const authed = token ? await sessionOk(env.AUTH_SECRET, token) : false;

    if (url.pathname === "/login") {
      if (request.method === "POST") {
        let pwd = "";
        try { const fd = await request.formData(); pwd = String(fd.get("password") || ""); } catch { }
        const hash = await sha256Hex("lt-v1:" + pwd);
        const ok = !!env.AUTH_PASS_SHA256 && timingEqual(hash, env.AUTH_PASS_SHA256);
        if (ok) {
          const session = await makeSession(env.AUTH_SECRET, MAX_AGE / 86400);
          return new Response(null, {
            status: 303,
            headers: {
              location: "/",
              "set-cookie": `${COOKIE}=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`,
            },
          });
        }
        await sleep(800);
        return new Response(loginPage(true), { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
      }
      if (authed) return Response.redirect(new URL("/", url), 303);
      return new Response(loginPage(false), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 303,
        headers: { location: "/login", "set-cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` },
      });
    }

    if (!authed) {
      if (url.pathname.startsWith("/api/")) return json({ error: "unauthorized" }, 401);
      return Response.redirect(new URL("/login", url), 302);
    }

    if (url.pathname === "/api/health") return json({ ok: true });
    if (url.pathname === "/api/zones") {
      const addr = String(url.searchParams.get("addr") || "").trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: "badaddr" }, 400);
      try {
        const metaRes = await env.ASSETS.fetch(new URL("/data/meta.json", url));
        const meta = await metaRes.json();
        const read = async (p) => { const r = await env.ASSETS.fetch(new URL("/data/" + p, url)); if (!r.ok) throw new Error("missing " + p); return await r.arrayBuffer(); };
        return json(await queryZones(addr, read, meta));
      } catch (e) { return json({ error: String((e && e.message) || e) }, 500); }
    }
    if (url.pathname === "/api/team") {
      const addr = String(url.searchParams.get("addr") || "").trim().toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr)) return json({ error: "badaddr" }, 400);
      try {
        const metaRes = await env.ASSETS.fetch(new URL("/data/meta.json", url));
        if (!metaRes.ok) throw new Error("meta missing");
        const meta = await metaRes.json();
        const read = async (p) => {
          const r = await env.ASSETS.fetch(new URL("/data/" + p, url));
          if (!r.ok) throw new Error("missing " + p);
          return await r.arrayBuffer();
        };
        return json(await queryTeam(addr, read, meta));
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
