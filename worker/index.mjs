import { queryTeam } from "./team.mjs";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") return json({ ok: true });
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
