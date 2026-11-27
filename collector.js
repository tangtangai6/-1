#!/usr/bin/env node
/* LGNS Terminal 本地采集器（第二期）
   作用：扫 Anubis 链历史事件建索引 → 输出 ./data/*.json，同时开一个本地网页服务器。
   用法：
     node collector.js            采集 + 打开 http://localhost:8787（之后每 10 分钟增量更新）
     node collector.js --once     只采集一轮就退出（不开服务器）
     node collector.js --no-open  不自动打开浏览器
   环境变量：PORT=8787  MAX_SEC=（单轮扫描最长秒数，用于分段跑）
   只读公开数据，不需要私钥，不发交易。需要 Node.js 18 或更高版本。
   数据源：
     ① Community 合约 Joined 事件 → 全量推荐关系树（官方接口直推列表最多 20 条，无法遍历）
     ② PowerLedger / Turbine / veAiLGNS 事件 → 每个地址每个协议日的入金、销毁、涡轮、锁仓
     ③ 官方 /level/{地址} → 等级、锁仓价值、三区业绩（只查有锁仓记录的地址）
     ④ Blockscout 持币榜 → 每日快照，用于变动追踪 */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");

const ROOT = __dirname, DATA = path.join(ROOT, "data"), RAW = path.join(DATA, "raw"), SNAP = path.join(DATA, "snap");
const PORT = +process.env.PORT || 8787, MAX_SEC = +process.env.MAX_SEC || 0;
const ARGS = new Set(process.argv.slice(2));
const RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];
const API = "https://awakehelix.io/api/v1", BS = "https://browser.anubispace.org/api/v2";
const lc = s => s.toLowerCase();
const A = {
  COMMUNITY: lc("0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993"), LEDGER: lc("0x9E68F61E2615cc1D2C4a2D0026bFc1EBFdf68C1b"),
  TURBINE: lc("0xE884A336550a4482Ca6A17A3F93aa30Ed4eD9BaD"), VE: lc("0x52D7f7745D4Ba3dE6C3A0B503815878aeE7eDf14"),
  CLOCK: lc("0x6C5352E15A8327C3F44898FE220100Edc2989C58"), AILGNS: lc("0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB"),
};
const T = {
  JOINED: "0xd12045cbb824dccd3bf8edffc06c251eca57b57aa8af4b78ab2f2653007c808c", // Joined(user, referrer, roomId)
  IMPORTED: "0x124de1528336baeebc201d0e0179dae3a1b40fcf7be0cdec55ac37ae622b6b18", // 迁移导入标记(user, referrer, importer)
  DAIQ: "0x41fd86243836b698405554ae311d223dec7e355200f05fd658fb3adffe567668", // PowerDaiQueued(user, idx | dai, power)
  BURNQ: "0x16b309670cfc6e855d1def7ee55e395827e8a8694f4c701ffe0adbc7b75121cc", // PowerBurnQueued(user, idx | lgns, power)
  FUND: "0xd3794eb258b6d6470e6b4b40b19081844bcfa266c27425a28f5b2140203ccd9d", // PowerFundraiseImported(idx, user | dai, _, power, _)
  TURB: "0xacaa259a17211f2c464e051f86e9a8b4fccdd520290cc654066eb91e6d23359a", // 涡轮激活(user | ai, dai, fee, ...)
  VEC: "0x1c1666071ebc2feb287143fa5d97ac009e6c0847025936486d6c18a84faf8286", // VePositionCreated(pid, user | kind, amount, start, lock)
  VEP: "0x534db48291adb4ff376c3568d95d61b23cc17efe38330d22ac0621fb90026a94", // PermanentBurned(user | amount)
  VECLAIM: "0x7b2a32694f8db1ed4bc491796d777943bdab6d54f5540ea62d9ac7372ef363dd", // VePrincipalClaimed(pid, user | amount)
  VEACT: "0xeb71d88cb64bca815da70ac16e849563b5480bbf99b9f2350384e69eedf1f095", // VePositionActivation(pid, user | ...)
};
// 第二条扫描线：协议级每日数据（feed.json，给一期的行情 / 排放 / 销毁页用）
const FA = { PAIR: lc("0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0"), CVAULT: lc("0x3DEea5f638cA0dFb03A0873CF4c0b90BA50E1aA2"), FEESWAP: lc("0xefcba560a18210a2c7103a09ddcd24a5fde5afda") };
const FT = {
  SELLFEE: "0x4aacc2505eb4f7f305c0b0d2d4b09395e7cc220a1d1a1fa0b05cf598dc46a9c6", // SellFeeTaken(from, pair | voter, community, reserve)，AiLGNS 合约
  SWAP: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822", // Swap(sender, to | a0In, a1In, a0Out, a1Out)，token0=AiLGNS token1=DAI
  STATIC: "0x4c80b813621f984c5d34c5126aabaccd262b9ca81236927656681e7303356164", // StaticClaimed(user | amount)，社区金库
  DYN: "0x834a7928c8b068a81465dbd0b4c6a4f2c3a479186557589352b852ed6c7fe4f8", // DynamicClaimed(user | amount, ...)，社区金库
};
const FEED_START = 14305005; // AiLGNS 代币创建区块
const START = 1841628, STEP = 5000, WORKERS = 6, SCAN_EVERY = 10 * 60e3, LEVEL_EVERY = 60 * 60e3;
// 每条流水的字段（每个地址每个协议日一行）
const F_DAI = 0, F_POWER = 1, F_TURBDAI = 2, F_TURBAI = 3, F_BURNCNT = 4, F_BURNLGNS = 5, F_VEAI = 6, F_FUNDDAI = 7, NF = 8;

/* ---------------- 工具 ---------------- */
const log = (...a) => console.log(new Date().toLocaleTimeString("zh-CN", { hour12: false }), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const word = (hex, i) => { const h = hex.slice(2 + i * 64, 2 + (i + 1) * 64); return h.length === 64 ? BigInt("0x" + h) : 0n; };
const big = (b, dec = 18) => Number(b / 10n ** BigInt(dec - 6)) / 1e6;
const topicAddr = t => t ? "0x" + t.slice(26).toLowerCase() : null;
const r6 = x => Math.round(x * 1e6) / 1e6;
const bjDate = (ms = Date.now()) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10);
function writeJSON(file, obj) { const tmp = file + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, file); }
function readJSON(file, d = null) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return d; } }

let ri = 0;
async function rpc(method, params, tries = 4) {
  let err;
  for (let k = 0; k < tries; k++) {
    const url = RPCS[(ri + k) % RPCS.length], ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal });
      const j = await r.json(); if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) { err = e; ri = (ri + 1) % RPCS.length; await sleep(400 * (k + 1)); } finally { clearTimeout(t); }
  }
  throw err;
}
async function getJ(url, tries = 3) {
  let err;
  for (let k = 0; k < tries; k++) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try { const r = await fetch(url, { signal: ctl.signal }); if (r.status === 404) return null; if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
    catch (e) { err = e; await sleep(600 * (k + 1)); } finally { clearTimeout(t); }
  }
  throw err;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

/* ---------------- 状态（可断点续扫） ---------------- */
const S = {
  cursor: START - 1, day1: null, dup: 0,
  addrs: [], par: [], ts: [], flag: [], // flag: 1=已见 Joined, 2=迁移导入
  idx: new Map(), flows: new Map(), veSet: new Set(),
  levels: null, levelsAt: 0, lastBuild: null, scanning: null,
};
const STATE = path.join(RAW, "state.json");
function getIdx(a) { let i = S.idx.get(a); if (i == null) { i = S.addrs.length; S.addrs.push(a); S.par.push(-1); S.ts.push(0); S.flag.push(0); S.idx.set(a, i); } return i; }
function loadState() {
  const s = readJSON(STATE); if (!s || s.v !== 1) return;
  Object.assign(S, { cursor: s.cursor, day1: s.day1, dup: s.dup || 0, addrs: s.addrs, par: s.par, ts: s.ts, flag: s.flag, levelsAt: s.levelsAt || 0 });
  S.addrs.forEach((a, i) => S.idx.set(a, i));
  for (const r of s.flows) S.flows.set(r[0], r.slice(1));
  S.veSet = new Set(s.veSet || []);
  S.levels = readJSON(path.join(DATA, "levels.json"));
  log(`读取断点：已扫到区块 ${S.cursor}，社区成员 ${S.addrs.length}，流水 ${S.flows.size} 行`);
}
function saveState() {
  const flows = []; for (const [k, v] of S.flows) flows.push([k, ...v.map(r6)]);
  writeJSON(STATE, { v: 1, cursor: S.cursor, day1: S.day1, dup: S.dup, addrs: S.addrs, par: S.par, ts: S.ts, flag: S.flag, flows, veSet: [...S.veSet], levelsAt: S.levelsAt });
}

/* ---------------- 协议日 ---------------- */
async function initClock() {
  const cur = Number(BigInt(await rpc("eth_call", [{ to: A.CLOCK, data: "0x5c9302c9" }, "latest"])));
  const ds = Number(BigInt(await rpc("eth_call", [{ to: A.CLOCK, data: "0x65b09d2d" + cur.toString(16).padStart(64, "0") }, "latest"])));
  S.day1 = ds - (cur - 1) * 86400;
}
const dayOf = ts => ts < S.day1 ? 0 : Math.floor((ts - S.day1) / 86400) + 1;
const curDay = () => dayOf(Math.floor(Date.now() / 1000));
function addFlow(user, ts, f, v) {
  const i = getIdx(user), k = i * 4096 + dayOf(ts);
  let r = S.flows.get(k); if (!r) { r = new Array(NF).fill(0); S.flows.set(k, r); }
  r[f] += v;
}

/* ---------------- 扫链 ---------------- */
const ADDRS = [A.COMMUNITY, A.LEDGER, A.TURBINE, A.VE];
const TOPICS = [T.JOINED, T.IMPORTED, T.DAIQ, T.BURNQ, T.FUND, T.TURB, T.VEC, T.VEP, T.VECLAIM, T.VEACT];
const blockTs = new Map();
async function fetchChunk(a, b) {
  let logs;
  try { logs = await rpc("eth_getLogs", [{ address: ADDRS, topics: [TOPICS], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }], b - a > 200 ? 2 : 6); }
  catch (e) { if (b - a < 2) throw e; const m = (a + b) >> 1; return [...await fetchChunk(a, m), ...await fetchChunk(m + 1, b)]; } // 太密 → 对半拆
  // 少数节点日志里没有 blockTimestamp → 补读区块时间
  const need = [...new Set(logs.filter(l => !l.blockTimestamp).map(l => l.blockNumber))].filter(n => !blockTs.has(n));
  for (const n of need) { const blk = await rpc("eth_getBlockByNumber", [n, false]); blockTs.set(n, parseInt(blk.timestamp, 16)); }
  // 立刻压成精简格式，释放原始对象
  return logs.map(l => ({ b: parseInt(l.blockNumber, 16), i: parseInt(l.logIndex, 16), ts: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : blockTs.get(l.blockNumber), address: l.address, topics: l.topics, data: l.data }));
}
function applyLog(l) {
  const ts = l.ts, t0 = l.topics[0], addr = l.address.toLowerCase();
  if (addr === A.COMMUNITY) {
    if (t0 === T.JOINED) {
      const u = getIdx(topicAddr(l.topics[1])); if (S.flag[u] & 1) { S.dup++; return; }
      const ref = topicAddr(l.topics[2]); S.flag[u] |= 1; S.ts[u] = ts;
      S.par[u] = /^0x0{38}..$/.test(ref) ? -1 : getIdx(ref); // 0x…00 / 0x…01 = 根
    } else if (t0 === T.IMPORTED) { S.flag[getIdx(topicAddr(l.topics[1]))] |= 2; }
    return;
  }
  const d = l.data;
  switch (t0) {
    case T.DAIQ: { const u = topicAddr(l.topics[1]); addFlow(u, ts, F_DAI, big(word(d, 0))); addFlow(u, ts, F_POWER, big(word(d, 1))); break; }
    case T.BURNQ: { const u = topicAddr(l.topics[1]); addFlow(u, ts, F_BURNCNT, 1); addFlow(u, ts, F_BURNLGNS, big(word(d, 0), 9)); addFlow(u, ts, F_POWER, big(word(d, 1))); break; }
    case T.FUND: { const u = topicAddr(l.topics[2]); addFlow(u, ts, F_FUNDDAI, big(word(d, 0))); break; }
    case T.TURB: { const u = topicAddr(l.topics[1]); addFlow(u, ts, F_TURBAI, big(word(d, 0))); addFlow(u, ts, F_TURBDAI, big(word(d, 1))); break; }
    case T.VEC: { const u = topicAddr(l.topics[2]); S.veSet.add(u); addFlow(u, ts, F_VEAI, big(word(d, 1))); break; }
    case T.VEP: { const u = topicAddr(l.topics[1]); S.veSet.add(u); addFlow(u, ts, F_VEAI, big(word(d, 0))); break; }
    case T.VECLAIM: case T.VEACT: { S.veSet.add(topicAddr(l.topics[2])); break; }
  }
}
async function scan() {
  const head = parseInt(await rpc("eth_blockNumber", []), 16) - 3;
  if (head <= S.cursor) return true;
  const t0 = Date.now(), from0 = S.cursor + 1, total = head - from0 + 1;
  S.scanning = { from: from0, to: head, done: 0 };
  log(`扫描区块 ${from0} → ${head}（${total.toLocaleString()} 个区块）`);
  let lastSave = Date.now(), step = STEP;
  while (S.cursor < head) {
    const chunks = []; for (let a = S.cursor + 1; a <= head && chunks.length < WORKERS * 2; a += step) chunks.push([a, Math.min(head, a + step - 1)]);
    const res = new Array(chunks.length);
    await pool(chunks, WORKERS, async ([a, b], i) => { res[i] = await fetchChunk(a, b); });
    let peak = 0;
    for (let k = 0; k < res.length; k++) { const logs = res[k]; peak = Math.max(peak, logs.length); logs.sort((x, y) => x.b - y.b || x.i - y.i); logs.forEach(applyLog); res[k] = null; }
    // 日志密集（迁移导入期）时缩小步长，稀疏时放大
    step = peak > 20000 ? Math.max(250, step >> 1) : peak < 5000 ? Math.min(STEP, step * 2) : step;
    S.cursor = chunks[chunks.length - 1][1]; blockTs.clear();
    S.scanning.done = S.cursor - from0 + 1;
    const pct = (S.scanning.done / total * 100).toFixed(1), el = (Date.now() - t0) / 1000;
    process.stdout.write(`\r  进度 ${pct}% · 区块 ${S.cursor} · 成员 ${S.addrs.length.toLocaleString()} · ${el.toFixed(0)}s   `);
    if (Date.now() - lastSave > 90e3) { saveState(); lastSave = Date.now(); }
    if (MAX_SEC && el > MAX_SEC) { process.stdout.write("\n"); log(`达到 MAX_SEC=${MAX_SEC}，保存断点`); S.scanning = null; saveState(); return false; }
  }
  process.stdout.write("\n"); S.scanning = null; saveState();
  return true;
}

/* ---------------- 第二条扫描线：协议每日数据 → feed.json ---------------- */
// 每天一行，金额用 BigInt 精确累加（字符串存盘）
const FK = ["sfV", "sfC", "sfR", "st", "dy", "vol", "volUser", "sellDai", "buyDai", "turbBuyDai", "feeSwapDai", "lbL", "lbP"];
const FN = ["sells", "buys", "turbBuys", "feeSwaps", "stN", "dyN", "lbN", "sfN"];
const FSTATE = path.join(RAW, "feed-state.json");
const SF = { cursor: FEED_START - 1, days: {} };
function loadFeed() { const s = readJSON(FSTATE); if (!s || s.v !== 1) return; SF.cursor = s.cursor; for (const [d, r] of Object.entries(s.days)) { const o = {}; FK.forEach(k => o[k] = BigInt(r[k] || "0")); FN.forEach(k => o[k] = r[k] || 0); SF.days[d] = o; } }
function saveFeed() { const days = {}; for (const [d, r] of Object.entries(SF.days)) { const o = {}; FK.forEach(k => o[k] = r[k].toString()); FN.forEach(k => o[k] = r[k]); days[d] = o; } writeJSON(FSTATE, { v: 1, cursor: SF.cursor, days }); }
function fday(ts) { const d = dayOf(ts); let r = SF.days[d]; if (!r) { r = {}; FK.forEach(k => r[k] = 0n); FN.forEach(k => r[k] = 0); SF.days[d] = r; } return r; }
async function fetchFeed(a, b) {
  let logs;
  try { logs = await rpc("eth_getLogs", [{ address: [A.AILGNS, FA.PAIR, FA.CVAULT, A.LEDGER], topics: [[FT.SELLFEE, FT.SWAP, FT.STATIC, FT.DYN, T.BURNQ]], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }], b - a > 200 ? 2 : 6); }
  catch (e) { if (b - a < 2) throw e; const m = (a + b) >> 1; return [...await fetchFeed(a, m), ...await fetchFeed(m + 1, b)]; }
  const need = [...new Set(logs.filter(l => !l.blockTimestamp).map(l => l.blockNumber))];
  const tm = {}; for (const n of need) tm[n] = parseInt((await rpc("eth_getBlockByNumber", [n, false])).timestamp, 16);
  return logs.map(l => ({ ts: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : tm[l.blockNumber], a: l.address.toLowerCase(), t: l.topics, d: l.data }));
}
function applyFeed(l) {
  const r = fday(l.ts), t0 = l.t[0], d = l.d;
  if (t0 === FT.SELLFEE && l.a === A.AILGNS) { r.sfV += word(d, 0); r.sfC += word(d, 1); r.sfR += word(d, 2); r.sfN++; }
  else if (t0 === FT.SWAP && l.a === FA.PAIR) {
    const a0In = word(d, 0), a1In = word(d, 1), a1Out = word(d, 3), dai = a1In + a1Out, to = topicAddr(l.t[2]);
    r.vol += dai;
    if (to === A.TURBINE) { r.turbBuys++; r.turbBuyDai += dai; }        // 涡轮激活时协议买入
    else if (to === FA.FEESWAP) { r.feeSwaps++; r.feeSwapDai += dai; }  // 卖出手续费换成 DAI
    else { r.volUser += dai; if (a0In > 0n) { r.sells++; r.sellDai += a1Out; } else if (a1In > 0n) { r.buys++; r.buyDai += a1In; } }
  }
  else if (t0 === FT.STATIC && l.a === FA.CVAULT) { r.st += word(d, 0); r.stN++; }
  else if (t0 === FT.DYN && l.a === FA.CVAULT) { r.dy += word(d, 0); r.dyN++; }
  else if (t0 === T.BURNQ && l.a === A.LEDGER) { r.lbN++; r.lbL += word(d, 0); r.lbP += word(d, 1); }
}
async function scanFeed() {
  const head = parseInt(await rpc("eth_blockNumber", []), 16) - 3;
  if (head <= SF.cursor) return true;
  const t0 = Date.now(), from0 = SF.cursor + 1, total = head - from0 + 1;
  if (total > 50000) log(`扫描协议每日数据（卖出手续费 / 成交 / 领取）：区块 ${from0} → ${head}`);
  S.scanning = { from: from0, to: head, done: 0, what: "feed" };
  let lastSave = Date.now();
  while (SF.cursor < head) {
    const chunks = []; for (let a = SF.cursor + 1; a <= head && chunks.length < WORKERS * 2; a += STEP) chunks.push([a, Math.min(head, a + STEP - 1)]);
    const res = new Array(chunks.length);
    await pool(chunks, WORKERS, async ([a, b], i) => { res[i] = await fetchFeed(a, b); });
    for (const logs of res) logs.forEach(applyFeed);
    SF.cursor = chunks[chunks.length - 1][1]; S.scanning.done = SF.cursor - from0 + 1;
    const el = (Date.now() - t0) / 1000;
    if (total > 50000) process.stdout.write(`\r  进度 ${(S.scanning.done / total * 100).toFixed(1)}% · 区块 ${SF.cursor} · ${el.toFixed(0)}s   `);
    if (Date.now() - lastSave > 60e3) { saveFeed(); lastSave = Date.now(); }
    if (MAX_SEC && el > MAX_SEC) { process.stdout.write("\n"); log(`达到 MAX_SEC=${MAX_SEC}，保存断点`); S.scanning = null; saveFeed(); return false; }
  }
  if (total > 50000) process.stdout.write("\n");
  S.scanning = null; saveFeed(); return true;
}
function buildFeed() {
  const ds = Object.keys(SF.days).map(Number).filter(d => d >= 1).sort((a, b) => a - b);
  const tot = { lgnsBurned: 0n, lgnsBurnCount: 0, lgnsBurnPower: 0n };
  const days = ds.map(d => { const r = SF.days[d]; tot.lgnsBurned += r.lbL; tot.lgnsBurnCount += r.lbN; tot.lgnsBurnPower += r.lbP;
    return { day: d, sellFee: { voter: r.sfV.toString(), community: r.sfC.toString(), reserve: r.sfR.toString() }, sellFeeCount: r.sfN,
      volumeDai: r.vol.toString(), volumeUserDai: r.volUser.toString(), sellDai: r.sellDai.toString(), buyDai: r.buyDai.toString(), turbineBuyDai: r.turbBuyDai.toString(), feeSwapDai: r.feeSwapDai.toString(),
      sells: r.sells, buys: r.buys, turbineBuys: r.turbBuys, feeSwaps: r.feeSwaps,
      staticClaimed: r.st.toString(), staticClaims: r.stN, dynamicClaimed: r.dy.toString(), dynamicClaims: r.dyN,
      lgnsBurn: { count: r.lbN, lgns: r.lbL.toString(), power: r.lbP.toString() } }; });
  // 销毁 AiLGNS 换算力：PowerLedger 合约至今没有发出过这类事件（已逐个核对合约字节码里的全部事件），所以留空，不填 0
  writeJSON(path.join(DATA, "feed.json"), { at: Date.now(), block: SF.cursor, curDay: curDay(), totals: { ...tot, lgnsBurned: tot.lgnsBurned.toString(), lgnsBurnPower: tot.lgnsBurnPower.toString(), ailgnsBurned: null, ailgnsBurnCount: null }, days });
}

/* ---------------- 树计算 ---------------- */
let G = null; // { kids, kidStart, order, depth, size, byUser }
function buildTree() {
  const n = S.addrs.length, cnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) if (S.par[i] >= 0) cnt[S.par[i]]++;
  const kidStart = new Int32Array(n + 1); for (let i = 0; i < n; i++) kidStart[i + 1] = kidStart[i] + cnt[i];
  const fill = kidStart.slice(0, n), kids = new Int32Array(kidStart[n]);
  for (let i = 0; i < n; i++) if (S.par[i] >= 0) kids[fill[S.par[i]]++] = i;
  const depth = new Int32Array(n).fill(-1), order = new Int32Array(n); let h = 0, t = 0;
  for (let i = 0; i < n; i++) if (S.par[i] < 0 && (S.flag[i] & 1)) { depth[i] = 0; order[t++] = i; }
  while (h < t) { const u = order[h++]; for (let k = kidStart[u]; k < kidStart[u + 1]; k++) { const v = kids[k]; if (depth[v] < 0) { depth[v] = depth[u] + 1; order[t++] = v; } } }
  const size = new Int32Array(n); // 伞下人数（不含自己）
  for (let k = t - 1; k >= 0; k--) { const u = order[k], p = S.par[u]; if (p >= 0 && depth[p] >= 0) size[p] += size[u] + 1; }
  const byUser = new Map(); for (const [key, v] of S.flows) { const u = Math.floor(key / 4096), d = key % 4096; let a = byUser.get(u); if (!a) byUser.set(u, a = []); a.push([d, v]); }
  G = { kids, kidStart, order: order.subarray(0, t), depth, size, byUser, reached: t };
}
// 每个节点「自己」在 [from,to] 日内的新增；isNew 只算真正新加入（非迁移导入）
function selfSum(u, from, to, out) {
  const fl = G.byUser.get(u); if (fl) for (const [d, v] of fl) if (d >= from && d <= to) for (let f = 0; f < NF; f++) out[f] += v[f];
  const jd = dayOf(S.ts[u]); if ((S.flag[u] & 3) === 1 && jd >= from && jd <= to) out[NF]++;
  return out;
}
// 全树按窗口把「自己」累加到祖先 → 每个人的团队窗口业绩（不含自己）
// 为省内存只保留 4 个字段：0 新加入人数 1 入金 DAI 2 涡轮 DAI 3 锁仓 AiLGNS
const WK = 4, WMAP = [NF, F_DAI, F_TURBDAI, F_VEAI];
function teamWindow(from, to) {
  const n = S.addrs.length, acc = new Float64Array(n * WK), tmp = new Array(NF + 1);
  for (let k = G.order.length - 1; k >= 0; k--) {
    const u = G.order[k], p = S.par[u]; if (p < 0) continue;
    tmp.fill(0); selfSum(u, from, to, tmp);
    for (let f = 0; f < WK; f++) acc[p * WK + f] += acc[u * WK + f] + tmp[WMAP[f]];
  }
  return acc;
}

/* ---------------- 输出 ---------------- */
function buildCommunity() {
  const n = S.addrs.length, cd = curDay(), W = WK;
  const real = []; for (let i = 0; i < n; i++) if (S.flag[i] & 1) real.push(i);
  const imported = real.filter(i => S.flag[i] & 2).length;
  // 每日
  const days = {}; const D0 = Math.max(1, cd - 89);
  const row = d => days[d] ||= { day: d, joins: 0, dai: 0, daiUsers: 0, power: 0, turbDai: 0, turbUsers: 0, burnCnt: 0, veAi: 0, fundDai: 0 };
  for (const i of real) if ((S.flag[i] & 3) === 1) { const d = dayOf(S.ts[i]); if (d >= D0) row(d).joins++; }
  for (const [key, v] of S.flows) { const d = key % 4096; if (d < D0) continue; const r = row(d); r.dai += v[F_DAI]; if (v[F_DAI] > 0) r.daiUsers++; r.power += v[F_POWER]; r.turbDai += v[F_TURBDAI]; if (v[F_TURBDAI] > 0) r.turbUsers++; r.burnCnt += v[F_BURNCNT]; r.veAi += v[F_VEAI]; r.fundDai += v[F_FUNDDAI]; }
  const daily = Object.values(days).sort((a, b) => a.day - b.day).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? r6(v) : v])));
  // 层级分布
  const dep = {}; let maxD = 0; for (const i of real) { const d = G.depth[i]; if (d < 0) continue; dep[d] = (dep[d] || 0) + 1; if (d > maxD) maxD = d; }
  // 窗口团队业绩
  const w1 = teamWindow(cd, cd), w7 = teamWindow(cd - 6, cd), w30 = teamWindow(cd - 29, cd);
  const directs = u => G.kidStart[u + 1] - G.kidStart[u];
  const lvMap = {}; (S.levels && S.levels.rows || []).forEach(r => lvMap[r.a] = r.level);
  const teamRow = u => ({ a: S.addrs[u], team: G.size[u], direct: directs(u), depth: G.depth[u], level: lvMap[S.addrs[u]] || 0,
    new1: w1[u * W], new7: w7[u * W], new30: w30[u * W], dai1: r6(w1[u * W + 1]), dai7: r6(w7[u * W + 1]), dai30: r6(w30[u * W + 1]),
    turb7: r6(w7[u * W + 2]), ve7: r6(w7[u * W + 3]) });
  const topBy = (key, k = 100, min = 1) => { const top = []; for (const u of real) { if (G.size[u] < min) continue; const v = key(u); if (top.length < k) { top.push([v, u]); if (top.length === k) top.sort((a, b) => b[0] - a[0]); } else if (v > top[k - 1][0]) { top[k - 1] = [v, u]; top.sort((a, b) => b[0] - a[0]); } } return top.sort((a, b) => b[0] - a[0]).map(([, u]) => teamRow(u)); };
  const topTeams = topBy(u => G.size[u], 100);
  const topDai7 = topBy(u => w7[u * W + 1], 100);
  const topNew7 = topBy(u => w7[u * W], 100);
  // 近 7 天直推新增最多
  const rec = new Map(); for (const i of real) { if ((S.flag[i] & 3) !== 1) continue; const d = dayOf(S.ts[i]); if (d >= cd - 6 && S.par[i] >= 0) rec.set(S.par[i], (rec.get(S.par[i]) || 0) + 1); }
  const recruiters7 = [...rec].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([u, c]) => ({ ...teamRow(u), newDirect7: c }));
  const roots = real.filter(i => S.par[i] < 0).map(i => ({ a: S.addrs[i], team: G.size[i] }));
  const out = { at: Date.now(), block: S.cursor, curDay: cd, day1: S.day1, total: real.length, imported, joinedNew: real.length - imported, reached: G.reached, dup: S.dup,
    roots, maxDepth: maxD, depth: Object.entries(dep).map(([d, n]) => ({ d: +d, n })).sort((a, b) => a.d - b.d), daily, topTeams, topDai7, topNew7, recruiters7 };
  writeJSON(path.join(DATA, "community.json"), out);
  return out;
}

async function refreshLevels(force) {
  if (ARGS.has("--skip-levels")) return;
  if (!force && Date.now() - S.levelsAt < LEVEL_EVERY && S.levels) return;
  const cand = [...S.veSet].filter(a => /^0x[0-9a-f]{40}$/.test(a) && !/^0x0{20}/.test(a));
  log(`查询等级：${cand.length} 个有锁仓记录的地址`);
  const rows = [], near = []; let done = 0, fail = 0;
  await pool(cand, +process.env.LEVEL_CONC || 20, async a => {
    let l = null; try { l = await getJ(`${API}/level/${a}`); } catch { fail++; }
    done++; if (done % 500 === 0) process.stdout.write(`\r  等级 ${done}/${cand.length}   `);
    if (!l) return;
    const i = S.idx.get(a), r = { a, level: l.level || 0, veUsd: r6(+l.veUsd || 0), selfPower: r6(+l.selfPower || 0), zones: (l.zones || []).map(z => r6(+z)), directCount: l.directCount ?? null, team: i != null && G ? G.size[i] : null, day: l.day };
    if (r.level > 0) rows.push(r); else if (r.veUsd >= 500) near.push(r);
  });
  process.stdout.write("\n");
  const th = await getJ(`${API}/level`).catch(() => null);
  rows.sort((a, b) => b.level - a.level || b.veUsd - a.veUsd); near.sort((a, b) => b.veUsd - a.veUsd);
  // 每日奖励（增长/网络/共识）：给 P1+ 每个地址拉 /community 最新一天，供等级页排行榜直接使用
  let rwOk = 0;
  await pool(rows, 20, async r => {
    try {
      const c = await getJ(`${API}/community/${r.a}`);
      const x = c && c.latest;
      if (x) {
        r.rw = { d: x.day, g: +(x.rewardGrowth || 0), n: +(x.rewardNetwork || 0), c: +(x.rewardConsensus || 0) };
        rwOk++;
      }
    } catch (e) { }
  });
  log(`每日奖励：${rwOk}/${rows.length} 个 P 等级地址`);
  S.levels = { at: Date.now(), checked: cand.length, fail, thresholds: th && th.thresholds || null, official: th && th.distribution || null, rows, near: near.slice(0, 300) };
  S.levelsAt = Date.now();
  writeJSON(path.join(DATA, "levels.json"), S.levels);
  log(`等级完成：P1+ 共 ${rows.length} 人（官方统计 ${th ? th.distribution.filter(x => x.level > 0).reduce((s, x) => s + x.members, 0) : "?"} 人），失败 ${fail}`);
}

async function snapshotAndChanges(cm) {
  const date = bjDate();
  let holders = [];
  try { let q = ""; for (let p = 0; p < 4; p++) { const j = await getJ(`${BS}/tokens/${A.AILGNS}/holders${q}`); for (const it of j.items || []) holders.push([it.address.hash.toLowerCase(), r6(Number(BigInt(it.value) / 10n ** 12n) / 1e6)]); if (!j.next_page_params) break; q = "?" + new URLSearchParams(j.next_page_params); } } catch (e) { log("持币榜读取失败", e.message); }
  const teams = {}; [...cm.topTeams, ...cm.topDai7].forEach(r => teams[r.a] = r.team);
  // 团队人数前 2000
  const big = []; for (let i = 0; i < S.addrs.length; i++) if (G.size[i] >= 50) big.push(i);
  big.sort((a, b) => G.size[b] - G.size[a]).slice(0, 2000).forEach(i => teams[S.addrs[i]] = G.size[i]);
  const levels = {}; (S.levels && S.levels.rows || []).forEach(r => levels[r.a] = r.level);
  const snap = { date, at: Date.now(), total: cm.total, levels, teams, holders: Object.fromEntries(holders) };
  writeJSON(path.join(SNAP, date + ".json"), snap);
  // 对比
  const files = fs.readdirSync(SNAP).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const pick = back => { const want = bjDate(Date.now() - back * 86400e3); const f = files.filter(x => x.slice(0, 10) <= want && x.slice(0, 10) < date).pop(); return f ? readJSON(path.join(SNAP, f)) : null; };
  const cmp = old => {
    if (!old) return null;
    const lv = []; const ks = new Set([...Object.keys(levels), ...Object.keys(old.levels || {})]);
    for (const a of ks) { const x = old.levels[a] || 0, y = levels[a] || 0; if (x !== y) lv.push({ a, from: x, to: y }); }
    lv.sort((p, q) => (q.to - q.from) - (p.to - p.from) || q.to - p.to);
    const tm = []; for (const [a, t] of Object.entries(teams)) { const o = old.teams && old.teams[a]; if (o != null && t !== o) tm.push({ a, from: o, to: t, d: t - o }); }
    tm.sort((p, q) => q.d - p.d);
    const hd = []; const hk = new Set([...Object.keys(snap.holders), ...Object.keys(old.holders || {})]);
    for (const a of hk) { const x = (old.holders || {})[a], y = snap.holders[a]; if (x == null && y == null) continue; if (x == null || y == null) { hd.push({ a, from: x ?? null, to: y ?? null, d: null }); continue; } const d = y - x; if (Math.abs(d) > 1e-6) hd.push({ a, from: x, to: y, d: r6(d) }); }
    hd.sort((p, q) => (q.d == null ? -1 : Math.abs(q.d)) - (p.d == null ? -1 : Math.abs(p.d)));
    return { date: old.date, totalFrom: old.total, totalTo: snap.total, levels: lv, teamsUp: tm.slice(0, 50), teamsDown: tm.filter(x => x.d < 0).slice(-30).reverse(), holders: hd.slice(0, 60) };
  };
  writeJSON(path.join(DATA, "changes.json"), { at: Date.now(), date, snaps: files.map(f => f.slice(0, 10)), d1: cmp(pick(1)), d7: cmp(pick(7)), d30: cmp(pick(30)) });
}

/* ---------------- 团队新增业绩（服务器端即时计算） ---------------- */
// wins = [[from, to], ...]：一次遍历伞下，同时算多个时间段；cap 用来给快照版裁剪列表长度
function growthMulti(addr, wins, maxDepth, cap = {}) {
  const root = S.idx.get(addr);
  if (root == null || !(S.flag[root] & 1)) return null;
  const W = NF + 1, kidsOf = u => G.kids.subarray(G.kidStart[u], G.kidStart[u + 1]);
  const acc = wins.map(() => ({ layers: new Map(), lines: new Map(), top: [], newMembers: [], tot: new Array(W).fill(0) }));
  const s = new Array(W); let members = 0;
  // 栈式遍历：[节点, 层, 所属直推线]
  const st = []; for (const k of kidsOf(root)) st.push([k, 1, k]);
  while (st.length) {
    const [u, L, line] = st.pop(); members++;
    const lk = L > maxDepth ? maxDepth + 1 : L;
    for (let w = 0; w < wins.length; w++) {
      s.fill(0); selfSum(u, wins[w][0], wins[w][1], s);
      const A = acc[w];
      let lr = A.layers.get(lk); if (!lr) A.layers.set(lk, lr = { layer: lk, members: 0, v: new Array(W).fill(0) });
      let ln = A.lines.get(line); if (!ln) A.lines.set(line, ln = { a: S.addrs[line], members: 0, v: new Array(W).fill(0) });
      lr.members++; ln.members++;
      for (let f = 0; f < W; f++) { lr.v[f] += s[f]; ln.v[f] += s[f]; A.tot[f] += s[f]; }
      if (s[F_DAI] > 0 || s[F_TURBDAI] > 0 || s[F_VEAI] > 0) A.top.push({ a: S.addrs[u], layer: L, line: S.addrs[line], v: s.slice() });
      if (s[NF] > 0 && A.newMembers.length < 5000) A.newMembers.push({ a: S.addrs[u], layer: L, ts: S.ts[u], ref: S.addrs[S.par[u]] });
    }
    for (const k of kidsOf(u)) st.push([k, L + 1, line]);
  }
  const pack = v => ({ joins: v[NF], dai: r6(v[F_DAI]), power: r6(v[F_POWER]), turbDai: r6(v[F_TURBDAI]), turbAi: r6(v[F_TURBAI]), burnCnt: v[F_BURNCNT], burnLgns: r6(v[F_BURNLGNS]), veAi: r6(v[F_VEAI]), fundDai: r6(v[F_FUNDDAI]) });
  return acc.map((A, w) => {
    const [from, to] = wins[w];
    A.top.sort((a, b) => b.v[F_DAI] - a.v[F_DAI] || b.v[F_TURBDAI] - a.v[F_TURBDAI]);
    A.newMembers.sort((a, b) => b.ts - a.ts);
    const lines = [...A.lines.values()].map(r => ({ a: r.a, members: r.members, ...pack(r.v) })).sort((a, b) => b.dai - a.dai || b.members - a.members);
    return {
      addr: S.addrs[root], from, to, curDay: curDay(), day1: S.day1, block: S.cursor, maxDepth,
      team: G.size[root], direct: G.kidStart[root + 1] - G.kidStart[root], depth: G.depth[root], ref: S.par[root] >= 0 ? S.addrs[S.par[root]] : null,
      self: pack(selfSum(root, from, to, new Array(W).fill(0))), total: { members, ...pack(A.tot) },
      layers: [...A.layers.values()].sort((a, b) => a.layer - b.layer).map(r => ({ layer: r.layer, deeper: r.layer > maxDepth, members: r.members, ...pack(r.v) })),
      lines: cap.lines ? lines.slice(0, cap.lines) : lines, linesTotal: lines.length,
      top: A.top.slice(0, cap.top || 100).map(r => ({ a: r.a, layer: r.layer, line: r.line, ...pack(r.v) })),
      newMembers: A.newMembers.slice(0, cap.nm || 200),
    };
  });
}
function growth(addr, from, to, maxDepth) { const r = growthMulti(addr, [[from, to]], maxDepth); return r ? r[0] : { error: "notfound" }; }

/* ---------------- 单文件网页（数据内嵌，双击即可打开） ---------------- */
const GWIN = ["d0", "d1", "d7", "d30", "all"];
function writeStandalone(cm) {
  const t0 = Date.now(), cd = curDay(), wins = [[cd, cd], [cd - 1, cd - 1], [Math.max(0, cd - 6), cd], [Math.max(0, cd - 29), cd], [0, cd]];
  // 预先算好重点地址：P2 及以上、近 7 天团队入金前 40、近 7 天拉新前 30、团队人数前 20、近 7 天团队新增前 20
  const pick = new Map(), add = (a, why) => { if (!pick.has(a)) pick.set(a, why); };
  (S.levels && S.levels.rows || []).filter(r => r.level >= 2).forEach(r => add(r.a, "P" + r.level));
  cm.topDai7.slice(0, 40).forEach(r => add(r.a, "7天入金榜")); cm.recruiters7.slice(0, 30).forEach(r => add(r.a, "7天拉新榜"));
  cm.topTeams.slice(0, 20).forEach(r => add(r.a, "团队人数榜")); (cm.topNew7 || []).slice(0, 20).forEach(r => add(r.a, "7天新增榜"));
  const lvMap = {}; (S.levels && S.levels.rows || []).forEach(r => lvMap[r.a] = r.level);
  const growthData = {}, index = [];
  for (const [a, why] of pick) {
    const r = growthMulti(a, wins, 10, { lines: 40, top: 30, nm: 30 }); if (!r) continue;
    growthData[a] = Object.fromEntries(r.map((x, i) => [GWIN[i], x]));
    index.push({ a, why, team: r[0].team, direct: r[0].direct, level: lvMap[a] || 0, dai7: r[2].total.dai });
  }
  index.sort((x, y) => y.dai7 - x.dai7);
  const data = { at: Date.now(), block: S.cursor, curDay: cd, "community.json": readJSON(path.join(DATA, "community.json")), "levels.json": readJSON(path.join(DATA, "levels.json")), "changes.json": readJSON(path.join(DATA, "changes.json")), "feed.json": readJSON(path.join(DATA, "feed.json")), growth: growthData, growthIndex: index };
  const css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8"), js = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const html = idx.replace('<link rel="stylesheet" href="style.css">', () => "<style>\n" + css + "\n</style>")
    .replace('<script src="app.js"></script>', () => `<script>window.__LT_DATA=${json};</script>\n<script>\n${js}\n</script>`);
  const tmp = path.join(ROOT, "LGNS-Terminal.html.tmp"); fs.writeFileSync(tmp, html); fs.renameSync(tmp, path.join(ROOT, "LGNS-Terminal.html"));
  S.standaloneAt = Date.now();
  log(`单文件网页已更新：LGNS-Terminal.html（${(html.length / 1e6).toFixed(1)} MB，预算 ${index.length} 个重点地址，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s）`);
}

/* ---------------- 本地服务器 ---------------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
function serve() {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x"), send = (code, body, type = "application/json; charset=utf-8") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
    try {
      if (u.pathname === "/api/status") return send(200, { ok: true, block: S.cursor, members: S.addrs.length, scanning: S.scanning, lastBuild: S.lastBuild, ready: !!G });
      if (u.pathname === "/api/growth") {
        if (!G) return send(503, { error: "notready", scanning: S.scanning });
        const a = String(u.searchParams.get("addr") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) return send(400, { error: "badaddr" });
        const cd = curDay(), from = Math.max(0, +u.searchParams.get("from") || cd), to = Math.min(cd, +u.searchParams.get("to") || cd), dep = Math.max(1, Math.min(50, +u.searchParams.get("depth") || 10));
        return send(200, growth(a, from, to, dep));
      }
      let p = decodeURIComponent(u.pathname); if (p === "/") p = "/index.html";
      const f = path.normalize(path.join(ROOT, p)); if (!f.startsWith(ROOT) || f.includes(path.sep + "raw" + path.sep)) return send(403, "forbidden", "text/plain");
      fs.readFile(f, (e, buf) => e ? send(404, "not found", "text/plain") : send(200, buf, MIME[path.extname(f)] || "application/octet-stream"));
    } catch (e) { send(500, { error: String(e.message || e) }); }
  });
  srv.listen(PORT, "127.0.0.1", () => {
    const url = `http://localhost:${PORT}/#/community`;
    log(`本地网页已启动：${url}（关掉这个窗口即停止）`);
    if (!ARGS.has("--no-open")) { const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"; require("child_process").exec(`${cmd} "${url}"`, () => { }); }
  });
  srv.on("error", e => { log(e.code === "EADDRINUSE" ? `端口 ${PORT} 已被占用：可能采集器已经在运行，直接打开 http://localhost:${PORT}` : "服务器错误 " + e.message); });
}

/* ---------------- 主循环 ---------------- */
let running = false;
async function cycle() {
  if (running) return; running = true;
  try {
    if (!S.day1) await initClock();
    if ((await scan()) === false) { running = false; return; }
    if ((await scanFeed()) === false) { running = false; return; }
    buildFeed();
    buildTree();
    const cm = buildCommunity();
    log(`社区成员 ${cm.total.toLocaleString()}（迁移导入 ${cm.imported.toLocaleString()} · 新加入 ${cm.joinedNew.toLocaleString()}）· 最深 ${cm.maxDepth} 层 · 第 ${cm.curDay} 天新加入 ${(cm.daily.find(d => d.day === cm.curDay) || { joins: 0 }).joins}`);
    await refreshLevels();
    buildCommunity(); // 带上等级再写一次
    await snapshotAndChanges(cm);
    S.lastBuild = Date.now();
    // 单文件网页：带 --standalone 时每轮都写；常驻运行时每小时写一次
    if (!ARGS.has("--no-standalone") && (ARGS.has("--standalone") || (!ARGS.has("--once") && Date.now() - (S.standaloneAt || 0) > 3600e3))) {
      try { writeStandalone(cm); } catch (e) { log("单文件网页生成失败：", e.message || e); }
    }
    saveState();
    log("本轮完成，数据已写入 ./data/");
  } catch (e) { log("本轮出错：", e.message || e, "（下一轮自动重试）"); process.exitCode = 1; }
  running = false;
}
(async () => {
  const [maj] = process.versions.node.split(".").map(Number);
  if (maj < 18) { console.error("需要 Node.js 18 或更高版本，当前 " + process.version); process.exit(1); }
  // 社区有 200 万+ 地址，默认内存上限可能不够 → 自动以 4GB 上限重启自己
  if (!process.env.LT_CHILD && !process.execArgv.some(a => a.startsWith("--max-old-space-size"))) {
    const cp = require("child_process").spawn(process.execPath, ["--max-old-space-size=4096", __filename, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, LT_CHILD: "1" } });
    cp.on("exit", c => process.exit(c ?? 0)); ["SIGINT", "SIGTERM"].forEach(s => process.on(s, () => cp.kill(s)));
    return;
  }
  [DATA, RAW, SNAP].forEach(d => fs.mkdirSync(d, { recursive: true }));
  log("LGNS Terminal 本地采集器启动。首次运行需要从头扫链，约 5–15 分钟，之后每 10 分钟增量更新。");
  loadState(); loadFeed();
  if (S.levels == null) S.levels = readJSON(path.join(DATA, "levels.json"));
  const once = ARGS.has("--once");
  if (!once) serve();
  if (!once && S.cursor >= START) { try { buildTree(); } catch { } } // 有断点时先让页面能用
  await cycle();
  if (once) return;
  setInterval(cycle, SCAN_EVERY);
})();
