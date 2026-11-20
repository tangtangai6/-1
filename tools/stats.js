"use strict";
// 一次性：统计 state.json / feed-state.json 规模，供「任意地址团队新增」方案选型。
const fs = require("fs");
const t0 = Date.now();
const s = JSON.parse(fs.readFileSync("data/raw/state.json", "utf8"));
const n = s.addrs.length;
const par = s.par;
const cnt = new Uint32Array(n);
for (let i = 0; i < n; i++) if (par[i] >= 0) cnt[par[i]]++;
let referrers = 0;
for (let i = 0; i < n; i++) if (cnt[i] > 0) referrers++;
// CSR children
const start = new Uint32Array(n + 1);
for (let i = 0; i < n; i++) start[i + 1] = start[i] + cnt[i];
const fill = start.slice(0, n);
const kids = new Uint32Array(start[n]);
for (let i = 0; i < n; i++) if (par[i] >= 0) kids[fill[par[i]]++] = i;
// BFS 深度 + 反向累计伞下人数
const depth = new Int32Array(n).fill(-1);
const order = new Uint32Array(n);
let h = 0, t = 0;
for (let i = 0; i < n; i++) if (par[i] < 0) { depth[i] = 0; order[t++] = i; }
while (h < t) { const u = order[h++]; for (let k = start[u]; k < start[u + 1]; k++) { const v = kids[k]; if (depth[v] < 0) { depth[v] = depth[u] + 1; order[t++] = v; } } }
const size = new Uint32Array(n);
for (let k = t - 1; k >= 0; k--) { const u = order[k], p = par[u]; if (p >= 0 && depth[p] >= 0) size[p] += size[u] + 1; }
// 深度分布、团队规模分布
const dd = {}, tb = { "0": 0, "1": 0, "2-5": 0, "6-20": 0, "21-100": 0, "101-1000": 0, "1001+": 0 };
let maxDepth = 0, ge10 = 0, ge100 = 0, ge1000 = 0, sumTeam = 0;
for (let i = 0; i < n; i++) {
  const d = depth[i]; if (d >= 0) { dd[d] = (dd[d] || 0) + 1; if (d > maxDepth) maxDepth = d; }
  const z = size[i]; sumTeam += z;
  const k = z === 0 ? "0" : z === 1 ? "1" : z <= 5 ? "2-5" : z <= 20 ? "6-20" : z <= 100 ? "21-100" : z <= 1000 ? "101-1000" : "1001+";
  tb[k]++;
  if (z >= 10) ge10++; if (z >= 100) ge100++; if (z >= 1000) ge1000++;
}
// 流水
const flows = s.flows || [];
const flowAddrs = new Set(), flowDays = new Set();
for (const r of flows) { flowAddrs.add(Math.floor(r[0] / 4096)); flowDays.add(r[0] % 4096); }
const flags = s.flag;
let joined = 0, imported = 0;
for (let i = 0; i < n; i++) { if (flags[i] & 1) joined++; if (flags[i] & 2) imported++; }
const out = {
  at: Date.now(), elapsedSec: 0,
  nodes: n, referrers, roots: n - (n - referrers), joined, imported,
  maxDepth, depthDist: dd,
  teamBuckets: tb, ge10, ge100, ge1000, sumTeamSize: sumTeam,
  flowsRows: flows.length, flowAddrs: flowAddrs.size, flowDays: flowDays.size,
  cursor: s.cursor, veSet: (s.veSet || []).length,
  stateBytes: fs.statSync("data/raw/state.json").size,
};
let feed = null;
try { feed = JSON.parse(fs.readFileSync("data/raw/feed-state.json", "utf8")); } catch (e) { }
if (feed) out.feed = { cursor: feed.cursor, days: Object.keys(feed.days || {}).length };
out.elapsedSec = Math.round((Date.now() - t0) / 1000);
fs.writeFileSync("stats.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
