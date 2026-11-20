"use strict";
/* 生成「团队新增」查询数据（7 天窗口）
   输入：data/raw/state.json（采集器断点）+ data/community.json（当前协议日）
   输出：growth-data/
     meta.json
     hash/NNNN.bin   地址哈希表（4096 槽/文件，8B/槽：u32 指纹 + u32 refIndex+1）
     refs/NNNN.bin   每个有伞下的地址：u32 dfsId + u32 伞下人数
     rec/NNNN.bin    按 DFS 区间分块的活动记录：u32 count + count×61B
   用法：
     node tools/build-growth.js
     node tools/build-growth.js --state tmp/state.json --curday 10 --out tmp/growth
*/
const fs = require("fs"), path = require("path");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const STATE = opt("state", "data/raw/state.json");
const OUT = opt("out", "growth-data");
let CURDAY = +opt("curday", 0);
if (!CURDAY) {
  try { CURDAY = JSON.parse(fs.readFileSync("data/community.json", "utf8")).curDay; } catch (e) { }
}
if (!CURDAY) { console.error("无法确定当前协议日，请传 --curday"); process.exit(1); }

const t0 = Date.now();
const s = JSON.parse(fs.readFileSync(STATE, "utf8"));
const n = s.addrs.length, par = s.par, addrs = s.addrs, ts = s.ts, flag = s.flag, day1 = s.day1;
const NF = 8, WINDOW = 7, FROM = Math.max(1, CURDAY - WINDOW + 1);
const LARGE = +opt("large", 10000), CAP = 8, HUGE_AT = +opt("huge", 100000);
const BASE = 61, STRIDE = BASE + 1 + CAP * 8;
const dayOf = t => (t < day1 ? 0 : Math.floor((t - day1) / 86400) + 1);
console.log(`节点 ${n.toLocaleString()} · 当前第 ${CURDAY} 天 · 窗口 ${FROM}-${CURDAY}`);

/* ---- 子节点 CSR ---- */
const cnt = new Uint32Array(n);
for (let i = 0; i < n; i++) if (par[i] >= 0) cnt[par[i]]++;
const cstart = new Uint32Array(n + 1);
for (let i = 0; i < n; i++) cstart[i + 1] = cstart[i] + cnt[i];
const fill = cstart.slice(0, n);
const kids = new Uint32Array(cstart[n]);
for (let i = 0; i < n; i++) if (par[i] >= 0) kids[fill[par[i]]++] = i;

/* ---- DFS 先序：dfsId 连续，子树 = 区间 ---- */
const dfs = new Uint32Array(n);
const order = new Uint32Array(n);
const stack = [];
for (let i = 0; i < n; i++) if (par[i] < 0) stack.push(i);
let t = 0;
while (stack.length) {
  const u = stack.pop();
  dfs[u] = t; order[t++] = u;
  for (let k = cstart[u + 1] - 1; k >= cstart[u]; k--) stack.push(kids[k]);
}
if (t !== n) console.warn(`警告：只遍历到 ${t}/${n} 个节点`);
const size = new Uint32Array(n);
for (let k = t - 1; k >= 0; k--) { const u = order[k]; if (par[u] >= 0) size[par[u]] += size[u] + 1; }
console.log(`DFS 完成 ${(Date.now() - t0) / 1000}s`);
const parentDfs = new Uint32Array(n).fill(0xFFFFFFFF);
for (let i = 0; i < n; i++) if (par[i] >= 0) parentDfs[dfs[i]] = dfs[par[i]];
const sizeDfs = new Uint32Array(n);
for (let i = 0; i < n; i++) sizeDfs[dfs[i]] = size[i];

/* ---- 近 7 天活动记录 ---- */
const recs = [];
for (const row of s.flows || []) {
  const key = row[0], day = key % 4096;
  if (day < FROM || day > CURDAY) continue;
  const u = Math.floor(key / 4096);
  recs.push({
    d: dfs[u], day, joins: 0,
    dai: row[1 + 0] || 0, power: row[1 + 1] || 0, turbDai: row[1 + 2] || 0, turbAi: row[1 + 3] || 0,
    burnCnt: row[1 + 4] || 0, burnLgns: row[1 + 5] || 0, veAi: row[1 + 6] || 0, fundDai: row[1 + 7] || 0,
    a: addrs[u],
  });
}
let joins = 0;
for (let i = 0; i < n; i++) {
  if ((flag[i] & 3) !== 1) continue; // 只算真正新加入，不含迁移导入
  const day = dayOf(ts[i]);
  if (day < FROM || day > CURDAY) continue;
  recs.push({ d: dfs[i], day, joins: 1, dai: 0, power: 0, turbDai: 0, turbAi: 0, burnCnt: 0, burnLgns: 0, veAi: 0, fundDai: 0, a: addrs[i] });
  joins++;
}
recs.sort((x, y) => x.d - y.d || x.day - y.day);
console.log(`记录 ${recs.length.toLocaleString()} 条（其中新加入 ${joins.toLocaleString()}）`);

/* ---- 写记录分块（按 dfsId >> 16） ---- */
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ["hash", "refs", "rec", "lineaddr"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const BLOCK = 1 << 16;
const blocks = new Map();
for (const r of recs) {
  const b = r.d >>> 16;
  let arr = blocks.get(b); if (!arr) blocks.set(b, arr = []);
  arr.push(r);
}
const pad4 = x => String(x).padStart(4, "0");
for (const [b, arr] of blocks) {
  const buf = Buffer.alloc(4 + arr.length * STRIDE);
  buf.writeUInt32LE(arr.length, 0);
  let o = 4;
  for (const r of arr) {
    buf.writeUInt32LE(r.d, o);
    buf.writeUInt8(r.day, o + 4);
    buf.writeUInt16LE(r.joins, o + 5);
    buf.writeUInt16LE(r.burnCnt, o + 7);
    buf.writeDoubleLE(r.dai, o + 9);
    buf.writeFloatLE(r.power, o + 17);
    buf.writeFloatLE(r.turbDai, o + 21);
    buf.writeFloatLE(r.turbAi, o + 25);
    buf.writeFloatLE(r.burnLgns, o + 29);
    buf.writeFloatLE(r.veAi, o + 33);
    buf.writeFloatLE(r.fundDai, o + 37);
    Buffer.from(r.a.slice(2), "hex").copy(buf, o + 41, 0, 20);
    let an = 0, ao = o + BASE + 1, v = r.d;
    while (true) {
      const p = parentDfs[v];
      if (p === 0xFFFFFFFF) break;
      if (sizeDfs[p] > LARGE && an < CAP) { buf.writeUInt32LE(p, ao); buf.writeUInt32LE(v, ao + 4); ao += 8; an++; }
      v = p;
    }
    buf.writeUInt8(an, o + BASE);
    o += STRIDE;
  }
  fs.writeFileSync(path.join(OUT, "rec", pad4(b) + ".bin"), buf);
}
const recBlocks = blocks.size, maxBlock = recBlocks ? Math.max(...blocks.keys()) : -1;

/* ---- 父指针 + 直推线地址（供按查询地址回溯所属直推线） ---- */
const pbuf = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) pbuf.writeUInt32LE(parentDfs[i], i * 4);
fs.writeFileSync(path.join(OUT, "parent.bin"), pbuf);

const lineBlocks = new Map();
for (let i = 0; i < n; i++) {
  if (par[i] < 0) continue;
  const d = dfs[i], b = d >>> 16;
  let arr = lineBlocks.get(b); if (!arr) lineBlocks.set(b, arr = []);
  arr.push([d, addrs[i]]);
}
let lineMax = -1;
for (const [b, arr] of lineBlocks) {
  if (b > lineMax) lineMax = b;
  const buf = Buffer.alloc(4 + arr.length * 24);
  buf.writeUInt32LE(arr.length, 0);
  let o = 4;
  for (const [d, a] of arr) {
    buf.writeUInt32LE(d, o);
    Buffer.from(a.slice(2), "hex").copy(buf, o + 4, 0, 20);
    o += 24;
  }
  fs.writeFileSync(path.join(OUT, "lineaddr", pad4(b) + ".bin"), buf);
}
console.log(`父指针 ${(n * 4 / 1e6).toFixed(1)} MB · 直推线地址 ${lineBlocks.size} 个分片`);
for (const k of blocks.keys()) blocks.delete(k);

/* ---- 有伞下的地址 → refs + 哈希表 ---- */
function fnv(hex) {
  let h = 0x811c9dc5;
  for (let i = 2; i < 42; i += 2) { h ^= parseInt(hex.slice(i, i + 2), 16); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
let refCount = 0;
for (let i = 0; i < n; i++) if (size[i] > 0) refCount++;
const SLOT_SHF = Math.max(12, Math.ceil(Math.log2(refCount * 2.5)));
const SLOTS = 1 << SLOT_SHF, MASK = SLOTS - 1;
const fp = new Uint32Array(SLOTS), rf = new Uint32Array(SLOTS); // rf = refIndex+1, 0 空
const refDfs = new Uint32Array(refCount), refSize = new Uint32Array(refCount);
let ri = 0, maxProbe = 0;
for (let i = 0; i < n; i++) {
  if (size[i] <= 0) continue;
  const idx = ri++;
  refDfs[idx] = dfs[i]; refSize[idx] = size[i];
  const h = fnv(addrs[i]);
  let slot = h & MASK, p = 0;
  while (rf[slot] !== 0) { slot = (slot + 1) & MASK; p++; }
  if (p > maxProbe) maxProbe = p;
  fp[slot] = h; rf[slot] = idx + 1;
}
const CHUNK_SHF = 12, CHUNK = 1 << CHUNK_SHF, CMASK = CHUNK - 1;
const hashChunks = SLOTS >>> CHUNK_SHF, refChunks = Math.ceil(refCount / CHUNK);
for (let c = 0; c < hashChunks; c++) {
  const buf = Buffer.alloc(CHUNK * 8);
  for (let k = 0; k < CHUNK; k++) {
    const slot = c * CHUNK + k;
    buf.writeUInt32LE(fp[slot], k * 8);
    buf.writeUInt32LE(rf[slot], k * 8 + 4);
  }
  fs.writeFileSync(path.join(OUT, "hash", pad4(c) + ".bin"), buf);
}
for (let c = 0; c < refChunks; c++) {
  const start = c * CHUNK, end = Math.min(refCount, start + CHUNK);
  const buf = Buffer.alloc((end - start) * 8);
  for (let k = start; k < end; k++) {
    buf.writeUInt32LE(refDfs[k], (k - start) * 8);
    buf.writeUInt32LE(refSize[k], (k - start) * 8 + 4);
  }
  fs.writeFileSync(path.join(OUT, "refs", pad4(c) + ".bin"), buf);
}

const meta = {
  at: Date.now(), curDay: CURDAY, windowFrom: FROM,
  nodes: n, recordCount: recs.length, refCount,
  hash: { slotBits: SLOT_SHF, chunkShift: CHUNK_SHF, chunks: hashChunks },
  refs: { chunkShift: CHUNK_SHF, chunks: refChunks },
  parent: { bytes: n * 4 },
  lineaddr: { blockShift: 16, blocks: lineMax + 1 },
  rec: { blockShift: 16, blocks: maxBlock + 1, stride: STRIDE, large: LARGE, largeCap: CAP },
  hugeAt: HUGE_AT,
  maxProbe,
};
// rec.blocks 需要按最大块号 +1，重新数一遍块号
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
console.log(`完成：refs ${refCount.toLocaleString()} · 记录块 ${recBlocks} · 哈希槽 ${SLOTS.toLocaleString()}（最大探测 ${maxProbe}）· 用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
