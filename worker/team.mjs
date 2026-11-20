/* 团队新增查询（Worker + 本地测试共用）
   read(path) -> ArrayBuffer/Promise<ArrayBuffer>
   meta 来自 growth-data/meta.json */
"use strict";

let PARENT = null, PARENT_AT = 0;
const LINE_CACHE = new Map();
let LARGE_CACHE = null, LARGE_AT = 0;
const METRICS = ["joins", "dai", "power", "turbDai", "turbAi", "burnCnt", "burnLgns", "veAi", "fundDai"];
const BASE = 61;

function fnv(hex) {
  let h = 0x811c9dc5;
  for (let i = 2; i < 42; i += 2) { h ^= parseInt(hex.slice(i, i + 2), 16); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const pad4 = x => String(x).padStart(4, "0");
const hexAddr = (dv, o) => {
  let s = "0x";
  for (let i = 0; i < 20; i++) s += dv.getUint8(o + i).toString(16).padStart(2, "0");
  return s;
};
function blank() {
  const o = {};
  for (const k of METRICS) o[k] = 0;
  return o;
}
function add(dst, src) {
  for (const k of METRICS) dst[k] += src[k];
}

export async function queryTeam(addr, read, meta) {
  addr = String(addr || "").toLowerCase();
  const STRIDE = meta.rec.stride || 61;
  const cache = new Map();
  const get = async p => {
    let b = cache.get(p);
    if (!b) { const ab = await read(p); b = new Uint8Array(ab); cache.set(p, b); }
    return b;
  };

  /* 1. 地址哈希 → ref */
  const h = fnv(addr), MASK = (1 << meta.hash.slotBits) - 1;
  let slot = h & MASK, ref = -1, probes = 0;
  for (; probes < 512; probes++) {
    const c = slot >>> meta.hash.chunkShift;
    const buf = await get(`hash/${pad4(c)}.bin`);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const off = (slot & ((1 << meta.hash.chunkShift) - 1)) * 8;
    const fp = dv.getUint32(off, true), r = dv.getUint32(off + 4, true);
    if (!r) break;
    if (fp === h) { ref = r - 1; break; }
    slot = (slot + 1) & MASK;
  }
  const base = { addr, at: meta.at, curDay: meta.curDay, days: [meta.windowFrom, meta.curDay], totals: { d0: blank(), d1: blank(), d7: blank() }, rows: [], count: 0 };
  if (ref < 0) return { ...base, found: false, reason: "该地址近 7 天没有伞下记录（或没有下级）" };

  /* 2. ref → dfs 区间 */
  const rc = ref >>> meta.refs.chunkShift;
  const rbuf = await get(`refs/${pad4(rc)}.bin`);
  const rdv = new DataView(rbuf.buffer, rbuf.byteOffset, rbuf.byteLength);
  const roff = (ref & ((1 << meta.refs.chunkShift) - 1)) * 8;
  const start = rdv.getUint32(roff, true), size = rdv.getUint32(roff + 4, true);
  if (!size) return { ...base, found: false, reason: "该地址没有下级" };
  const lastDfs = start + size; // size 不含自己：子树区间 = (start, start+size]
  const huge = size > (meta.hugeAt ?? 100000); // 超大团队用构建时预存的“大祖先→直推线”条目，不再逐层爬树

  if (huge) {
    let lj = (LARGE_CACHE && LARGE_AT === meta.at) ? LARGE_CACHE : null;
    if (!lj) { lj = JSON.parse(new TextDecoder().decode(await read("large.json"))); LARGE_CACHE = lj; LARGE_AT = meta.at; }
    const item = (lj.items || []).find(x => x.dfs === start);
    if (item) {
      const ids = new Set((item.lines || []).map(l => l.dfs).filter(id => id >= 0));
      const byBlock = new Map();
      for (const id of ids) { const b = id >>> meta.lineaddr.blockShift; let arr = byBlock.get(b); if (!arr) byBlock.set(b, arr = []); arr.push(id); }
      const lineAddr = new Map();
      for (const b of byBlock.keys()) {
        const key = meta.at + ":" + b;
        let m = LINE_CACHE.get(key);
        if (!m) {
          const buf = await get(`lineaddr/${pad4(b)}.bin`);
          const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
          const cnt = dv.getUint32(0, true);
          m = new Map();
          for (let k = 0; k < cnt; k++) { const o = 4 + k * 24; m.set(dv.getUint32(o, true), hexAddr(dv, o + 4)); }
          if (LINE_CACHE.size < 200) LINE_CACHE.set(key, m);
        }
        for (const [k2, v2] of m) lineAddr.set(k2, v2);
      }
      const lineSummary = (item.lines || []).map(l => ({ line: lineAddr.get(l.dfs) || null, n: l.n, m: l.m })).sort((a, b) => b.m.dai - a.m.dai);
      return { ...base, found: true, totals: { d0: item.d0, d1: item.d1, d7: item.d7 }, rows: [], lineSummary, count: 0, start, size, tooLarge: true };
    }
  }

  /* 2.5 父指针 + 直推线：从记录节点往上走到查询地址的第一层下级 */
  let par = null;
  if (!huge) {
    if (PARENT && PARENT_AT === meta.at) par = PARENT;
    else { const parentBuf = await read("parent.bin"); PARENT = new Uint32Array(parentBuf); PARENT_AT = meta.at; par = PARENT; }
  }
  const lineCache = new Map();
  const lineOf = huge ? null : (u) => {
    let v = u, guard = 0;
    while (par[v] !== start) {
      const p = par[v];
      if (p === 0xFFFFFFFF || ++guard > 400) return v;
      v = p;
    }
    return v;
  };

  /* 3. 扫描子树内的记录块 */
  const map = new Map(), hugeLine = new Map();
  const totals = { d0: blank(), d1: blank(), d7: blank() };
  const d0 = meta.curDay, d1 = d0 - 1, d7 = meta.windowFrom;
  for (let b = start >>> meta.rec.blockShift; b <= (lastDfs >>> meta.rec.blockShift); b++) {
    const buf = await get(`rec/${pad4(b)}.bin`);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const count = dv.getUint32(0, true);
    let o = 4;
    for (let k = 0; k < count; k++, o += STRIDE) {
      const d = dv.getUint32(o, true);
      if (d <= start || d > lastDfs) continue;
      const day = dv.getUint8(o + 4);
      if (day < d7 || day > d0) continue;
      const rec = {
        joins: dv.getUint16(o + 5, true), burnCnt: dv.getUint16(o + 7, true),
        dai: dv.getFloat64(o + 9, true),
        power: dv.getFloat32(o + 17, true), turbDai: dv.getFloat32(o + 21, true), turbAi: dv.getFloat32(o + 25, true),
        burnLgns: dv.getFloat32(o + 29, true), veAi: dv.getFloat32(o + 33, true), fundDai: dv.getFloat32(o + 37, true),
      };
      const a = hexAddr(dv, o + 41);
      let ln = -1;
      if (huge) {
        const an = dv.getUint8(o + BASE);
        for (let q = 0; q < an; q++) {
          const ao2 = o + BASE + 1 + q * 8;
          if (dv.getUint32(ao2, true) === start) { ln = dv.getUint32(ao2 + 4, true); break; }
        }
        let lm = hugeLine.get(ln);
        if (!lm) hugeLine.set(ln, lm = { lineDfs: ln, s: new Set(), m: blank() });
        lm.s.add(a); add(lm.m, rec);
        if (day === d0) add(totals.d0, rec);
        if (day === d1) add(totals.d1, rec);
        add(totals.d7, rec);
      } else {
        if (!lineCache.has(d)) lineCache.set(d, lineOf(d));
        ln = lineCache.get(d);
        let row = map.get(a);
        if (!row) map.set(a, row = { a, d0: blank(), d1: blank(), d7: blank(), lineDfs: ln });
        add(row.d7, rec);
        if (day === d0) add(row.d0, rec);
        if (day === d1) add(row.d1, rec);
      }
    }
  }

  if (huge) {
    const ids = new Set([...hugeLine.keys()].filter(id => id >= 0));
    const byBlock = new Map();
    for (const id of ids) { const b = id >>> meta.lineaddr.blockShift; let arr = byBlock.get(b); if (!arr) byBlock.set(b, arr = []); arr.push(id); }
    const lineAddr = new Map();
    for (const b of byBlock.keys()) {
      const key = meta.at + ":" + b;
      let m = LINE_CACHE.get(key);
      if (!m) {
        const buf = await get(`lineaddr/${pad4(b)}.bin`);
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const cnt = dv.getUint32(0, true);
        m = new Map();
        for (let k = 0; k < cnt; k++) { const o = 4 + k * 24; m.set(dv.getUint32(o, true), hexAddr(dv, o + 4)); }
        if (LINE_CACHE.size < 200) LINE_CACHE.set(key, m);
      }
      for (const [k2, v2] of m) lineAddr.set(k2, v2);
    }
    const lineSummary = [...hugeLine.values()].map(x => ({ line: lineAddr.get(x.lineDfs) || null, n: x.s.size, m: x.m })).sort((a, b) => b.m.dai - a.m.dai);
    return { ...base, found: true, totals, rows: [], lineSummary, count: 0, start, size, tooLarge: true };
  }

  const rows = [...map.values()];
  {
    const lineIds = new Set(rows.map(r => r.lineDfs).filter(id => id >= 0));
    const byBlock = new Map();
    for (const id of lineIds) { const b = id >>> meta.lineaddr.blockShift; let arr = byBlock.get(b); if (!arr) byBlock.set(b, arr = []); arr.push(id); }
    const lineAddr = new Map();
    for (const b of byBlock.keys()) {
      const key = meta.at + ":" + b;
      let m = LINE_CACHE.get(key);
      if (!m) {
        const buf = await get(`lineaddr/${pad4(b)}.bin`);
        const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        const cnt = dv.getUint32(0, true);
        m = new Map();
        for (let k = 0; k < cnt; k++) { const o = 4 + k * 24; m.set(dv.getUint32(o, true), hexAddr(dv, o + 4)); }
        if (LINE_CACHE.size < 200) LINE_CACHE.set(key, m);
      }
      for (const [k2, v2] of m) lineAddr.set(k2, v2);
    }
    for (const r of rows) { r.line = lineAddr.get(r.lineDfs) || null; delete r.lineDfs; }
  }
  rows.sort((x, y) => (y.d7.dai - x.d7.dai) || (y.d7.power - x.d7.power) || (y.d7.joins - x.d7.joins));
  for (const r of rows) { add(totals.d0, r.d0); add(totals.d1, r.d1); add(totals.d7, r.d7); }
  for (const r of rows) for (const w of ["d0", "d1", "d7"]) { delete r[w].burnCnt; delete r[w].fundDai; delete r[w].turbAi; }
  return { ...base, found: true, totals, rows, count: rows.length, start, size, lineUnavailable: false };

}
