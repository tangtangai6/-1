"use strict";
const fs = require("fs");
const ADDR = (process.argv.find(a => /^0x[0-9a-fA-F]{40}$/.test(a)) || "0xad4304f66791c820745ef3a3b3af7b6f0bda2e31").toLowerCase();
const s = JSON.parse(fs.readFileSync("data/raw/state.json", "utf8"));
const n = s.addrs.length, par = s.par, addrs = s.addrs;
let CUR = 54;
try { CUR = JSON.parse(fs.readFileSync("data/community.json", "utf8")).curDay; } catch (e) { }
const cnt = new Uint32Array(n);
for (let i = 0; i < n; i++) if (par[i] >= 0) cnt[par[i]]++;
const cs = new Uint32Array(n + 1);
for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + cnt[i];
const fill = cs.slice(0, n), kids = new Uint32Array(cs[n]);
for (let i = 0; i < n; i++) if (par[i] >= 0) kids[fill[par[i]]++] = i;
const order = new Uint32Array(n); let t = 0; const st = [];
for (let i = 0; i < n; i++) if (par[i] < 0) st.push(i);
while (st.length) { const u = st.pop(); order[t++] = u; for (let k = cs[u]; k < cs[u + 1]; k++) st.push(kids[k]); }
const selfAll = new Float64Array(n), self7 = new Float64Array(n);
for (const row of s.flows || []) {
  const key = row[0], d = key % 4096, u = Math.floor(key / 4096), v = row[1] || 0;
  selfAll[u] += v; if (d >= CUR - 6) self7[u] += v;
}
const subAll = Float64Array.from(selfAll), sub7 = Float64Array.from(self7);
for (let k = t - 1; k >= 0; k--) { const u = order[k], p = par[u]; if (p >= 0) { subAll[p] += subAll[u]; sub7[p] += sub7[u]; } }
const ai = s.addrs.indexOf(ADDR);
const out = { addr: ADDR, curDay: CUR, found: ai >= 0, index: ai };
if (ai >= 0) {
  const list = [];
  for (let k = cs[ai]; k < cs[ai + 1]; k++) { const c = kids[k]; list.push({ a: addrs[c], all: subAll[c], d7: sub7[c], team: undefined }); }
  list.sort((x, y) => y.all - x.all);
  out.children = list.length;
  out.topAll = list.slice(0, 10);
  out.top7 = list.slice().sort((x, y) => y.d7 - x.d7).slice(0, 10);
  out.selfAll = selfAll[ai]; out.subAll = subAll[ai];
}
fs.writeFileSync("zones.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
