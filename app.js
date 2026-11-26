/* LGNS Terminal — AiLGNS 链上数据终端（本地版）
   数据源：
   ① awakehelix.io 官方公开接口 /api/v1（CORS 开放）
   ② Anubis 链 RPC 直读（3 节点轮换）
   ③ Anubis Blockscout（持币数 / 持币榜）
   ④ 本地采集器 ./data/*.json（第二期，未运行时相关模块显示"待采集器"）
   读不到就显示"—"，不编数。 */
(() => {
"use strict";

/* ================= 配置 ================= */
const API = "https://awakehelix.io/api/v1";
const EXP = "https://browser.anubispace.org";
const BS = EXP + "/api/v2";
const RPCS = ["https://rpc.anubispace.org", "https://rpc2.anubispace.org", "https://rpc3.anubispace.org"];
const LOCAL = "./data"; // 第二期采集器输出目录
// file:// 打开时浏览器禁止读本地文件（会报 CORS），只有通过采集器自带的 http://localhost:8787 打开才读
const HTTP = /^https?:$/.test(location.protocol);
// 单文件版（LGNS-Terminal.html）：采集器把算好的社区数据直接嵌进网页，双击即可打开，不需要本地服务器
const EMB = window.__LT_DATA || null;
const C = {
  AILGNS: "0x256EdB652db43E721EC6A12B6b51b6967D3bb8cB", DAI: "0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14", LGNS: "0x4D1D808a081FdAc440703b3765FC61f8028C06B8",
  PAIR: "0x0a1Cce65d995C6C5100e6F5bA3c388Ef34CEcaf0", CVAULT: "0x3DEea5f638cA0dFb03A0873CF4c0b90BA50E1aA2", GVAULT: "0xDb752f219a79C8d9D6F6674e5ea295c2C5431d1F",
  INSUR: "0x22841307af7e663F8Ce784230C8F8e10a46888cF", RESERVE: "0x27Cb55eE75E777fF972B74B6E68782D12Bd4ec46", LEDGER: "0x9E68F61E2615cc1D2C4a2D0026bFc1EBFdf68C1b",
  GATE: "0xb975Fd9B03fF440d6a43a52A7F072154CB520a4B", LENS: "0xa69a60b8d97D43031C00F16742Eb6989553796fc", CLOCK: "0x6C5352E15A8327C3F44898FE220100Edc2989C58",
  FEECOL: "0x7088e192b9b7f41A07bB3f79378e13454D8a80D5", POLV: "0x825d1B92d9cB744c9583999B6F57893E96d9B9c7", VE: "0x52D7f7745D4Ba3dE6C3A0B503815878aeE7eDf14",
  TURBINE: "0xE884A336550a4482Ca6A17A3F93aa30Ed4eD9BaD", ECO: "0x0645460f6f485153775154451Fe1322fDbB2233c", CFUND: "0x616799578b7A9FCfF46B6519C2460d07fba8cfD3",
  DEPLOYER: "0xcC95906Da4b92B3a5c4B187553050df0f90eaE08", COMMUNITY: "0xc9f9a8a2dBf8188AD6610e0239105CAbE67c4993",
};
const SEL = {
  totalSupply: "0x18160ddd", MAX_SUPPLY: "0x32cb6b0c", balanceOf: "0x70a08231", getReserves: "0x0902f1ac", allowance: "0xdd62ed3e",
  dailyMaximumLgns: "0x020bb577", burnedLgnsToday: "0xcb9ebaf2", maximumLgns: "0x7300b78e", minimumStake: "0xec5ffac2", stakeOf: "0x42623360", burnEpochOf: "0x99e02c2d",
  burnBudgetRemainingToday: "0xf77c6cce", daiDepositRemainingToday: "0x7e1a72f0", daiDepositCapToday: "0xd29b59c5",
  currentDay: "0x5c9302c9", currentEpoch: "0x76671808", epochStart: "0xaa9354a3", dayStart: "0x65b09d2d",
  powerRateBps: "0xbe7f8c68", lgnsPowerRate: "0x3498100a", totalActivePower: "0xf2cfb069",
};
// PowerBurnQueued(address indexed user,uint256 lgnsAmount,uint256 power,uint256 indexed queueIndex)
const BURN_TOPIC = "0x16b309670cfc6e855d1def7ee55e395827e8a8694f4c701ffe0adbc7b75121cc";
const LABEL = {};
[[C.CVAULT, "社区排放金库"], [C.GVAULT, "DAO 排放金库"], [C.INSUR, "保险储备国库"], [C.DEPLOYER, "初始流动性与团队"], [C.RESERVE, "协议储备"],
 [C.PAIR, "AiLGNS/DAI 主池"], ["0xc5029d6e80D2FDCE321B2b51010E9Ce3b1eDf1a2", "AiLGNS/LGNS 卫星池"], ["0xbfAaE809C1803eC4ae73A506309b3036c48D65A8", "AiLGNS/gLGNS 卫星池"],
 ["0x8A36A456E95Cd55eA8cbd79CcC798fd1f716db68", "AiLGNS/USDT 卫星池"], ["0x39BA6313F3C59CaC5611b8CF308D084551E9D60F", "AiLGNS/A 卫星池"],
 [C.VE, "veAiLGNS 治理锁仓"], [C.TURBINE, "涡轮 Turbine"], [C.FEECOL, "手续费收集"], [C.ECO, "生态储备"], [C.CFUND, "社区基金"], [C.POLV, "协议自有流动性 POL"], [C.LEDGER, "算力账本 PowerLedger"],
 ["0xE98f3366aC45a799531e5E779079b364fABCcC00", "代币运营地址"]].forEach(([a, n]) => LABEL[a.toLowerCase()] = n);
const POOLNAME = { AILGNS_DAI_PAIR: "AiLGNS / DAI", AILGNS_LGNS_PAIR: "AiLGNS / LGNS", AILGNS_GLGNS_PAIR: "AiLGNS / gLGNS", AILGNS_USDT_PAIR: "AiLGNS / USDT", AILGNS_A_PAIR: "AiLGNS / A" };

/* ================= 工具 ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const N = x => { if (x == null || x === "") return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
const fin = x => x != null && x !== "" && Number.isFinite(Number(x));
const fmt = (n, d = 2) => fin(n) ? Number(n).toLocaleString("zh-CN", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "—";
const cp = (n, d = 2) => { if (!fin(n)) return "—"; n = Number(n); const a = Math.abs(n); if (a >= 1e8) return (n / 1e8).toFixed(d) + " 亿"; if (a >= 1e4) return (n / 1e4).toFixed(d) + " 万"; return fmt(n, a < 1 ? 4 : 2); };
const pct = (n, d = 2) => fin(n) ? (n >= 0 ? "+" : "") + Number(n).toFixed(d) + "%" : "—";
const pcls = n => !fin(n) ? "" : n >= 0 ? "up" : "dn";
const short = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const isAddr = s => /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());
const toDate = ts => typeof ts === "number" ? new Date(ts * 1000) : /^\d+$/.test(String(ts)) ? new Date(Number(ts) * 1000) : new Date(ts);
const bj = (ts, sec = true) => { if (!ts) return "—"; const d = toDate(ts); if (isNaN(d)) return "—"; return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: sec ? "2-digit" : undefined }); };
const md = ts => bj(ts, false).slice(0, 5);
const ago = ms => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? Math.round(s) + " 秒前" : s < 3600 ? Math.round(s / 60) + " 分钟前" : Math.round(s / 3600) + " 小时前"; };
const dayL = d => "第" + d + "天";
const W = (hex, i) => { if (!hex || hex === "0x") return null; const h = hex.slice(2 + i * 64, 2 + (i + 1) * 64); return h.length === 64 ? BigInt("0x" + h) : null; };
const U = (big, dec = 18) => big == null ? null : Number(big / 10n ** BigInt(Math.max(0, dec - 6))) / 1e6;
const pad = a => a.slice(2).toLowerCase().padStart(64, "0"), padN = n => BigInt(n).toString(16).padStart(64, "0");
const nameOf = a => LABEL[String(a || "").toLowerCase()] || "";
const addrLink = (a, txt) => a ? `<a href="#/address/${a}" class="mono" title="${esc(a)}">${esc(txt || short(a))}</a>` : "—";
const exLink = (path, txt) => `<a href="${EXP}/${path}" target="_blank" rel="noopener">${txt}</a>`;
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

async function getJ(url, ms = 20000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const api = p => getJ(API + p);
const loc = f => EMB ? Promise.resolve(EMB[f] || null) : HTTP ? getJ(`${LOCAL}/${f}?t=${Math.floor(Date.now() / 60000)}`, 15000).catch(() => null) : Promise.resolve(null);
let ri = 0;
async function rpcRaw(body, ms = 20000) {
  let err;
  for (let k = 0; k < RPCS.length; k++) {
    const url = RPCS[(ri + k) % RPCS.length], ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal }); const j = await r.json(); ri = (ri + k) % RPCS.length; return j; }
    catch (e) { err = e; } finally { clearTimeout(t); }
  }
  throw err || new Error("RPC 不可用");
}
async function rpc(method, params) { const j = await rpcRaw({ jsonrpc: "2.0", id: 1, method, params }); if (j.error) throw new Error(j.error.message); return j.result; }
async function batch(items) {
  if (!items.length) return [];
  const body = items.map((it, i) => it.method ? { jsonrpc: "2.0", id: i + 1, method: it.method, params: it.params } : { jsonrpc: "2.0", id: i + 1, method: "eth_call", params: [{ to: it.to, data: it.data }, "latest"] });
  const res = await rpcRaw(body), out = new Array(items.length).fill(null);
  if (Array.isArray(res)) for (const r of res) if (r && r.id && !r.error) out[r.id - 1] = r.result;
  return out;
}
async function pbatch(items) { const out = []; for (let i = 0; i < items.length; i += 100) out.push(...await batch(items.slice(i, i + 100))); return out; }
const call = (to, sel, ...args) => ({ to, data: SEL[sel] + args.map(a => typeof a === "string" && a.startsWith("0x") ? pad(a) : padN(a)).join("") });

/* ================= 数据层 ================= */
const D = { at: 0, health: {} };
const Q = { burnDay: 0, burners: {}, elig: null, eligAddr: "", addr: null, addrQ: "", holders: [], holdersNext: null, holdersBusy: false, rank: "day", rankData: {}, kline: "1h", klineData: {}, burnSearch: "", calc: {}, perms: null, permsBusy: false, actOff: 0, team: { addr: "", for: "", win: "d7", data: null, loading: false, err: "", q: "", sort: "dai", dir: -1, open: [false, false, false, false], bpage: [0, 0, 0, 0], started: 0, tick: null } };
const HN = { ov: "官方 /overview", feed: "官方 /overview/feed", pw: "官方 /power", em: "官方 /emission", pr: "官方 /protocol", ve: "官方 /ve", pools: "官方 /pools", tb: "官方 /turbine", pol: "官方 /pol", lv: "官方 /level", price: "官方 /price", ga: "官方 /gauge", k1: "官方 /kline", ch: "Anubis 链 RPC", hc: "Blockscout", my: "本地采集器" };
async function safe(name, fn) { const t = Date.now(); try { const v = await fn(); D.health[name] = { ok: true, ms: Date.now() - t }; return v; } catch (e) { D.health[name] = { ok: false, ms: Date.now() - t, err: String(e.message || e) }; return null; } }

async function readChain() {
  const r = await batch([
    call(C.AILGNS, "totalSupply"), call(C.AILGNS, "MAX_SUPPLY"), call(C.AILGNS, "balanceOf", C.CVAULT), call(C.AILGNS, "balanceOf", C.GVAULT), call(C.AILGNS, "balanceOf", C.INSUR),
    call(C.PAIR, "getReserves"), call(C.GATE, "dailyMaximumLgns"), call(C.GATE, "burnedLgnsToday"), call(C.GATE, "maximumLgns"), call(C.GATE, "minimumStake"),
    call(C.LENS, "burnBudgetRemainingToday"), call(C.LENS, "daiDepositRemainingToday"), call(C.LENS, "daiDepositCapToday"), call(C.CLOCK, "currentDay"), call(C.CLOCK, "currentEpoch"),
    call(C.DAI, "balanceOf", C.RESERVE), call(C.LEDGER, "totalActivePower"), call(C.LEDGER, "powerRateBps"), call(C.LEDGER, "lgnsPowerRate"),
    call(C.DAI, "balanceOf", C.FEECOL), call(C.AILGNS, "balanceOf", C.FEECOL), { method: "eth_getBlockByNumber", params: ["latest", false] },
  ]);
  const v = i => r[i] ? W(r[i], 0) : null;
  const day = v(13), ep = v(14);
  const r2 = day != null && ep != null ? await batch([call(C.CLOCK, "dayStart", day), call(C.CLOCK, "epochStart", ep)]) : [null, null];
  const head = r[21] ? { n: parseInt(r[21].number, 16), ts: parseInt(r[21].timestamp, 16) } : null;
  const ai = r[5] ? U(W(r[5], 0)) : null, dai = r[5] ? U(W(r[5], 1)) : null;
  const ts = U(v(0)), mx = U(v(1));
  const lock = [v(2), v(3), v(4)].every(x => x != null) ? U(v(2)) + U(v(3)) + U(v(4)) : null;
  return {
    totalSupply: ts, maxSupply: mx, burned: fin(ts) && fin(mx) ? mx - ts : null, cvault: U(v(2)), gvault: U(v(3)), insur: U(v(4)),
    circulating: fin(ts) && fin(lock) ? ts - lock - 14650000 : null,
    poolAi: ai, poolDai: dai, poolPrice: ai ? dai / ai : null,
    gateMax: U(v(6), 9), gateBurned: U(v(7), 9), gatePer: U(v(8), 9), gateMinStake: U(v(9), 9), burnRemain: U(v(10)),
    daiRemain: U(v(11)), daiCap: U(v(12)), day: day != null ? Number(day) : null, epoch: ep != null ? Number(ep) : null,
    reserveDai: U(v(15)), totalActive: U(v(16)), powerRate: v(17) != null ? Number(v(17)) / 10000 : null, lgnsRate: U(v(18)),
    feeDai: U(v(19)), feeAi: U(v(20)), dayStart: r2[0] ? Number(W(r2[0], 0)) : null, epochStart: r2[1] ? Number(W(r2[1], 0)) : null, head,
  };
}

const DKEY = "lt-dcache-v1";
function saveCache() { try { const o = { ...D }; delete o.cached; const t = JSON.stringify(o); if (t.length < 3e6) localStorage.setItem(DKEY, t); } catch { } }
function loadCache() { try { const o = JSON.parse(localStorage.getItem(DKEY) || "null"); if (o && o.at && Date.now() - o.at < 3 * 86400000) Object.assign(D, o, { cached: true }); } catch { } }

let loadingAll = false;
async function load() {
  if (loadingAll) return; loadingAll = true;
  $("#refreshBtn").classList.add("spin");
  const [ov, feed, pw, em, pr, ve, pools, tb, pol, lv, price, ga, k1, ch, hc, my, cm, lvl, chg, st] = await Promise.all([
    safe("ov", () => api("/overview")), safe("feed", () => api("/overview/feed?limit=40")), safe("pw", () => api("/power")),
    safe("em", () => api("/emission")), safe("pr", () => api("/protocol")), safe("ve", () => api("/ve")),
    safe("pools", () => api("/pools")), safe("tb", () => api("/turbine")), safe("pol", () => api("/pol")), safe("lv", () => api("/level")),
    safe("price", () => api("/price")), safe("ga", () => api("/gauge")), safe("k1", () => api(`/kline?pair=${C.PAIR}&interval=1h&limit=25`)),
    safe("ch", readChain), safe("hc", () => getJ(`${BS}/tokens/${C.AILGNS}/counters`)),
    loc("feed.json"), loc("community.json"), loc("levels.json"), loc("changes.json"),
    EMB ? { ok: true, ready: true, embedded: true, block: EMB.block } : HTTP ? getJ("./api/status", 4000).catch(() => null) : null,
  ]);
  const had = !!D.at, sig0 = D.sig;
  // 失败的源保留上次缓存值，不让页面突然变空
  const keep = (k, v) => v != null ? v : (D[k] ?? null);
  Object.assign(D, { ov: keep("ov", ov), feed: keep("feed", feed), pw: keep("pw", pw), em: keep("em", em), pr: keep("pr", pr), ve: keep("ve", ve), pools: keep("pools", pools), tb: keep("tb", tb), pol: keep("pol", pol), lv: keep("lv", lv), price: keep("price", price), ga: keep("ga", ga), k1: keep("k1", k1), ch: keep("ch", ch), hc: keep("hc", hc), my, cm: keep("cm", cm), lvl: keep("lvl", lvl), chg: keep("chg", chg), st, at: Date.now(), cached: false });
  saveCache();
  try { D.sig = JSON.stringify([ov, pw, em, pr, ve, pools, tb, ga, price, hc, ch && { ...ch, head: 0 }, cm && cm.at, lvl && lvl.at, chg && chg.at, st && [st.ready, st.block]]); } catch { D.sig = String(Date.now()); }
  $("#refreshBtn").classList.remove("spin"); loadingAll = false;
  strip();
  if (!had || D.sig !== sig0) softRender();
}

const pricePool = () => D.ch && fin(D.ch.poolPrice) ? D.ch.poolPrice : null;
const priceApi = () => D.price ? N(D.price.price) : null;
const priceNow = () => pricePool() ?? priceApi();
function chg24() { const c = D.k1 && D.k1.candles; if (!c || c.length < 2) return null; const o = N(c[0].open), cl = pricePool() ?? N(c[c.length - 1].close); return o ? (cl / o - 1) * 100 : null; }
const lastEmDay = () => D.em && D.em.recentDays && D.em.recentDays.length ? D.em.recentDays[D.em.recentDays.length - 1] : null;
const daiOf = list => (list || []).find(t => String(t.token).toLowerCase() === C.DAI.toLowerCase());

/* ================= 组件 ================= */
let INFO = [];
// ⓘ 说明：plain = 大白话，how = 数据来源与算法，url = 核对链接
const info = (plain, how, url) => { INFO.push({ plain, how, url }); return `<button class="info" data-info="${INFO.length - 1}" title="这个数是什么">ⓘ</button>`; };
const kpi = (k, v, unit, note, inf, cls = "") => `<div class="card kpi ${cls}"><div class="k">${k}${inf || ""}</div><div class="v">${v}${unit ? `<small>${unit}</small>` : ""}</div>${note ? `<div class="n">${note}</div>` : ""}</div>`;
const sec = (t, p, right) => `<div class="sec"><h2>${t}</h2>${p ? `<p>${p}</p>` : ""}${right ? `<div class="r">${right}</div>` : ""}</div>`;
const ph = (t, sub, act) => `<div class="ph"><h1>${t}</h1>${act ? `<div class="act">${act}</div>` : ""}${sub ? `<p class="sub">${sub}</p>` : ""}</div>`;
const empty = t => `<div class="card empty">${t}</div>`;
const loadingTxt = () => D.at ? "接口暂时读不到，稍后自动重试" : "正在读取…";
const SRC_OFF = p => "官方接口 awakehelix.io/api/v1" + (p || "");
const SRC_CH = "Anubis 链合约直读";
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function openInfo(i) { const x = INFO[i]; if (!x) return; openModal(`<h4>这个数是什么</h4><p class="plain">${esc(x.plain)}</p>${x.how ? `<div class="how">${esc(x.how)}</div>` : ""}${x.url ? `<p class="note"><a href="${esc(x.url)}" target="_blank" rel="noopener">去链上 / 官网核对 ↗</a></p>` : ""}`); }
function copyText(t, btn) { const done = () => { if (btn) { const o = btn.textContent; btn.textContent = "已复制 ✓"; setTimeout(() => btn.textContent = o, 1400); } }; if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done); }
function fallbackCopy(t, done) { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); done(); } catch { } a.remove(); }

/* ================= 图表（纯 SVG） ================= */
let CH = [];
const CW = () => Math.min(640, Math.max(320, (window.innerWidth || 640) - 80));
function axisY(mn, mx, Lx, R, w, y, fy) { return [0, 1, 2, 3].map(i => { const v = mx - i * (mx - mn) / 3, yy = y(v); return `<line class="gl" x1="${Lx}" x2="${w - R}" y1="${yy}" y2="${yy}"/><text class="ax" x="${w - R + 6}" y="${yy + 3}">${esc((fy || cp)(v))}</text>`; }).join(""); }
function lineChart(pts, o = {}, Wd) {
  const re = w => lineChart(pts, o, w); pts = pts.filter(p => fin(p.v)); if (pts.length < 2) return `<div class="empty">历史数据不足</div>`;
  const w = Wd || CW(), h = o.h || 200, Lx = 6, R = 60, T = 8, B = 22, pw = w - Lx - R, phh = h - T - B;
  let mn = Math.min(...pts.map(p => p.v)), mx = Math.max(...pts.map(p => p.v)); if (o.zero) mn = Math.min(0, mn); if (mn === mx) { mn *= .98; mx = mx * 1.02 || 1; } const pv = (mx - mn) * .08; if (!o.zero) mn -= pv; mx += pv;
  const x = i => Lx + i / (pts.length - 1) * pw, y = v => T + (mx - v) / (mx - mn) * phh;
  const d = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text class="ax" x="${x(i)}" y="${h - 5}" text-anchor="${i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}">${esc(pts[i].l)}</text>`).join("");
  const id = CH.push({ pts, x, y, w, re, fv: o.fv || (v => fmt(v)) }) - 1;
  return `<div class="chart" data-ch="${id}"><svg viewBox="0 0 ${w} ${h}" role="img">${axisY(mn, mx, Lx, R, w, y, o.fy)}<polygon class="ar" points="${Lx},${T + phh} ${d} ${x(pts.length - 1)},${T + phh}"/><polyline class="ln" points="${d}"/>${xl}<line class="cu" x1="0" x2="0" y1="${T}" y2="${T + phh}" style="display:none"/><circle class="dt" r="3.5" style="display:none"/></svg></div>`;
}
function barChart(pts, o = {}, Wd) {
  const re = w => barChart(pts, o, w); pts = pts.filter(p => fin(p.v)); if (!pts.length) return `<div class="empty">暂无数据</div>`;
  const w = Wd || CW(), h = o.h || 200, Lx = 6, R = 60, T = 8, B = 22, pw = w - Lx - R, phh = h - T - B, mx = Math.max(...pts.map(p => p.v), 0) * 1.08 || 1;
  const bw = pw / pts.length, gap = Math.min(2, bw * .2), y = v => T + (mx - v) / mx * phh;
  const bars = pts.map((p, i) => { const hh = Math.max(1, p.v / mx * phh); return `<rect class="bx ${p.alt ? "alt" : ""}" x="${(Lx + i * bw + gap / 2).toFixed(1)}" y="${(T + phh - hh).toFixed(1)}" width="${Math.max(1, bw - gap).toFixed(1)}" height="${hh.toFixed(1)}" rx="1"/>`; }).join("");
  const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text class="ax" x="${Lx + (i + .5) * bw}" y="${h - 5}" text-anchor="middle">${esc(pts[i].l)}</text>`).join("");
  const id = CH.push({ pts, bar: true, w, re, fv: o.fv || (v => fmt(v)) }) - 1;
  return `<div class="chart" data-ch="${id}"><svg viewBox="0 0 ${w} ${h}" role="img">${axisY(0, mx, Lx, R, w, y, o.fy)}${bars}${xl}</svg></div>`;
}
function candleChart(cs, Wd) {
  const re = w => candleChart(cs, w); if (!cs || cs.length < 2) return `<div class="empty">暂无 K 线数据</div>`;
  const pts = cs.map(c => ({ o: N(c.open), h: N(c.high), lo: N(c.low), c: N(c.close), vol: N(c.volume), t: c.time, tr: c.trades }));
  const w = Wd || CW(), h = 280, Lx = 6, R = 60, T = 8, B = 22, VH = 44, pw = w - Lx - R, phh = h - T - B - VH - 6;
  let mn = Math.min(...pts.map(p => p.lo)), mx = Math.max(...pts.map(p => p.h)); const pd = (mx - mn) * .06 || 1; mn -= pd; mx += pd; const vmx = Math.max(...pts.map(p => p.vol || 0)) || 1;
  const bw = pw / pts.length, y = v => T + (mx - v) / (mx - mn) * phh;
  const body = pts.map((p, i) => { const cx = Lx + (i + .5) * bw, up = p.c >= p.o, top = y(Math.max(p.o, p.c)), bh = Math.max(1, Math.abs(y(p.o) - y(p.c))), vh = (p.vol || 0) / vmx * VH, hw = Math.max(1, bw * .32);
    return `<g class="${up ? "cup" : "cdn"}"><rect x="${cx - .6}" y="${y(p.h)}" width="1.2" height="${Math.max(1, y(p.lo) - y(p.h))}"/><rect x="${cx - hw}" y="${top}" width="${hw * 2}" height="${bh}"/><rect x="${cx - hw}" y="${h - B - vh}" width="${hw * 2}" height="${vh}" opacity=".3"/></g>`; }).join("");
  const xl = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map(i => `<text class="ax" x="${Lx + (i + .5) * bw}" y="${h - 5}" text-anchor="middle">${esc(bj(pts[i].t, false))}</text>`).join("");
  const id = CH.push({ pts: pts.map(p => ({ ...p, l: bj(p.t, false), v: p.c })), candle: true, w, re }) - 1;
  return `<div class="chart" data-ch="${id}"><svg viewBox="0 0 ${w} ${h}" role="img">${axisY(mn, mx, Lx, R, w, y, v => fmt(v, 2))}${body}${xl}</svg></div>`;
}
function fitCharts() {
  $$(".chart[data-ch]").forEach(el => {
    const c = CH[+el.dataset.ch]; if (!c || !c.re) return; const cw = Math.round(el.clientWidth); if (!cw || Math.abs(cw - c.w) < 24) return;
    const d = document.createElement("div"); d.innerHTML = c.re(Math.max(280, Math.min(1400, cw))); const nu = d.firstElementChild; if (nu) el.replaceWith(nu);
  });
}
function bindCharts() {
  const tip = $("#tip");
  $$(".chart[data-ch]").forEach(el => {
    const c = CH[+el.dataset.ch]; if (!c) return; const svg = el.querySelector("svg");
    const show = ev => {
      const r = svg.getBoundingClientRect(), cw = c.w, xr = (ev.clientX - r.left) / r.width * cw; let i;
      if (c.bar || c.candle) i = Math.floor((xr - 6) / ((cw - 66) / c.pts.length)); else i = Math.round((xr - 6) / (cw - 66) * (c.pts.length - 1));
      i = Math.max(0, Math.min(c.pts.length - 1, i)); const p = c.pts[i];
      if (!c.bar && !c.candle) { const cu = svg.querySelector(".cu"), dt = svg.querySelector(".dt"), xx = c.x(i), yy = c.y(p.v); cu.setAttribute("x1", xx); cu.setAttribute("x2", xx); cu.style.display = ""; dt.setAttribute("cx", xx); dt.setAttribute("cy", yy); dt.style.display = ""; }
      tip.innerHTML = c.candle ? `${esc(p.l)}<br>开 ${fmt(p.o, 2)} · 高 ${fmt(p.h, 2)}<br>低 ${fmt(p.lo, 2)} · 收 ${fmt(p.c, 2)}<br>成交 ${cp(p.vol)} DAI · ${p.tr ?? "—"} 笔` : `${esc(p.l)}<br><b>${esc(c.fv(p.v))}</b>${p.extra ? "<br>" + esc(p.extra) : ""}`;
      tip.style.display = "block"; tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, ev.clientX + 12) + "px"; tip.style.top = Math.max(4, ev.clientY - tip.offsetHeight - 10) + "px";
    };
    el.onpointermove = show; el.onpointerdown = show;
    el.onpointerleave = () => { tip.style.display = "none"; const cu = svg.querySelector(".cu"), dt = svg.querySelector(".dt"); if (cu) cu.style.display = "none"; if (dt) dt.style.display = "none"; };
  });
}
let rsT = 0; window.addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { fitCharts(); bindCharts(); }, 150); });

/* ================= 页面：总览 ================= */
function summaryHtml() {
  const ch = D.ch || {}, tb = D.tb, pw = D.pw, rl = lastEmDay(), c24 = chg24(), p = priceNow();
  const items = [];
  items.push(["💰", `AiLGNS 实时价 ${fmt(p, 2)} DAI，24 小时 ${pct(c24)}`, "#/market"]);
  if (rl) items.push(["⚙️", `第 ${rl.day} 天结算 ${fmt(N(rl.communityActual), 0)} AiLGNS（预算 ${fmt(N(rl.communityBase), 0)} × 系数 ${(rl.factorBps / 100).toFixed(0)}%）`, "#/emission"]);
  if (fin(ch.gateMax)) { const u = ch.gateBurned / ch.gateMax * 100; items.push(["🔥", u >= 99.999 ? `500 LGNS 今日额度已抢满（${fmt(ch.gateBurned, 0)} LGNS）` : ch.gateBurned > 0 ? `500 LGNS 今日已用 ${u.toFixed(1)}%，剩 ${fmt(ch.gateMax - ch.gateBurned, 0)} LGNS` : "500 LGNS 今日还没开抢", "#/elig"]); }
  if (tb && tb.today) items.push(["🌀", `涡轮今日 ${cp(N(tb.today.daiSpent))} DAI · ${fmt(tb.today.activations, 0)} 次激活`, "#/turbine"]);
  if (pw && pw.today) items.push(["⚡", `今日新增算力 ${cp(N(pw.today.newPower))} · 新增参与者 ${fmt(pw.today.newParticipants, 0)}`, "#/power"]);
  if (fin(ch.reserveDai)) items.push(["🏦", `协议储备 ${fmt(ch.reserveDai, 0)} DAI · 主池 DAI ${cp(ch.poolDai)}`, "#/market"]);
  if (D.ga && D.ga.epoch) items.push(["🗳", `第 ${D.ga.epoch.current} 纪元治理投票${D.ga.epoch.voteOpen ? "开放中" : "已关闭"} · 总票数 ${fmt(N(D.ga.totalVotes), 0)}`, "#/gauge"]);
  if (D.hc) items.push(["👛", `持币地址 ${fmt(N(D.hc.token_holders_count), 0)} 个 · 累计转账 ${fmt(N(D.hc.transfers_count), 0)} 笔`, "#/holders"]);
  return `<div class="card sum"><div class="row"><b style="font-size:13px">今天发生了什么</b><span class="tag il ml">${bj(Math.floor(D.at / 1000))} 更新</span></div><ul class="sumlist">${items.map(([i, t, h]) => `<li><span class="ic">${i}</span><a href="${h}">${esc(t)}</a></li>`).join("")}</ul></div>`;
}
function pageOverview() {
  const ov = D.ov && D.ov.latest, em = D.em, pr = D.pr, ve = D.ve, ch = D.ch || {}, pw = D.pw;
  const sup = pr && pr.supply;
  const relC = em ? N(em.community.releasedCum) : null, relD = em ? N(em.dao.releasedCum) : null;
  const totC = sup ? N(sup.communityTotal) : 163800000, totD = sup ? N(sup.daoTotal) : 21000000;
  const rel = fin(relC) && fin(relD) ? relC + relD : null;
  const income = pr ? N((daiOf(pr.treasury.reserve.byToken) || {}).inflow) : null;
  const veT = ve && ve.totals, dist = ve && ve.lockDistribution || [];
  const lw = dist.filter(d => d.lockEpochs > 0), avgLock = lw.length ? lw.reduce((s, d) => s + d.lockEpochs * N(d.principal), 0) / lw.reduce((s, d) => s + N(d.principal), 0) : null;
  const alloc = [["社区排放", 78, 163800000, "排放预算", "#1d4ed8"], ["DAO 排放", 10, 21000000, "排放预算", "#4f7ae6"], ["保险储备国库", 5, 10500000, "初始分配", "#e8710a"], ["流动性与市值", 5, 10500000, "初始分配", "#0b9b6a"], ["初始团队", 2, 4200000, "初始分配", "#8a6fb3"]];
  const series = D.ov && D.ov.series || [], pools = D.pools && D.pools.pools || [];
  const pp = priceNow(), c24 = chg24();
  return `${ph("数据总览", "AiLGNS / AWAKE HELIX 协议全景：价格、供应、排放、储备、算力、治理。每个数字点 ⓘ 看含义与来源。")}
${summaryHtml()}
<div class="grid g4 mt">
 ${kpi("AiLGNS 实时价格", fmt(pp, 4), "DAI", `主池真实价，未扣手续费 · 24h <span class="${pcls(c24)}">${pct(c24)}</span>`, info("交易池里当下的真实价格：池子里的 DAI ÷ AiLGNS。官网顶部显示的价格比这个低约 3%，因为官网扣掉了卖出手续费。24 小时涨跌按主池 1 小时 K 线算。", "AiLGNS/DAI 主池 getReserves()：DAI 储备 ÷ AiLGNS 储备", `${EXP}/address/${C.PAIR}`), "hero hl")}
 ${kpi("最大供给量", fmt(ch.maxSupply ?? 210000000, 0), "AiLGNS", "合约写死的固定上限", info("AiLGNS 总共只会有这么多枚，写死在合约里。", "AiLGNS.MAX_SUPPLY()", `${EXP}/token/${C.AILGNS}`))}
 ${kpi("目前流通量", fmt(ch.circulating, 0), "AiLGNS", fin(ch.circulating) && fin(ch.maxSupply) ? `占最大供给 ${(ch.circulating / ch.maxSupply * 100).toFixed(2)}%` : "", info("真正在市面上流通的 AiLGNS：总供应减去三个金库里还没发出的，再减去 1,465 万枚（初始流动性和团队份额），与官网算法一致。", "totalSupply − 社区金库 − DAO 金库 − 保险国库 − 14,650,000", `${EXP}/token/${C.AILGNS}`))}
 ${kpi("累计销毁", fmt(ch.burned, 2), "AiLGNS", `其中永久治理销毁 ${fmt(veT && N(veT.permanent), 2)}`, info("已被永久销毁的 AiLGNS：最大供应减去当前总供应。其中一部分是为拿永久治理资格主动烧掉的。", "MAX_SUPPLY − totalSupply；永久治理销毁取 /ve totals.permanent"), "or")}
</div>
${sec("五池分配", "总量 210,000,000 枚 · 合计 100%")}
<div class="card"><div class="stack">${alloc.map(a => `<i style="width:${a[1]}%;background:${a[4]}" title="${a[0]} ${a[1]}%"></i>`).join("")}</div><div class="alloc">${alloc.map(a => `<div><span><em style="background:${a[4]}"></em>${a[0]} · ${a[1]}%</span><b>${fmt(a[2], 0)}</b><span>${a[3]}</span></div>`).join("")}</div></div>
${sec("供应、排放与收入")}
<div class="grid g4">
 ${kpi("累计已排放 · 社区+DAO", fmt(rel, 0), "AiLGNS", `社区 ${fmt(relC, 0)} · DAO ${fmt(relD, 0)}`, info("社区金库和 DAO 金库加起来已经发出去的 AiLGNS。", "/emission community.releasedCum + dao.releasedCum", `${API}/emission`))}
 ${kpi("剩余排放额度", fmt(fin(rel) ? totC + totD - rel : null, 0), "AiLGNS", "总预算 − 累计已排放", info("两个金库还剩多少没发：社区 1.638 亿 + DAO 2,100 万，减去已发出的。", "(communityTotal + daoTotal) − 累计已排放"))}
 ${kpi("协议 TVL", cp(ov && N(ov.tvl_usd)), "DAI", ov ? `${bj(ov.ts, false)} 快照` : "", info("锁在协议里的钱：五个交易池资金 + 协议储备 DAI，官网每天记一次。", "/overview latest.tvl_usd", `${API}/overview`))}
 ${kpi("24h 交易量", cp(ov && N(ov.volume_24h_usd)), "DAI", `五池实时合计 ${cp(pools.reduce((s, p) => s + (N(p.volume24hUsd) || 0), 0))}`, info("过去 24 小时五个池子一共成交了多少。", "/overview latest.volume_24h_usd；实时值 = /pools 各池 volume24hUsd 之和"))}
 ${kpi("已结算日", em ? dayL(em.community.lastSettledDay) : "—", "", em ? `当前第 ${em.clock.currentDay} 天 · 第 ${em.clock.currentEpoch} 纪元` : "", info("协议已经结算到第几天。协议日每天北京时间 0 点切换。", "/emission community.lastSettledDay"))}
 ${kpi("累计回购销毁", fmt(ov && N(ov.buyback_burned_cum), 2), "AiLGNS", "仅回购销毁来源", info("协议用收入回购并销毁的 AiLGNS 累计数量。", "/overview latest.buyback_burned_cum"))}
 ${kpi("协议收入 · 累计", fmt(income, 0), "DAI", "储备账本 DAI 入账累计", info("从创世到现在协议一共收进来多少 DAI（主要是卖出手续费和涡轮激活费）。这是流水，不是余额。", "/protocol treasury.reserve.byToken[DAI].inflow", `${API}/protocol`), "gr")}
 ${kpi("协议储备余额", fmt(ch.reserveDai, 0), "DAI", "ProtocolReserve 即时余额", info("协议储备账户现在实际还有多少 DAI，链上直接读。", "DAI.balanceOf(ProtocolReserve)", `${EXP}/address/${C.RESERVE}`), "gr")}
</div>
<div class="grid g4 mt">
 ${kpi("算力参与者", fmt(pw && pw.participants, 0), "人", "参与算力池的钱包数", info("有多少个钱包地址参与了算力池。", "/power participants", `${API}/power`))}
 ${kpi("全网生效算力", cp(pw && N(pw.totalActivePower)), "Power", pw ? `累计纳入 ${cp(N(pw.totalPower))}` : "", info("全网现在有效的算力。算力决定每天的排放怎么分。", "/power totalActivePower / totalPower"))}
 ${kpi("最近结算日排放", fmt(ov && N(ov.community_actual), 0), "AiLGNS", ov ? `社区 ${fmt(N(ov.community_actual), 0)} · DAO ${fmt(N(ov.dao_actual), 0)}` : "", info("最近一个已结算日真正发给参与者的 AiLGNS。预算 × 风险系数是上限，只有按算力分到人头上的部分才会发。", "/overview latest.community_actual"))}
 ${kpi("风险系数", em ? (em.factor.factorBps / 100).toFixed(0) + "%" : "—", "", em ? `风险等级 ${em.factor.riskLevel} · 今日预算 ${fmt(N(em.community.budgetToday), 0)}` : "", info("今天实际排放 = 基础预算 × 风险系数。系数越低发得越少，压掉的部分进保险国库。", "/emission factor.factorBps"), em && em.factor.factorBps < 10000 ? "wn" : "")}
</div>
${sec("治理锁仓 veAiLGNS")}
<div class="grid g4">
 ${kpi("锁仓总量", fmt(veT && N(veT.lockedPrincipal), 2), "AiLGNS", `${fmt(veT && veT.positions, 0)} 个仓位`, info("治理锁仓一共有多少仓位、锁了多少 AiLGNS。", "/ve totals", `${API}/ve`))}
 ${kpi("锁仓持有者", fmt(veT && veT.holders, 0), "人", `治理身份 ${fmt(veT && veT.identities, 0)} 个`, info("锁仓人数，以及其中锁仓价值 ≥ $500、拿到治理身份的人数。", "/ve totals.holders / identities"))}
 ${kpi("平均锁仓期", fmt(avgLock, 1), "纪元", fin(avgLock) ? `约 ${fmt(avgLock * 7, 0)} 天` : "", info("按本金加权的平均锁仓纪元数，不含永久仓位。1 纪元 = 7 天。", "/ve lockDistribution"))}
 ${kpi("永久治理销毁", fmt(veT && N(veT.permanent), 2), "AiLGNS", "为永久治理资格而销毁", info("为了拿永久治理资格主动销毁的 AiLGNS。", "/ve totals.permanent"))}
</div>
${sec("双引擎排放进度", em ? `当前第 ${em.clock.currentEpoch} / 520 纪元` : "")}
<div class="grid g2">${[["社区排放", relC, totC, em && N(em.community.suppressedCum), "第 1–520 纪元"], ["DAO 排放", relD, totD, em && N(em.dao.suppressedCum), "第 11–530 纪元"]].map(([n, r, t, s, rng]) => `<div class="card"><div class="row"><h3 style="margin:0">${n}</h3><span class="pill">${rng}</span><span class="ml mono">${fin(r) ? (r / t * 100).toFixed(2) : "—"}%</span></div><div class="bar"><i style="width:${fin(r) ? Math.max(.5, r / t * 100) : 0}%"></i></div><div class="row" style="font-size:12px;color:var(--ink2)"><span>已释放 / 预算 <b class="mono">${fmt(r, 0)} / ${fmt(t, 0)}</b></span><span class="ml">剩余 <b class="mono">${fmt(fin(r) ? t - r : null, 0)}</b></span></div><p class="note">风险系数累计扣留 ${fmt(s, 0)} AiLGNS（进保险国库，不是销毁）</p></div>`).join("")}</div>
${sec("趋势", "官网每日快照")}
<div class="grid g2">
 <div class="card"><h3>TVL（DAI）</h3>${lineChart(series.map(s => ({ v: N(s.tvl_usd), l: md(s.ts) })), { fv: v => fmt(v, 0) + " DAI" })}</div>
 <div class="card"><h3>AiLGNS 日终价格（DAI）</h3>${lineChart(series.map(s => ({ v: N(s.price), l: md(s.ts) })), { fv: v => fmt(v, 2) + " DAI", fy: v => fmt(v, 1) })}</div>
 <div class="card"><h3>每日社区排放（AiLGNS）</h3>${barChart((em && em.recentDays || []).map(d => ({ v: N(d.communityActual), l: dayL(d.day) })), { fv: v => fmt(v, 2) + " AiLGNS" })}</div>
 <div class="card"><h3>每日 24h 成交量（DAI）</h3>${barChart(series.map(s => ({ v: N(s.volume_24h_usd), l: md(s.ts), alt: true })), { fv: v => fmt(v, 0) + " DAI" })}</div>
</div>
${sec("算力与参与")}${powerBlock()}
${sec("生态动态", "最近协议储备入账")}
<div class="card">${feedList()}</div>`;
}
function powerBlock() {
  const pw = D.pw, s = pw && pw.series || [];
  const sum = n => s.slice(-n).reduce((a, d) => a + (N(d.newPower) || 0), 0), sumP = n => s.slice(-n).reduce((a, d) => a + (d.participants || 0), 0);
  return `<div class="grid g4">
 ${kpi("今日新增算力", cp(pw && N(pw.today.newPower)), "Power", pw ? `新增参与者 ${fmt(pw.today.newParticipants, 0)}` : "", info("今天（北京时间 0 点起）新加进来的算力。", "/power today"))}
 ${kpi("近 7 天新增", cp(s.length ? sum(7) : null), "Power", s.length ? `参与 ${fmt(sumP(7), 0)} 次` : "", info("最近 7 个协议日新增算力合计。", "/power series 最近 7 项 newPower 之和"))}
 ${kpi("近 30 天新增", cp(s.length ? sum(30) : null), "Power", s.length ? `参与 ${fmt(sumP(30), 0)} 次` : "", info("最近 30 个协议日新增算力合计。", "/power series 最近 30 项 newPower 之和"))}
 ${kpi("生效占比", pw && fin(N(pw.totalActivePower)) && N(pw.totalPower) ? (N(pw.totalActivePower) / N(pw.totalPower) * 100).toFixed(1) + "%" : "—", "", "生效算力 ÷ 累计纳入", info("现在还有效的算力占历史累计的比例。越低说明衰减越多。", "totalActivePower ÷ totalPower"))}
</div>
<div class="card mt"><h3>每日新增算力</h3>${barChart(s.map(d => ({ v: N(d.newPower), l: dayL(d.day), extra: d.participants + " 人" })), { fv: v => cp(v) + " Power" })}</div>`;
}
function feedList() {
  const it = D.feed && D.feed.items || []; if (!it.length) return `<div class="empty">暂无动态</div>`;
  return `<ul class="feed">${it.slice(0, 20).map(i => { const d = i.detail || {}; return `<li><span><span class="pill bl">${i.type === "treasury" ? "国库" : esc(i.type)}</span> ${esc(d.vault || "")} 入账 <b class="mono">${fmt(N(d.amount), 2)}</b> ${d.token && d.token.toLowerCase() === C.DAI.toLowerCase() ? "DAI" : ""} <span class="tag il">${esc(d.tagName || "")}</span></span><span class="mono" style="white-space:nowrap">${bj(i.ts)} ${i.ref ? exLink("tx/" + i.ref, "↗") : ""}</span></li>`; }).join("")}</ul>`;
}

/* ================= 页面：行情 · 资金 ================= */
function poolsTable() {
  const pools = D.pools && D.pools.pools || []; if (!pools.length) return empty("五池数据暂不可用");
  const tot = pools.reduce((s, p) => s + (N(p.tvlUsd) || 0), 0);
  return `<div class="card p0 scroll"><table class="tbl"><thead><tr><th>交易对</th><th class="r">TVL · DAI</th><th class="r">占比</th><th class="r">24h 成交</th><th class="r">24h 手续费</th><th class="r">价格</th><th class="r">激励年化</th></tr></thead><tbody>${pools.map(p => `<tr><td><b>${esc(POOLNAME[p.key] || p.key)}</b><span class="tag">${p.kind === 0 ? "主池" : "卫星池"} · ${exLink("address/" + p.pair, short(p.pair))}</span></td><td class="r">${fmt(N(p.tvlUsd), 0)}</td><td class="r">${tot ? (N(p.tvlUsd) / tot * 100).toFixed(1) + "%" : "—"}</td><td class="r">${fmt(N(p.volume24hUsd), 0)}</td><td class="r">${fmt(N(p.fees24hUsd), 2)}</td><td class="r">${fmt(N(p.price), 4)}</td><td class="r">${p.apr == null ? "—" : pct(N(p.apr))}</td></tr>`).join("")}<tr class="tot"><td>合计</td><td class="r">${fmt(tot, 0)}</td><td class="r">100%</td><td class="r">${fmt(pools.reduce((s, p) => s + (N(p.volume24hUsd) || 0), 0), 0)}</td><td class="r">${fmt(pools.reduce((s, p) => s + (N(p.fees24hUsd) || 0), 0), 2)}</td><td></td><td></td></tr></tbody></table></div><p class="note">数据：${SRC_OFF("/pools")}。无法计算的激励年化显示"—"，不以 0 代替。</p>`;
}
function pageMarket() {
  const ch = D.ch || {}, pr = D.pr, pol = D.pol, tb = D.tb, my = D.my;
  const pl = pricePool(), c24 = chg24();
  const resD = pr ? daiOf(pr.treasury.reserve.byToken) : null, resA = pr ? (pr.treasury.reserve.byToken || []).find(t => String(t.token).toLowerCase() === C.AILGNS.toLowerCase()) : null;
  const fees = pr && pr.fees, sellBps = fees ? fees.sellFeeBps : 300, vBps = fees ? fees.sellFeeVoterBps : 100, cBps = fees ? fees.sellFeeCommunityBps : 100, rBps = sellBps - vBps - cBps;
  const polPair = pol && pol.pairs && pol.pairs[0], kl = Q.klineData[Q.kline];
  const tagN = t => t === "INITIAL_INSURANCE_RESERVE" ? "初始保险储备" : t === "COMMUNITY_SUPPRESSED" ? "社区受抑制排放" : t;
  const sf = d => d && d.sellFee ? Object.values(d.sellFee).reduce((s, v) => s + U(BigInt(v)), 0) : null;
  const myToday = my && my.days ? my.days[my.days.length - 1] : null, sfToday = sf(myToday), sfAll = my && my.days ? my.days.reduce((s, d) => s + (sf(d) || 0), 0) : null;
  return `${ph("行情 · 底池 · 储备", "AiLGNS 价格与 K 线、五个交易池、协议储备资产、卖出手续费。")}
<div class="grid g4">
 ${kpi("AiLGNS 实时价格", fmt(pl, 4), "DAI", `24h <span class="${pcls(c24)}">${pct(c24)}</span> · 官网价 ${fmt(priceApi(), 4)}`, info("主池里当下的真实价格：DAI ÷ AiLGNS。官网价已扣卖出费，所以略低。", "getReserves()：DAI 储备 ÷ AiLGNS 储备", `${EXP}/address/${C.PAIR}`), "hero hl")}
 ${kpi("主池 DAI 储备", fmt(ch.poolDai, 0), "DAI", `AiLGNS 储备 ${fmt(ch.poolAi, 2)}`, info("主池里现在有多少 AiLGNS 和 DAI，链上直读。", "getReserves() token0=AiLGNS token1=DAI"))}
 ${kpi("主池 TVL", fmt(fin(ch.poolDai) ? ch.poolDai * 2 : null, 0), "DAI", polPair ? `协议自持 LP ${(N(polPair.retainedLp) / N(polPair.pairTotalSupply) * 100).toFixed(1)}%` : "", info("主池总价值（DAI 储备 × 2），以及协议自己持有的 LP 占比。协议自持越多，底池越难被抽走。", "DAI 储备 × 2；POL 保留 LP ÷ LP 总量"))}
 ${kpi("手续费收集合约", fmt(ch.feeDai, 2), "DAI", `另持 AiLGNS ${fmt(ch.feeAi, 4)}`, info("手续费归集账户里现在攒了多少。", "balanceOf(FeeCollector)", `${EXP}/address/${C.FEECOL}`))}
</div>
<div class="card mt"><div class="row"><h3 style="margin:0">AiLGNS / DAI K 线</h3><div class="seg ml" id="klSeg">${[["15m", "15 分"], ["1h", "1 小时"], ["4h", "4 小时"], ["1d", "日线"]].map(([k, n]) => `<button data-kl="${k}" class="${Q.kline === k ? "on" : ""}">${n}</button>`).join("")}</div></div>${kl ? candleChart(kl.candles) : `<div class="empty">正在加载 K 线…</div>`}<p class="note">数据：${SRC_OFF("/kline")}（主池成交聚合），下方浅色柱为成交额。</p></div>
${sec("五个交易池", "官网「流动性网络」")}${poolsTable()}
${sec("储备资产", "协议储备、保险国库、协议自有流动性")}
<div class="grid g3">
 ${kpi("协议储备 DAI 余额", fmt(ch.reserveDai, 0), "DAI", "即时余额", info("协议储备账户里现在实际有多少 DAI。", "DAI.balanceOf(ProtocolReserve)", `${EXP}/address/${C.RESERVE}`), "gr")}
 ${kpi("储备账本 DAI 入账", fmt(resD && N(resD.inflow), 0), "DAI", "累计流水 · 非余额", info("协议累计收进来的 DAI，即「协议收入·累计」。", "/protocol treasury.reserve inflow"))}
 ${kpi("储备账本 DAI 出账", fmt(resD && N(resD.outflow), 0), "DAI", resA ? `AiLGNS 出账 ${fmt(N(resA.outflow), 2)}` : "", info("协议储备累计付出去多少。", "/protocol treasury.reserve outflow"))}
 ${kpi("保险国库余额", fmt(ch.insur, 2), "AiLGNS", pr ? (pr.treasury.insurance.balanceByTag || []).map(t => `${tagN(t.tag)} ${fmt(N(t.balance), 2)}`).join(" · ") : "", info("保险国库里有多少 AiLGNS，以及按用途分类。", "AiLGNS.balanceOf(InsuranceTreasury) + /protocol 分类"))}
 ${kpi("协议自有流动性 POL", fmt(pol && N(pol.totalUsd), 0), "DAI", polPair ? `保留 LP ${fmt(N(polPair.retainedLp), 0)}` : "", info("协议自己持有的流动性价值。", "/pol totalUsd", `${API}/pol`))}
 ${kpi("涡轮累计手续费", fmt(tb && N(tb.totals.fee), 0), "DAI", tb ? `今日 ${fmt(N(tb.today.fee), 0)} DAI` : "", info("用涡轮激活时收取的手续费累计。", "/turbine totals.fee"))}
</div>
${sec("卖出手续费", `卖出 AiLGNS 收 ${(sellBps / 100).toFixed(0)}%，买入不收`)}
<div class="grid g4">
 ${kpi("卖出手续费率", (sellBps / 100).toFixed(0) + "%", "", `投票者 ${(vBps / 100).toFixed(0)}% · 社区 ${(cBps / 100).toFixed(0)}% · 储备 ${(rBps / 100).toFixed(0)}%`, info("卖 AiLGNS 扣的手续费，以及三方怎么分。", "/protocol fees.sellFeeBps 等"), "or")}
 ${kpi("今日卖出手续费", fmt(sfToday, 4), "AiLGNS", my ? (fin(sfToday) && fin(pl) ? `≈ ${fmt(sfToday * pl, 0)} DAI` : "") : `<span class="pill">待采集器</span>`, info("今天卖出手续费合计（三份相加）。需要本地采集器扫 SellFeeTaken 事件。", "./data/feed.json"))}
 ${kpi("累计卖出手续费", fmt(sfAll, 2), "AiLGNS", my ? (fin(sfAll) && fin(pl) ? `按现价 ≈ ${cp(sfAll * pl)} DAI` : "") : `<span class="pill">待采集器</span>`, info("创世以来每日卖出手续费合计。需要本地采集器。", "./data/feed.json"))}
 ${kpi("涡轮费率", fees ? (fees.turbineFeeBps / 100).toFixed(2) + "%" : "—", "", fees ? `销毁 ${(fees.turbineBurnBps / 100).toFixed(2)}% · 锁 ${Math.round(fees.turbineLockSeconds / 3600)} 小时` : "", info("激活涡轮时收取的费率、其中销毁比例和锁定时长。", "/protocol fees"))}
</div>`;
}

/* ================= 页面：持币地址 ================= */
function pageHolders() {
  const hc = D.hc, ch = D.ch || {}, pl = pricePool(), rows = Q.holders;
  return `${ph("AiLGNS 持币地址", "持币地址数与持币排行。协议金库、交易池等合约已标注。")}
<div class="grid g4">
 ${kpi("持币地址数", fmt(hc && N(hc.token_holders_count), 0), "", "余额 > 0 的地址", info("余额大于 0 的 AiLGNS 地址数。", "Blockscout tokens/{AiLGNS}/counters", `${EXP}/token/${C.AILGNS}`), "hl")}
 ${kpi("累计转账笔数", fmt(hc && N(hc.transfers_count), 0), "", "", info("AiLGNS 发行以来累计转账笔数。", "Blockscout transfers_count"))}
 ${kpi("当前总供应", fmt(ch.totalSupply, 2), "AiLGNS", "", info("AiLGNS 现在一共存在多少枚。", "AiLGNS.totalSupply()"))}
 ${kpi("目前流通量", fmt(ch.circulating, 2), "AiLGNS", "官网同口径", info("总供应 − 三个金库 − 1,465 万。", "同总览页"))}
</div>
<div class="card p0 scroll mt"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th class="r">持有 AiLGNS</th><th class="r">占总供应</th><th class="r">按主池价折合 DAI</th></tr></thead><tbody>${rows.length ? rows.map((h, i) => `<tr><td>${i + 1}</td><td>${addrLink(h.a)}${nameOf(h.a) || h.bsName ? `<span class="tag">${esc(nameOf(h.a) || h.bsName)}</span>` : h.c ? `<span class="tag">合约</span>` : ""}</td><td class="r">${fmt(h.v, 4)}</td><td class="r">${fin(ch.totalSupply) ? (h.v / ch.totalSupply * 100).toFixed(h.v / ch.totalSupply > .001 ? 2 : 5) + "%" : "—"}</td><td class="r">${fin(pl) ? fmt(h.v * pl, 0) : "—"}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">${Q.holdersBusy ? "正在加载…" : "暂无数据"}</td></tr>`}</tbody></table></div>
${Q.holdersNext ? `<div style="text-align:center;margin-top:10px"><button class="btn gh" id="hMore">${Q.holdersBusy ? "加载中…" : "加载更多（每次 50 个）"}</button></div>` : ""}`;
}
async function loadHolders(more) {
  if (Q.holdersBusy || (!more && Q.holders.length)) return; Q.holdersBusy = true; if (route().p === "holders") render();
  try {
    const qs = more && Q.holdersNext ? "?" + new URLSearchParams(Q.holdersNext).toString() : "";
    const j = await getJ(`${BS}/tokens/${C.AILGNS}/holders${qs}`);
    for (const it of j.items || []) Q.holders.push({ a: it.address.hash, v: U(BigInt(it.value)), c: it.address.is_contract, bsName: it.address.name || "" });
    Q.holdersNext = j.next_page_params || null;
  } catch { }
  Q.holdersBusy = false; if (route().p === "holders") render();
}

/* ================= 页面：涡轮 ================= */
function pageTurbine() {
  const t = D.tb, pr = D.pr, fees = pr && pr.fees, pl = pricePool();
  const head = ph("涡轮 Turbine", "用 DAI 激活涡轮，加速释放已领取的 AiLGNS 奖励。协议收入的大头来自这里。");
  if (!t) return head + empty(loadingTxt());
  const T = t.totals || {}, Y = t.today || {}, s = t.series || [];
  const income = pr ? N((daiOf(pr.treasury.reserve.byToken) || {}).inflow) : null;
  return head + `<div class="grid g4">
 ${kpi("累计花费 DAI", cp(N(T.daiSpent)), "DAI", fin(income) && N(T.daiSpent) ? `≈ 协议收入的 ${(N(T.daiSpent) / income * 100).toFixed(1)}%` : "", info("大家为涡轮一共花了多少 DAI，及其占协议总收入的比例。", "/turbine totals.daiSpent ÷ /protocol 储备 DAI 入账", `${API}/turbine`), "hl")}
 ${kpi("累计激活", fmt(N(T.activated), 2), "AiLGNS", `${fmt(T.activations, 0)} 次 · 当前锁定 ${fmt(N(T.locked), 2)}`, info("涡轮累计激活次数、AiLGNS 数量和现在还锁着的部分。", "/turbine totals"))}
 ${kpi("累计手续费", fmt(N(T.fee), 0), "DAI", fees ? `费率 ${(fees.turbineFeeBps / 100).toFixed(2)}% · 锁 ${Math.round(fees.turbineLockSeconds / 3600)} 小时` : "", info("涡轮手续费累计及费率。", "/turbine totals.fee + /protocol fees"))}
 ${kpi("今日", cp(N(Y.daiSpent)), "DAI", `激活 ${fmt(N(Y.activated), 2)} AiLGNS · ${fmt(Y.activations, 0)} 次`, info("今天（当前协议日）的涡轮情况。", `/turbine today · 协议第 ${t.currentDay} 天`), "or")}
</div>
<div class="grid g2 mt">
 <div class="card"><h3>每日花费 DAI · 近 30 天</h3>${barChart(s.map(d => ({ v: N(d.daiSpent), l: dayL(d.day), extra: fmt(N(d.activated), 2) + " AiLGNS" })), { fv: v => fmt(v, 0) + " DAI" })}</div>
 <div class="card"><h3>每日激活 AiLGNS</h3>${barChart(s.map(d => ({ v: N(d.activated), l: dayL(d.day), alt: true })), { fv: v => fmt(v, 2) + " AiLGNS" })}</div>
</div>
${sec("最近激活", `官网最近 ${(t.recent || []).length} 条`)}
<div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>时间（北京）</th><th>地址</th><th class="r">激活 AiLGNS</th><th class="r">花费 DAI</th><th class="r">单价</th><th>交易</th></tr></thead><tbody>${(t.recent || []).map(r => `<tr><td class="mono">${bj(r.ts)}</td><td>${addrLink(r.address)}</td><td class="r">${fmt(N(r.amount), 4)}</td><td class="r">${fmt(N(r.daiSpent), 2)}</td><td class="r">${N(r.amount) ? fmt(N(r.daiSpent) / N(r.amount), 2) : "—"}</td><td>${exLink("tx/" + r.tx, "↗")}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">暂无</td></tr>`}</tbody></table></div>
<p class="note">涡轮激活按市价计：当前主池价 ${fmt(pl, 2)} DAI。激活花的 DAI 进入协议储备，是「协议收入」的主要来源。</p>`;
}

/* ================= 页面：排放结算 ================= */
function pageEmission() {
  const em = D.em, ov = D.ov, my = D.my;
  const head = ph("排放结算", "每天基础预算多少、风险系数压掉多少、实际结算多少，和当天成交额对照看排放压力。");
  if (!em || !em.recentDays) return head + empty(loadingTxt());
  const cm = em.community || {}, lat = ov && ov.latest, ser = (ov && ov.series) || [], myd = (my && my.days) || [];
  const serBy = {}; ser.forEach(s => serBy[s.day] = s); const myBy = {}; myd.forEach(d => myBy[d.day] = d);
  const big4 = x => x ? Number(BigInt(x) / 10n ** 14n) / 1e4 : null;
  const rows = em.recentDays.map(d => { const s = serBy[d.day] || {}, m = myBy[d.day] || {}; const base = N(d.communityBase), act = N(d.communityActual), price = N(s.price), vol = m.volumeDai ? big4(m.volumeDai) : N(s.volume_24h_usd);
    return { day: d.day, base, factor: d.factorBps, act, stat: N(d.communityStatic), dynL: [N(d.growthApproved), N(d.networkApproved), N(d.consensusApproved)], suppressed: fin(base) && fin(act) ? base * (1 - d.factorBps / 10000) : null, claimedS: big4(m.staticClaimed), claimedD: big4(m.dynamicClaimed), price, vol, sells: m.sells, buys: m.buys, emitUsd: fin(act) && fin(price) ? act * price : null }; });
  const last = rows[rows.length - 1] || {}, sum = (k, n) => rows.slice(-n).reduce((a, r) => a + (fin(r[k]) ? r[k] : 0), 0), e7 = sum("emitUsd", 7), v7 = sum("vol", 7);
  const fb = lat ? lat.factor_bps : em.factor && em.factor.factorBps;
  return head + `<div class="grid g4">
 ${kpi("今日基础预算", fmt(N(cm.budgetToday), 0), "AiLGNS", `风险系数 ${fin(fb) ? (fb / 100).toFixed(0) : "—"}% → 最多结算 ${fmt(fin(fb) ? N(cm.budgetToday) * fb / 10000 : null, 0)}`, info("今天最多能结算多少 = 基础预算 × 风险系数。实际只发按算力分到人头上的部分。", "/emission community.budgetToday × factor_bps"), "hl")}
 ${kpi("最近结算日实发", fmt(last.act, 2), "AiLGNS", `第 ${last.day} 天 · 静态 ${fmt(last.stat, 2)} · 动态 ${(last.dynL || []).map(x => fmt(x, 1)).join("/")}`, info("实发 = 静态（按算力分）+ 动态（增长 / 网络 / 共识三条线）。", "/emission recentDays communityActual"))}
 ${kpi("累计释放 / 压缩", `${cp(N(cm.releasedCum))} / ${cp(N(cm.suppressedCum))}`, "AiLGNS", "压缩部分进保险国库", info("被风险系数压掉的部分转进保险国库。", "/emission community.releasedCum / suppressedCum"))}
 ${kpi("近 7 天排放市值 / 成交量", fin(e7) && v7 ? (e7 / v7 * 100).toFixed(2) + "%" : "—", "", `排放 ≈ $${cp(e7)} · 成交 $${cp(v7)}`, info("每天发出的 AiLGNS 按当天价格折成美元，和当天成交额对比。比例越高，潜在卖压越大。", "Σ(实发 × 当日价) ÷ Σ 成交额"), "or")}
</div>
<div class="grid g2 mt">
 <div class="card"><h3>每日实际结算（AiLGNS）</h3>${barChart(rows.map(r => ({ v: r.act, l: dayL(r.day), extra: fin(r.suppressed) ? `压缩 ${fmt(r.suppressed, 0)}` : "" })), { fv: v => fmt(v, 2) + " AiLGNS" })}</div>
 <div class="card"><h3>每日成交额（DAI）</h3>${barChart(rows.map(r => ({ v: r.vol, l: dayL(r.day), alt: true, extra: fin(r.sells) ? `卖 ${r.sells} / 买 ${r.buys} 笔` : "" })), { fv: v => fmt(v, 0) + " DAI" })}</div>
</div>
${sec("逐日明细", my ? "静态/动态已领 = 当天实际被领走的（可能是之前几天的排放）· 卖/买 = 用户笔数，不含涡轮买入与手续费兑换" : "静态/动态已领、买卖笔数需要本地采集器")}
<div class="card p0 scroll"><table class="tbl"><thead><tr><th>协议日</th><th class="r">基础预算</th><th class="r">系数</th><th class="r">压缩</th><th class="r">实发</th><th class="r">静态</th><th class="r">增长/网络/共识</th><th class="r">静态已领</th><th class="r">动态已领</th><th class="r">价格</th><th class="r">排放市值 $</th><th class="r">成交额</th><th class="r">卖/买</th></tr></thead><tbody>${rows.slice().reverse().map(r => `<tr><td>${dayL(r.day)}</td><td class="r">${fmt(r.base, 0)}</td><td class="r">${fin(r.factor) ? (r.factor / 100).toFixed(0) + "%" : "—"}</td><td class="r">${fmt(r.suppressed, 0)}</td><td class="r"><b>${fmt(r.act, 2)}</b></td><td class="r">${fmt(r.stat, 2)}</td><td class="r">${r.dynL.map(x => fmt(x, 1)).join(" / ")}</td><td class="r">${fmt(r.claimedS, 2)}</td><td class="r">${fmt(r.claimedD, 2)}</td><td class="r">${fmt(r.price, 2)}</td><td class="r">${fmt(r.emitUsd, 0)}</td><td class="r">${fmt(r.vol, 0)}</td><td class="r">${fin(r.sells) ? `${r.sells} / ${r.buys}` : "—"}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ================= 页面：销毁数据 ================= */
function pageBurn() {
  const ch = D.ch || {}, ve = D.ve, ov = D.ov && D.ov.latest, tot = D.my && D.my.totals, days = D.my && D.my.days || [];
  const used = fin(ch.gateBurned) && fin(ch.gateMax) && ch.gateMax ? ch.gateBurned / ch.gateMax * 100 : null;
  const wait = `<span class="pill">待采集器</span>`;
  return `${ph("销毁数据", "AiLGNS 各类销毁来源汇总，以及 LGNS 销毁换算力的情况。")}
<div class="grid g3">
 ${kpi("AiLGNS 累计销毁", fmt(ch.burned, 2), "AiLGNS", "最大供应 − 当前总供应", info("所有来源的销毁合计。", "MAX_SUPPLY − totalSupply", `${EXP}/token/${C.AILGNS}`), "or")}
 ${kpi("永久治理销毁", fmt(ve && N(ve.totals.permanent), 2), "AiLGNS", "销毁换永久 ve 投票权", info("为换永久 veAiLGNS 投票权而销毁的 AiLGNS。", "/ve totals.permanent"))}
 ${kpi("回购销毁", fmt(ov && N(ov.buyback_burned_cum), 2), "AiLGNS", "协议收入回购", info("协议用收入回购并销毁的累计数量。", "/overview buyback_burned_cum"))}
 ${kpi("AiLGNS 销毁换算力", tot && tot.ailgnsBurned != null ? fmt(U(BigInt(tot.ailgnsBurned)), 2) : "—", "AiLGNS", tot ? (tot.ailgnsBurned == null ? "链上至今没有这类记录" : `${fmt(tot.ailgnsBurnCount, 0)} 笔`) : wait, info("销毁 AiLGNS 换算力的累计。采集器核对了 PowerLedger 合约里的全部事件类型，从上线到现在没有出现过这类带用户地址的记录，所以显示「—」而不是填 0。", "PowerLedger 合约全部事件扫描"))}
 ${kpi("LGNS 销毁换算力", tot ? fmt(U(BigInt(tot.lgnsBurned), 9), 0) : "—", "LGNS", tot ? `${fmt(tot.lgnsBurnCount, 0)} 笔 · 产生 ${cp(U(BigInt(tot.lgnsBurnPower)))} Power` : wait, info("销毁 500 LGNS 换算力的累计。需要本地采集器。", "./data/feed.json totals"))}
 ${kpi("今日 LGNS 已销毁", fmt(ch.gateBurned, 0), "LGNS", fin(ch.gateMax) ? `每日上限 ${fmt(ch.gateMax, 0)} · ${fin(ch.gatePer) && ch.gatePer ? fmt(ch.gateMax / ch.gatePer, 0) + " 个名额" : ""} · 已用 ${fin(used) ? used.toFixed(1) : "—"}%` : "", info("今天 500 LGNS 销毁名额用掉了多少。", "LgnsBurnGate.burnedLgnsToday() / dailyMaximumLgns()", `${EXP}/address/${C.GATE}`), "hl")}
</div>
${sec("每日 LGNS 销毁笔数")}
<div class="card">${days.length ? barChart(days.map(d => ({ v: d.lgnsBurn ? d.lgnsBurn.count : 0, l: dayL(d.day) })), { fv: v => fmt(v, 0) + " 笔", fy: v => fmt(v, 0) }) : `<div class="empty">这张图需要本地采集器（第二期）。今天的实时名单可在「500 LGNS 资格」页直接从链上读。</div>`}</div>`;
}

/* ================= 页面：500 LGNS 资格 ================= */
const OPEN_SEC = 43140; // 官方 10-31 起每天 11:59:00（北京）开放
function pageElig() {
  const ch = D.ch || {};
  const used = fin(ch.gateBurned) && fin(ch.gateMax) && ch.gateMax ? ch.gateBurned / ch.gateMax * 100 : null, full = fin(used) && used >= 99.999;
  const openLbl = String(Math.floor(OPEN_SEC / 3600)).padStart(2, "0") + ":" + String(Math.floor(OPEN_SEC % 3600 / 60)).padStart(2, "0");
  const nowS = Date.now() / 1000, todayOpen = ch.dayStart ? ch.dayStart + OPEN_SEC : null;
  const next = ch.dayStart ? ((!full && todayOpen && nowS < todayOpen) ? todayOpen : ch.dayStart + 86400 + OPEN_SEC) : null;
  const delayed = fin(used) && ch.gateBurned === 0 && todayOpen && nowS > todayOpen + 300;
  const b = Q.burners[Q.burnDay];
  return `${ph("500 LGNS 销毁资格", "开抢倒计时、资格检查（链上直读 6 项条件）、每天抢到的地址名单。全部只读，不连钱包。")}
<div class="grid g2">
 <div class="card kpi ${full ? "rd" : "gr"}"><div class="k">今日额度状态</div><div class="v" style="font-size:18px">${full ? "今日额度已满" : delayed ? "今天还没放出额度" : fin(used) ? (ch.gateBurned > 0 ? "还有额度" : "等待开抢") : "—"}</div><div class="bar ${full ? "rd" : ""}"><i style="width:${fin(used) ? used : 0}%"></i></div><div class="n">${fin(used) ? used.toFixed(1) + "% 已用" : ""} · 剩余 ${fmt(fin(ch.gateMax) ? ch.gateMax - ch.gateBurned : null, 0)} LGNS / 上限 ${fmt(ch.gateMax, 0)}</div></div>
 ${delayed ? `<div class="card kpi or"><div class="k">今日开放时间</div><div class="v" style="font-size:18px">延迟中</div><div class="n">通常 ${openLbl} 开放，今天过点还没放出 · 开放后通常 10 秒内抢光</div></div>` : `<div class="card kpi hl"><div class="k">下次开抢（北京时间 ${openLbl}）</div><div class="countdown" id="cd" data-to="${next || ""}">—</div><div class="n">${next ? bj(next) : ""} · 通常 10 秒内抢光</div></div>`}
</div>
${sec("资格检查", "输入地址，链上直读 6 项条件")}
<div class="card"><form class="form" id="eligForm"><input id="eligIn" placeholder="输入 0x 开头的钱包地址" value="${esc(Q.eligAddr)}" autocomplete="off" spellcheck="false"><button class="btn">检查资格</button></form>${Q.elig ? eligView(Q.elig) : `<p class="note">链上规则：长期质押（360/600 天质押或 360 天债券）合计 ≥ ${fmt(ch.gateMinStake ?? 20000, 0)} LGNS；每个钱包每纪元（7 天）一次；每笔固定 ${fmt(ch.gatePer ?? 500, 0)} LGNS；全网每日上限 ${fmt(ch.gateMax ?? 200000, 0)} LGNS；每天 ${openLbl}（北京）开放。</p>`}</div>
${sec("抢到销毁名单", "链上 PowerBurnQueued 事件实时读取")}
<div class="card"><div class="row"><div class="seg" id="bdSeg">${[0, 1, 2, 3, 4, 5, 6].map(o => `<button data-bd="${o}" class="${Q.burnDay === o ? "on" : ""}">${o === 0 ? "今天" : o === 1 ? "昨天" : ch.dayStart ? md(ch.dayStart - o * 86400) : o + " 天前"}</button>`).join("")}</div><span class="ml mono" style="font-size:12px">${b && !b.loading && !b.error ? `<b>${b.rows.length}</b> 个地址 · ${fmt(b.rows.reduce((s, r) => s + r.lgns, 0), 0)} LGNS${b.rows.length > 1 && b.rows[0].ts ? ` · 首笔 ${bj(b.rows[0].ts).slice(-8)} → 末笔 ${bj(b.rows[b.rows.length - 1].ts).slice(-8)}` : ""}` : ""}</span></div>
<div style="margin-top:10px">${burnersView(b)}</div></div>`;
}
function burnersView(b) {
  if (!b || b.loading) return `<div class="empty">正在从链上读取${b && b.progress ? "（" + b.progress + "）" : ""}…</div>`;
  if (b.error) return `<div class="empty">读取失败：${esc(b.error)} <button class="btn gh sm" data-retry-burn>重试</button></div>`;
  if (!b.rows.length) return `<div class="empty">这一天还没有人成功销毁</div>`;
  const q = Q.burnSearch.trim().toLowerCase(), rows = q ? b.rows.filter(r => r.user.toLowerCase().includes(q)) : b.rows;
  return `<div class="form" style="margin-bottom:8px"><input id="bdQ" placeholder="搜索地址（部分即可）" value="${esc(Q.burnSearch)}" autocomplete="off"><button class="btn gh" data-copy-burn type="button">复制全部地址</button></div>
<div class="scroll maxh"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th class="r">销毁 LGNS</th><th class="r">获得算力</th><th>时间（北京）</th><th class="r">距首笔</th><th>交易</th></tr></thead><tbody>${rows.map(r => `<tr${Q.eligAddr && r.user.toLowerCase() === Q.eligAddr.toLowerCase() ? ' class="hl"' : ""}><td>${r.rank}</td><td>${addrLink(r.user)}</td><td class="r">${fmt(r.lgns, 0)}</td><td class="r">${fmt(r.power, 0)}</td><td class="mono">${r.ts ? bj(r.ts) : "区块 " + r.block}</td><td class="r">${r.ts && b.rows[0].ts ? "+" + (r.ts - b.rows[0].ts) + "s" : "—"}</td><td>${exLink("tx/" + r.tx, "↗")}</td></tr>`).join("")}</tbody></table></div><p class="note">按上链先后排序。区块 ${b.from} – ${b.to}，读取于 ${ago(b.at)}。</p>`;
}
async function blockAt(ts, head) {
  let n = head.n - (head.ts - ts); if (n < 1) n = 1;
  for (let k = 0; k < 4; k++) { const b = await rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false]); const diff = parseInt(b.timestamp, 16) - ts; if (diff === 0) break; n -= diff; if (n < 1) n = 1; }
  for (let k = 0; k < 6; k++) { const b = await rpc("eth_getBlockByNumber", ["0x" + (n - 1).toString(16), false]); if (parseInt(b.timestamp, 16) >= ts) n--; else break; }
  for (let k = 0; k < 6; k++) { const b = await rpc("eth_getBlockByNumber", ["0x" + n.toString(16), false]); if (parseInt(b.timestamp, 16) < ts) n++; else break; }
  return n;
}
async function loadBurners(off, force) {
  const ch = D.ch; if (!ch || !ch.dayStart) return;
  const cur = Q.burners[off];
  if (cur && !force) { if (cur.loading || cur.refreshing) return; const age = Date.now() - (cur.at || 0); if (age < (cur.error ? 30000 : off === 0 ? 55000 : Infinity)) return; }
  const bg = cur && !cur.error && cur.rows && cur.rows.length && !force;
  if (bg) cur.refreshing = true; else { Q.burners[off] = { loading: true, rows: [], progress: "" }; if (route().p === "elig") render(); }
  try {
    const head = { n: parseInt(await rpc("eth_blockNumber", []), 16) };
    head.ts = parseInt((await rpc("eth_getBlockByNumber", ["0x" + head.n.toString(16), false])).timestamp, 16);
    const start = ch.dayStart - off * 86400, end = start + 86400;
    const from = await blockAt(start, head), to = off === 0 ? head.n : (await blockAt(end, head)) - 1;
    const chunks = []; for (let a = from; a <= to; a += 4900) chunks.push([a, Math.min(to, a + 4899)]);
    const total = chunks.length, logs = []; let done = 0;
    const worker = async () => { while (chunks.length) { const [a, b2] = chunks.shift(); let r; for (let t = 0; t < 3; t++) { try { r = await rpc("eth_getLogs", [{ address: C.LEDGER, topics: [BURN_TOPIC], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b2.toString(16) }]); break; } catch (e) { if (t === 2) throw e; } } logs.push(...(r || [])); done++; if (!bg && Q.burners[off]) Q.burners[off].progress = done + "/" + total; } };
    await Promise.all([1, 2, 3, 4, 5].map(worker));
    const seen = new Set(), rows = [];
    for (const l of logs) { const k = l.transactionHash + l.logIndex; if (seen.has(k)) continue; seen.add(k); rows.push({ user: "0x" + l.topics[1].slice(26), lgns: U(W(l.data, 0), 9), power: U(W(l.data, 1)), block: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16), ts: l.blockTimestamp ? parseInt(l.blockTimestamp, 16) : null, tx: l.transactionHash }); }
    rows.sort((a, b2) => a.block - b2.block || a.li - b2.li); rows.forEach((r, i) => r.rank = i + 1);
    // 部分节点日志里没有 blockTimestamp，补读块时间
    const need = [...new Set(rows.filter(r => !r.ts).map(r => r.block))];
    if (need.length && need.length <= 400) { const bs = await pbatch(need.map(n => ({ method: "eth_getBlockByNumber", params: ["0x" + n.toString(16), false] }))); const tm = {}; need.forEach((n, i) => { if (bs[i]) tm[n] = parseInt(bs[i].timestamp, 16); }); rows.forEach(r => { if (!r.ts && tm[r.block]) r.ts = tm[r.block]; }); }
    Q.burners[off] = { rows, from, to, at: Date.now() };
  } catch (e) { if (bg) { cur.refreshing = false; cur.at = Date.now(); return; } Q.burners[off] = { error: String(e.message || e), rows: [], at: Date.now() }; }
  if (route().p === "elig") render();
}
async function checkElig(addr, rerender = true) {
  addr = addr.trim(); Q.eligAddr = addr; if (!isAddr(addr)) { Q.elig = { error: "badaddr" }; if (rerender) render(); return; }
  Q.elig = { loading: true }; if (rerender) render();
  try {
    const r = await batch([call(C.GATE, "stakeOf", addr), call(C.GATE, "minimumStake"), call(C.GATE, "burnEpochOf", addr), call(C.CLOCK, "currentEpoch"), call(C.LGNS, "balanceOf", addr), call(C.LGNS, "allowance", addr, C.LEDGER), { method: "eth_getBalance", params: [addr, "latest"] }, call(C.GATE, "dailyMaximumLgns"), call(C.GATE, "burnedLgnsToday"), call(C.GATE, "maximumLgns")]);
    const v = i => r[i] ? W(r[i], 0) : null, ep = v(3) != null ? Number(v(3)) : null;
    const r2 = ep != null ? await batch([call(C.CLOCK, "epochStart", ep + 1)]) : [null];
    Q.elig = { addr, stake: U(v(0), 9), minStake: U(v(1), 9), burnEpoch: v(2) != null ? Number(v(2)) : null, epoch: ep, lgns: U(v(4), 9), allow: U(v(5), 9), gas: r[6] ? U(BigInt(r[6])) : null, max: U(v(7), 9), burned: U(v(8), 9), per: U(v(9), 9), nextEpoch: r2[0] ? Number(W(r2[0], 0)) : null, at: Date.now() };
  } catch (e) { Q.elig = { error: "rpc", msg: String(e.message || e) }; }
  render();
}
function eligView(x) {
  if (x.loading) return `<div class="empty">正在读取链上数据…</div>`;
  if (x.error) return `<div class="verdict no">${x.error === "badaddr" ? "地址格式不对，需要 0x 开头 + 40 位" : "链上读取失败：" + esc(x.msg || "")}</div>`;
  const per = x.per || 500;
  const okStake = fin(x.stake) && fin(x.minStake) && x.stake >= x.minStake, okEpoch = x.burnEpoch != null && x.epoch != null && x.burnEpoch !== x.epoch, okBal = fin(x.lgns) && x.lgns >= per, okAllow = fin(x.allow) && x.allow >= per, okGas = fin(x.gas) && x.gas >= 0.02;
  const quota = fin(x.max) && fin(x.burned) ? x.max - x.burned : null, base = okStake && okEpoch && okBal;
  const inToday = (Q.burners[0] && Q.burners[0].rows || []).find(r => r.user.toLowerCase() === x.addr.toLowerCase());
  const li = (t, val, ok, tip) => `<li><span>${ok === true ? '<span class="pill ok">✓</span>' : ok === false ? '<span class="pill no">✗</span>' : '<span class="pill wn">!</span>'} ${t}${tip ? `<span class="tag">${tip}</span>` : ""}</span><b>${val}</b></li>`;
  return `<div class="verdict ${base ? "ok" : "no"}">${base ? "✓ 符合销毁 500 LGNS 的链上条件" : "✗ 暂不符合销毁 500 LGNS 的条件"}${base && quota != null && quota <= 0 ? " · 但今日全网额度已满，等下次开抢" : ""}</div>
${inToday ? `<div class="verdict ok">今天已抢到：第 ${inToday.rank} 名，${bj(inToday.ts)} 销毁 ${fmt(inToday.lgns, 0)} LGNS</div>` : ""}
<ul class="checks">
${li("长期质押 ≥ " + fmt(x.minStake, 0) + " LGNS", fmt(x.stake, 2) + " LGNS", okStake, "360/600 天质押 + 360 天债券合计（LgnsBurnGate.stakeOf）")}
${li("本纪元（7 天）还没烧过", x.burnEpoch === x.epoch ? `本纪元已烧过，${x.nextEpoch ? bj(x.nextEpoch, false) + " 后可再烧" : "下纪元可再烧"}` : "可以烧", okEpoch, `当前第 ${x.epoch} 纪元 · 上次销毁纪元 ${x.burnEpoch || "无"}`)}
${li("A 链 LGNS 余额 ≥ " + fmt(per, 0), fmt(x.lgns, 2) + " LGNS", okBal, "LGNS.balanceOf")}
${li("已授权算力账本使用 LGNS", okAllow ? "已授权 " + (x.allow > 1e12 ? "无限" : fmt(x.allow, 0)) : "未授权（烧之前要先授权）", okAllow ? true : null, "LGNS.allowance(地址, PowerLedger)")}
${li("Gas（Anubis 原生 DAI）", fmt(x.gas, 4) + " DAI", okGas ? true : null, "建议 ≥ 0.02 DAI")}
${li("今日全网剩余额度", quota == null ? "—" : quota <= 0 ? "已满" : fmt(quota, 0) + " LGNS", quota == null ? null : quota > 0, `每日上限 ${fmt(x.max, 0)} LGNS`)}
</ul><p class="note">只读链上数据，未连接钱包、未发任何交易。"符合"只代表链上门槛达标，不保证抢得到当日额度。 ${addrLink(x.addr, "查看这个地址的全部数据 →")}</p>`;
}
let cdT = 0;
function tickCountdown() {
  clearInterval(cdT); const el = $("#cd"); if (!el || !el.dataset.to) return;
  const f = () => { const s = Math.max(0, Math.floor(+el.dataset.to - Date.now() / 1000)); el.textContent = s ? `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : "开抢中"; };
  f(); cdT = setInterval(() => { if (!document.body.contains(el)) return clearInterval(cdT); f(); }, 1000);
}

/* ================= 页面：治理投票 Gauge ================= */
const GSTAT = s => s === 0 ? "正常" : s === 1 ? "暂停" : s === 2 ? "已停用" : String(s);
const usd18 = x => { try { return Number(BigInt(String(x).split(".")[0]) / 10n ** 18n); } catch { return null; } };
function pageGauge() {
  const g = D.ga, ve = D.ve, pr = D.pr, clk = pr && pr.clock;
  const head = ph("治理投票 · Gauge", "veAiLGNS 持有人每纪元给五个交易池投票，决定 DAO 排放金库 2,100 万 AiLGNS 怎么分。");
  if (!g) return head + empty(loadingTxt());
  const tv = N(g.totalVotes), gauges = g.gauges || [], tvlSum = gauges.reduce((s, x) => s + (N(x.tvlUsd) || 0), 0);
  const daoRel = pr && pr.released ? N(pr.released.dao) : null, daoTot = pr && pr.supply ? N(pr.supply.daoTotal) : null;
  const pname = p => { const x = gauges.find(z => z.pair === p); return x ? (POOLNAME[x.key] || x.key) : (nameOf(p) || short(p)); };
  return head + `<div class="grid g4">
 ${kpi("当前纪元", `第 ${g.epoch.current} 纪元`, "", g.epoch.voteOpen ? `<span class="pill ok">投票开放中</span> 截止 ${bj(g.epoch.voteClose, false)}` : `<span class="pill wn">投票已关闭</span>`, info("现在生效的是哪个纪元的投票权重，投票是否还开着。", "/gauge epoch", `${API}/gauge`), "hl")}
 ${kpi("本纪元总票数", fmt(tv, 2), "ve", tv ? "" : "还没有人投票", info("本纪元一共投了多少票。", "/gauge totalVotes"))}
 ${kpi("治理锁仓总量", fmt(ve && N(ve.totals.lockedPrincipal), 2), "AiLGNS", ve ? `${fmt(ve.totals.holders, 0)} 人 · ${fmt(ve.totals.identities, 0)} 个治理身份` : "", info("锁仓总量、人数和治理身份数。", "/ve totals"))}
 ${kpi("DAO 排放已释放", fmt(daoRel, 2), "AiLGNS", fin(daoRel) && daoTot ? `预算 ${cp(daoTot)} · 剩余 ${cp(daoTot - daoRel)}` : "", info("DAO 金库的预算、已发和剩余。没有池子达到激活门槛前不发。", "/protocol released.dao"))}
</div>
${sec("五个池子本纪元", "权重 = 本纪元票数占比；健康分与 TVL 决定能否激活")}
<div class="card p0 scroll"><table class="tbl"><thead><tr><th>池子</th><th>状态</th><th class="r">权重</th><th class="r">票数</th><th class="r">健康分</th><th class="r">池 TVL $</th><th class="r">TVL 占比</th><th class="r">7 日执行</th><th>合约</th></tr></thead><tbody>${gauges.map(x => `<tr><td><b>${esc(POOLNAME[x.key] || x.key)}</b>${x.whitelisted ? "" : ` <span class="pill no">未白名单</span>`}</td><td><span class="pill ${x.status === 0 ? "ok" : "wn"}">${GSTAT(x.status)}</span></td><td class="r">${(x.weightBps / 100).toFixed(2)}%</td><td class="r">${fmt(N(x.votes), 2)}</td><td class="r">${fmt(x.healthScore, 0)}${x.healthCapBps ? ` <span class="tag il">上限 ${(x.healthCapBps / 100).toFixed(0)}%</span>` : ""}</td><td class="r">${fmt(N(x.tvlUsd), 0)}</td><td class="r">${tvlSum ? ((N(x.tvlUsd) || 0) / tvlSum * 100).toFixed(1) + "%" : "—"}</td><td class="r">${fmt(N(x.executed7d), 2)}</td><td>${exLink("address/" + x.pair, short(x.pair))}</td></tr>`).join("")}</tbody></table></div>
<p class="note">激活门槛：池子投票价值 ≥ $${fmt(pr && pr.fees ? usd18(pr.fees.gaugeActivateUsd) : null, 0)}，低于 $${fmt(pr && pr.fees ? usd18(pr.fees.gaugeSuspendUsd) : null, 0)} 暂停；ve 锁仓 26–208 纪元，治理身份需锁仓价值 ≥ $500。</p>
${sec("历史权重", "每纪元生效的权重")}
${g.weightsHistory && g.weightsHistory.length ? (() => { const cols = (g.weightsHistory[0].pairs || []).map(p => p.pair); return `<div class="card p0 scroll"><table class="tbl"><thead><tr><th>纪元</th>${cols.map(p => `<th class="r">${esc(pname(p))}</th>`).join("")}</tr></thead><tbody>${g.weightsHistory.slice().sort((x, y) => y.epoch - x.epoch).map(h => `<tr><td>${h.epoch}</td>${cols.map(p => { const w = (h.pairs || []).find(q => q.pair === p); return `<td class="r">${w ? (N(w.weightBps) / 100).toFixed(2) + "%" : "—"}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`; })() : empty("暂无历史")}
${sec("治理锁仓分布")}
${ve && ve.lockDistribution ? `<div class="card p0 scroll"><table class="tbl"><thead><tr><th>锁定期</th><th class="r">仓位数</th><th class="r">本金 AiLGNS</th><th class="r">占比</th><th style="width:30%"></th></tr></thead><tbody>${ve.lockDistribution.map(d => { const sh = ve.totals.lockedPrincipal ? N(d.principal) / N(ve.totals.lockedPrincipal) * 100 : null; return `<tr><td>${d.lockEpochs ? `${d.lockEpochs} 纪元（约 ${(d.lockEpochs * (clk ? clk.epochDays : 7) / 365).toFixed(1)} 年）` : "<b>永久</b>"}</td><td class="r">${fmt(d.positions, 0)}</td><td class="r">${fmt(N(d.principal), 2)}</td><td class="r">${fin(sh) ? sh.toFixed(1) + "%" : "—"}</td><td><div class="bar" style="margin:0"><i style="width:${sh || 0}%"></i></div></td></tr>`; }).join("")}</tbody></table></div>` : ""}`;
}

/* ================= 页面：算力 ================= */
function pagePower() {
  const pw = D.pw, ch = D.ch || {}, rk = Q.rankData[Q.rank], last = lastEmDay();
  return `${ph("算力", "全网算力、兑换倍率、每日新增、入金额度与社区排行。")}
<div class="grid g4">
 ${kpi("全网生效算力", cp(pw && N(pw.totalActivePower)), "Power", `链上实时 ${cp(ch.totalActive)}`, info("全网当前有效算力，链上算力账本实时值。", "PowerLedger.totalActivePower()", `${EXP}/address/${C.LEDGER}`), "hl")}
 ${kpi("累计纳入算力", cp(pw && N(pw.totalPower)), "Power", "含已衰减部分", info("历史累计纳入的算力总量。", "/power totalPower"))}
 ${kpi("算力参与者", fmt(pw && pw.participants, 0), "人", "", info("参与算力池的钱包数。", "/power participants"))}
 ${kpi("今日 DAI 入金剩余", cp(ch.daiRemain), "DAI", fin(ch.daiCap) && ch.daiCap ? `上限 ${cp(ch.daiCap)} · 已用 ${(100 - ch.daiRemain / ch.daiCap * 100).toFixed(1)}%` : "", info("今天用 DAI 参与算力的额度还剩多少。", "Lens.daiDepositRemainingToday() / daiDepositCapToday()", `${EXP}/address/${C.LENS}`), "or")}
 ${kpi("DAI 参与倍率", fin(ch.powerRate) ? ch.powerRate + "x" : "—", "", "1 DAI 记 2.5 算力，DAI 进储备不可赎回", info("DAI 换算力的倍率。", "PowerLedger.powerRateBps() ÷ 10000"))}
 ${kpi("LGNS 销毁倍率", fin(ch.lgnsRate) ? ch.lgnsRate + "x" : "—", "", "销毁 1 LGNS 得 2 算力，每笔固定 500", info("销毁 LGNS 换算力的倍率。", "PowerLedger.lgnsPowerRate()"))}
 ${kpi("最近一日按算力分配", last ? fmt(N(last.communityStatic), 2) : "—", "AiLGNS", "静态排放（最近结算日）", info("最近结算日按算力占比发出的静态排放。", "/emission recentDays.communityStatic"))}
 ${kpi("每单位算力日产出", last && pw && N(pw.totalActivePower) ? (N(last.communityStatic) / N(pw.totalActivePower) * 1e4).toFixed(4) : "—", "AiLGNS / 万 Power", "静态排放 ÷ 全网生效算力", info("每 1 万算力一天大约分到多少 AiLGNS（按最近结算日估算）。", "communityStatic ÷ totalActivePower × 10000"), "gr")}
</div>
${sec("每日新增")}${powerBlock()}
<div class="card mt"><h3>每日新增参与者（人）</h3>${barChart((pw && pw.series || []).map(d => ({ v: d.participants, l: dayL(d.day), alt: true })), { fv: v => fmt(v, 0) + " 人", fy: v => fmt(v, 0) })}</div>
${sec("社区排行", "官网 /community/ranking · 增长 / 网络 / 共识三类社区算力")}
<div class="card"><div class="seg" id="rkSeg">${[["day", "昨日"], ["week", "近 7 天"], ["all", "累计"]].map(([k, n]) => `<button data-rk="${k}" class="${Q.rank === k ? "on" : ""}">${n}</button>`).join("")}</div>
${rk ? (rk.rows && rk.rows.length ? `<div class="scroll mt"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th class="r">增长算力</th><th class="r">网络算力</th><th class="r">共识算力</th><th class="r">奖励 AiLGNS</th></tr></thead><tbody>${rk.rows.map(r => `<tr><td>${r.rank}</td><td>${addrLink(r.address)}</td><td class="r">${cp(N(r.growthPower))}</td><td class="r">${cp(N(r.networkPower))}</td><td class="r">${fmt(N(r.consensusPower), 2)}</td><td class="r"><b>${fmt(N(r.reward), 4)}</b></td></tr>`).join("")}</tbody></table></div><p class="note">统计区间：第 ${rk.fromDay ?? 1} – ${rk.toDay} 天。</p>` : `<div class="empty">暂无排行</div>`) : `<div class="empty">正在加载排行…</div>`}</div>`;
}

/* ================= 页面：计算器 ================= */
function pageCalc() {
  const ch = D.ch || {}, pw = D.pw, last = lastEmDay();
  const totalA = pw ? N(pw.totalActivePower) : ch.totalActive, stat = last ? N(last.communityStatic) : null, pl = pricePool(), k = Q.calc;
  const val = (id, d) => esc(k[id] ?? d), opt = (id, list, def) => list.map(([v, n]) => `<option value="${v}" ${(k[id] || def) === v ? "selected" : ""}>${n}</option>`).join("");
  return `${ph("计算器", "默认值已填入当前链上数据，可自行修改。结果仅为按当前条件的估算。")}
<div class="grid g3">
<div class="card"><h3>① 参与算力 → 每日排放估算</h3>
 <label class="field"><span>参与方式</span><select id="c-mode">${opt("c-mode", [["dai", `投入 DAI（1 DAI = ${ch.powerRate || 2.5} 算力）`], ["lgns", `销毁 LGNS（1 LGNS = ${ch.lgnsRate || 2} 算力）`], ["power", "直接输入算力"]], "dai")}</select></label>
 <label class="field"><span>数量</span><input id="c-amt" type="number" min="0" step="any" value="${val("c-amt", 1000)}"></label>
 <label class="field"><span>全网生效算力</span><input id="c-total" type="number" min="1" step="any" value="${val("c-total", fin(totalA) ? Math.round(totalA) : "")}"></label>
 <label class="field"><span>每日按算力分配的排放（AiLGNS）</span><input id="c-daily" type="number" min="0" step="any" value="${val("c-daily", fin(stat) ? stat : 4725)}"></label>
 <label class="field"><span>AiLGNS 价格（DAI）</span><input id="c-price" type="number" min="0" step="any" value="${val("c-price", fin(pl) ? pl.toFixed(2) : "")}"></label>
 <label class="field"><span>LGNS 价格（DAI，销毁 LGNS 时算成本用）</span><input id="c-lp" type="number" min="0" step="any" value="${val("c-lp", "")}"></label>
 <div class="res" id="c-out"></div>
 <p class="note">算法：我的算力 ÷（全网生效算力 + 我的算力）× 每日按算力分配的排放。未计入动态排放、风险系数变化、全网算力增长、算力衰减与领取时的涡轮成本。</p>
</div>
<div class="card"><h3>② 买入 / 卖出 AiLGNS 能换多少</h3>
 <label class="field"><span>方向</span><select id="s-dir">${opt("s-dir", [["sell", "卖出 AiLGNS 换 DAI"], ["buy", "用 DAI 买 AiLGNS"]], "sell")}</select></label>
 <label class="field"><span>数量</span><input id="s-amt" type="number" min="0" step="any" value="${val("s-amt", 10)}"></label>
 <label class="field"><span>主池 AiLGNS 储备</span><input id="s-ra" type="number" step="any" value="${val("s-ra", fin(ch.poolAi) ? ch.poolAi.toFixed(4) : "")}"></label>
 <label class="field"><span>主池 DAI 储备</span><input id="s-rd" type="number" step="any" value="${val("s-rd", fin(ch.poolDai) ? ch.poolDai.toFixed(2) : "")}"></label>
 <label class="field"><span>卖出手续费 %</span><input id="s-fee" type="number" step="any" value="${val("s-fee", D.pr && D.pr.fees ? D.pr.fees.sellFeeBps / 100 : 3)}"></label>
 <div class="res" id="s-out"></div>
 <p class="note">按恒定乘积池（x×y=k）、池子 0.3% 交易费计算；卖出另扣 AiLGNS 卖出手续费。实际成交以链上为准。</p>
</div>
<div class="card"><h3>③ 算力衰减 → 多久归零、每天要补多少</h3>
 <label class="field"><span>我的生效算力</span><input id="d-pw" type="number" min="0" step="any" value="${val("d-pw", 25000)}"></label>
 <label class="field"><span>每日衰减 %</span><input id="d-rate" type="number" min="0" step="any" value="${val("d-rate", 0.2795)}"></label>
 <label class="field"><span>想维持的算力下限</span><input id="d-floor" type="number" min="0" step="any" value="${val("d-floor", 20000)}"></label>
 <label class="field"><span>DAI 参与倍率</span><input id="d-dai" type="number" min="0" step="any" value="${val("d-dai", ch.powerRate || 2.5)}"></label>
 <div class="res" id="d-out"></div>
 <p class="note">按日复利衰减 P×(1−r)^天；"每天补" = 当前算力 × 衰减率，按倍率折 DAI。衰减率默认取社区实测 0.2795%/天，以链上为准。</p>
</div></div>`;
}
function calcRun() {
  const g = id => Number(($("#" + id) || {}).value), ch = D.ch || {};
  $$("#page input,#page select").forEach(i => { if (i.id && /^[csd]-/.test(i.id)) Q.calc[i.id] = i.value; });
  const cell = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  if ($("#c-out")) {
    const mode = $("#c-mode").value, amt = g("c-amt"), tot = g("c-total"), daily = g("c-daily"), p = g("c-price"), lp = g("c-lp");
    const rate = mode === "dai" ? (ch.powerRate || 2.5) : mode === "lgns" ? (ch.lgnsRate || 2) : 1, power = amt * rate, share = tot > 0 ? power / (tot + power) : 0, d = share * daily, dv = d * p;
    const cost = mode === "dai" ? amt : mode === "lgns" && lp > 0 ? amt * lp : null;
    $("#c-out").innerHTML = cell("获得算力", fmt(power, 2)) + cell("占全网", (share * 100).toFixed(share < .0001 ? 6 : 4) + "%") + cell("每日约得 AiLGNS", fmt(d, 6)) + cell("每日约合 DAI", fmt(dv, 4)) + cell("30 天约得 AiLGNS", fmt(d * 30, 4)) + cell("按此速度回本", cost && dv > 0 ? fmt(cost / dv, 0) + " 天" : "—");
  }
  if ($("#s-out")) {
    const dir = $("#s-dir").value, amt = g("s-amt"), ra = g("s-ra"), rd = g("s-rd"), fee = g("s-fee") / 100, lpFee = .003, spot = rd / ra;
    if (dir === "sell") { const net = amt * (1 - fee), x = net * (1 - lpFee), out = rd * x / (ra + x), impact = (1 - (out / net) / spot) * 100; $("#s-out").innerHTML = cell("扣卖出费后入池", fmt(net, 6) + " AiLGNS") + cell("约得 DAI", fmt(out, 4)) + cell("平均成交价", fmt(out / amt, 4)) + cell("价格冲击", fmt(impact, 3) + "%") + cell("卖出手续费", fmt(amt * fee, 6)) + cell("当前池价", fmt(spot, 4)) + cell("成交后池价", fmt((rd - out) / (ra + x), 4)); }
    else { const x = amt * (1 - lpFee), out = ra * x / (rd + x), eff = amt / out; $("#s-out").innerHTML = cell("约得 AiLGNS", fmt(out, 6)) + cell("平均成交价", fmt(eff, 4)) + cell("价格冲击", fmt((eff / spot - 1) * 100, 3) + "%") + cell("当前池价", fmt(spot, 4)) + cell("成交后池价", fmt((rd + x) / (ra - out), 4)); }
  }
  if ($("#d-out")) {
    const P = g("d-pw"), r = g("d-rate") / 100, floor = g("d-floor"), dr = g("d-dai") || 2.5, after = n => P * Math.pow(1 - r, n);
    const days = P > 0 && floor > 0 && floor < P && r > 0 ? Math.ceil(Math.log(floor / P) / Math.log(1 - r)) : null, half = r > 0 ? Math.ceil(Math.log(.5) / Math.log(1 - r)) : null, topup = P * r;
    $("#d-out").innerHTML = cell("30 天后", cp(after(30))) + cell("90 天后", cp(after(90))) + cell("跌到下限需", days != null ? days + " 天" : "—") + cell("减半需", half != null ? half + " 天" : "—") + cell("每天补算力", fmt(topup, 2)) + cell("折合每天 DAI", fmt(topup / dr, 2)) + cell("折合每月 DAI", fmt(topup / dr * 30, 0));
  }
}

/* ================= 页面：查地址 ================= */
const MN = { PowerDaiQueued: "DAI 参与（排队）", PowerDaiReleased: "DAI 算力生效", PowerFundraiseImported: "创世共建导入", PowerBurnQueued: "销毁 LGNS（排队）", PowerBurnReleased: "LGNS 算力生效", PowerAilgnsBurned: "销毁 AiLGNS", StaticClaimed: "领取静态排放", ClaimCredited: "领取记账", PowerRewardConsumed: "算力奖励消耗", DynamicClaimed: "领取动态排放", TurbineActivated: "涡轮激活", VePositionCreated: "创建锁仓", PermanentBurned: "永久治理销毁" };
const WKEY = "lt-watch";
const watchGet = () => (store.get(WKEY, []) || []).filter(isAddr);
const isWatched = a => watchGet().some(x => x.toLowerCase() === String(a).toLowerCase());
const watchBtn = a => isAddr(a) ? `<button class="btn gh" type="button" data-watch="${a}">${isWatched(a) ? "★ 已关注" : "☆ 关注"}</button>` : "";
function toggleWatch(a) { let l = watchGet(); l = isWatched(a) ? l.filter(x => x.toLowerCase() !== a.toLowerCase()) : [a, ...l].slice(0, 30); store.set(WKEY, l); Q.watch = null; render(); }
function pageAddress(a) {
  if (a && a !== Q.addrQ) { Q.addrQ = a; Q.actLim = 40; setTimeout(() => loadAddr(a), 0); }
  return `${ph("查地址", "余额、算力、参与记录、团队与等级、排放与领取、500 LGNS 资格、链上活动，一次查全。")}
<div class="card"><form class="form" id="addrForm"><input id="addrIn" placeholder="输入 0x 开头的钱包地址" value="${esc(Q.addrQ)}" autocomplete="off" spellcheck="false"><button class="btn">查询</button>${watchBtn(Q.addrQ)}</form></div>
${Q.addr ? addrView(Q.addr) : watchSection()}`;
}
async function fetchAllCreditActivities(a) {
  const first = await api(`/activity/${a}?limit=100&offset=0`).catch(() => null);
  if (!first) return [];
  const total = Number(first.total) || 0, rows = [...(first.rows || [])];
  const pages = Math.ceil(total / 100);
  if (pages > 1) {
    const rest = await Promise.all([...Array(pages - 1)].map((_, i) => api(`/activity/${a}?limit=100&offset=${(i + 1) * 100}`).catch(() => null)));
    for (const j of rest) if (j) rows.push(...(j.rows || []));
  }
  const seen = new Set(), byDay = new Map();
  for (const r of rows) {
    if (r.module !== "emission" || r.method !== "ClaimCredited") continue;
    const key = (r.tx || "") + ":" + (r.logIndex || "");
    if (seen.has(key)) continue;
    seen.add(key);
    const day = bj(r.ts, false).slice(0, 5);
    let x = byDay.get(day);
    if (!x) byDay.set(day, x = { ts: r.ts, amount: 0, tx: r.tx, n: 0 });
    x.amount += N(r.amount) || 0; x.n++;
    if (new Date(r.ts) > new Date(x.ts)) { x.ts = r.ts; x.tx = r.tx; }
  }
  return [...byDay.values()].sort((x, y) => new Date(y.ts) - new Date(x.ts));
}
async function loadMoreCredits() {
  const x = Q.addr; if (!x || x.creditBusy) return;
  if ((x.creditLimit || 20) < (x.credits || []).length) { x.creditLimit = (x.creditLimit || 20) + 20; render(); return; }
  if (x.creditFull) return;
  x.creditBusy = true; render();
  try {
    const all = await fetchAllCreditActivities(x.a);
    if (all.length) x.credits = all;
    x.creditFull = true;
    x.creditLimit = (x.creditLimit || 20) + 20;
  } catch (e) { }
  x.creditBusy = false;
  render();
}

async function loadAddr(a, lim) {
  if (!isAddr(a)) { Q.addr = { error: "badaddr" }; render(); return; }
  if (!lim) { Q.addr = { loading: true }; render(); }
  const L = lim || 40;
  const [bal, p, e, c, l, n, act, tbA, veA, z] = await Promise.all([
    batch([call(C.AILGNS, "balanceOf", a), call(C.LGNS, "balanceOf", a), { method: "eth_getBalance", params: [a, "latest"] }, call(C.GATE, "stakeOf", a), { method: "eth_getCode", params: [a, "latest"] }]).catch(() => null),
    api(`/power/${a}?limit=50`).catch(() => null), api("/emission/" + a).catch(() => null), api("/community/" + a).catch(() => null), api("/level/" + a).catch(() => null),
    api(`/nft/${a}?limit=20`).catch(() => null), api(`/activity/${a}?limit=${L}`).catch(() => null), api("/turbine/" + a).catch(() => null), api("/ve/" + a).catch(() => null),
    fetch(`/api/zones?addr=${a}`, { credentials: "same-origin", headers: { accept: "application/json" } }).then(r => r.ok ? r.json() : null).catch(() => null)]);
  if (a !== Q.addrQ) return;
  Q.addr = { a, bal: bal ? { ai: bal[0] ? U(W(bal[0], 0)) : null, lgns: bal[1] ? U(W(bal[1], 0), 9) : null, dai: bal[2] ? U(BigInt(bal[2])) : null, stake: bal[3] ? U(W(bal[3], 0), 9) : null, contract: bal[4] && bal[4] !== "0x" } : null, p, e, c, l, n, act, tbA, veA, z, lim: L, credits: (e && e.accrued && e.accrued.credits) || [], creditLimit: 20, creditBusy: false, creditFull: false };
  if (!D.lv) api("/level").then(x => { if (x) { D.lv = x; if (route().p === "address") render(); } }).catch(() => { });
  if (route().p === "address") render();
  if (!lim && Q.eligAddr.toLowerCase() !== a.toLowerCase()) checkElig(a, false);
}

function levelProgress(l, zoneLines) {
  if (!l) return "";
  const th = (D.lv && D.lv.thresholds) || (D.lvl && D.lvl.thresholds) || [];
  const cur = N(l.level) || 0;
  const next = th.find(t => N(t.level) === cur + 1);
  const ve = N(l.veUsd) || 0;
  const zs = (l.zones || []).map(z => N(z) || 0);
  if (!th.length) return `<div class="card mt"><div class="row"><b>等级进度</b><span class="pill wn ml">P${cur}</span><span class="ml">升级门槛数据未加载，请稍后刷新</span></div></div>`;
  const maxLv = Math.max(...th.map(t => N(t.level)));
  if (!next) return `<div class="card mt"><div class="row"><b>等级进度</b><span class="pill ok ml">P${cur}</span><span class="ml">${cur >= maxLv ? "已达最高等级" : "暂无下一级门槛数据"}</span></div></div>`;
  const veReq = N(next.veUsd) || 0, veGap = Math.max(0, veReq - ve);
  const zr = next.zoneUsd != null ? N(next.zoneUsd) : null;
  const zMet = zr ? zs.filter(z => z >= zr).length : null;
  const rows = [];
  rows.push(`<tr><td>锁仓价值</td><td class="r">$${fmt(ve, 0)}</td><td class="r">$${fmt(veReq, 0)}</td><td class="r ${veGap > 0 ? "dn" : "up"}">${veGap > 0 ? `差 $${fmt(veGap, 0)}` : "已达标"}</td><td>—</td></tr>`);
  ["大区", "二区", "三区"].forEach((n, i) => {
    const z = zs[i] || 0, g = zr ? Math.max(0, zr - z) : null;
    const zl = (zoneLines || [])[i];
    rows.push(`<tr><td>${n}</td><td class="r">$${fmt(z, 0)}</td><td class="r">${zr ? `$${fmt(zr, 0)}` : "—"}</td><td class="r ${zr && g > 0 ? "dn" : "up"}">${zr ? (g > 0 ? `差 $${fmt(g, 0)}` : "已达标") : "—"}</td><td>${zl && zl.a ? `${addrLink(zl.a)}<br><span class="note">链上累计 $${fmt(zl.v, 0)}</span>` : "—"}</td></tr>`);
  });
  if (next.contains != null) rows.push(`<tr><td>伞下 P${next.contains}</td><td class="r">—</td><td class="r">需 ${next.contains} 个</td><td class="r">官网未返回当前数量</td></tr>`);
  return `<div class="card mt"><div class="row"><b>等级进度</b><span class="tag il ml">P${cur} → P${next.level}</span><span class="ml">${zr ? `三区达标 ${zMet}/3` : "按锁仓与伞下等级"}</span></div><table class="tbl mt"><thead><tr><th>要求</th><th class="r">当前</th><th class="r">下一级门槛</th><th class="r">还差</th><th>对应直推线（累计入金）</th></tr></thead><tbody>${rows.join("")}</tbody></table><p class="note">门槛来自官方 /level；等级按「锁仓价值 + 三个大区业绩（每区都要达标）+ 伞下高等级人数」综合判定。三区地址按链上累计入金排序，与官网结算口径可能略有差异。</p></div>`;
}

function addrView(x) {
  if (x.loading) return `<div class="card mt"><div class="sk" style="height:120px"></div></div>`;
  if (x.error) return `<div class="verdict no">地址格式不对</div>`;
  const b = x.bal || {}, ps = x.p && x.p.summary, pl = pricePool(), c = x.c, l = x.l, nft = x.n, e = x.e;
  const totalA = D.pw ? N(D.pw.totalActivePower) : null, act = ps ? N(ps.activePower) : null, last = lastEmDay();
  const estDay = fin(act) && fin(totalA) && last ? act / totalA * N(last.communityStatic) : null;
  const credits = (x.credits && x.credits.length ? x.credits : (e && e.accrued && e.accrued.credits) || []);
  const lastCredit = credits[0] || null;
  const creditedTotal = e && e.accrued ? N(e.accrued.creditedTotal) : null;
  const consumedTotal = e && e.accrued ? N(e.accrued.consumedTotal) : null;
  const pendingTotal = fin(creditedTotal) && fin(consumedTotal) ? creditedTotal - consumedTotal : null;
  const avg7 = credits.length ? credits.slice(0, Math.min(7, credits.length)).reduce((s, c) => s + N(c.amount), 0) / Math.min(7, credits.length) : null;
  return `<div class="card mt"><div class="row"><b class="mono" style="word-break:break-all">${esc(x.a)}</b>${nameOf(x.a) ? `<span class="pill ok">${esc(nameOf(x.a))}</span>` : ""}${b.contract ? `<span class="pill">合约</span>` : ""}<span class="ml">${exLink("address/" + x.a, "区块浏览器 ↗")}</span> <button class="btn gh sm" data-copy="${x.a}">复制地址</button></div></div>
${sec("余额")}
<div class="grid g4">
 ${kpi("AiLGNS", fmt(b.ai, 6), "", fin(b.ai) && fin(pl) ? `≈ ${fmt(b.ai * pl, 2)} DAI` : "", info("这个地址持有的 AiLGNS。", "AiLGNS.balanceOf"), "hl")}
 ${kpi("LGNS（A 链）", fmt(b.lgns, 4), "", "", info("这个地址在 Anubis 链上持有的 LGNS。", "LGNS.balanceOf（9 位小数）"))}
 ${kpi("DAI（A 链原生 / Gas）", fmt(b.dai, 4), "", "", info("Anubis 链上的 DAI 余额，同时用来付 Gas。", "eth_getBalance"))}
 ${kpi("长期质押 LGNS", fmt(b.stake, 2), "", "360/600 天质押 + 360 债券合计", info("参与 500 LGNS 销毁要求的长期质押额，需 ≥ 2 万。", "LgnsBurnGate.stakeOf"))}
</div>
${sec("算力")}
<div class="grid g4">
 ${kpi("生效算力", fmt(act, 2), "Power", fin(act) && fin(totalA) ? `占全网 ${(act / totalA * 100).toFixed(6)}% · 估日产 ${fmt(estDay, 4)} AiLGNS` : "", info("这个地址当前有效算力、占全网比例，以及按最近结算日估算的每日静态排放。", "/power/{地址} summary.activePower"), "hl")}
 ${kpi("待生效算力", fmt(ps && N(ps.pendingPower), 2), "Power", "", info("已记上但还没生效的算力。", "/power/{地址} summary.pendingPower"))}
 ${kpi("累计算力", fmt(ps && N(ps.totalPower), 2), "Power", ps ? `${ps.records} 条记录` : "", info("历史累计纳入的算力。", "/power/{地址} summary.totalPower"))}
 ${kpi("累计投入", fmt(ps && N(ps.totalDai), 2), "DAI", "", info("累计投入多少 DAI 换算力。", "/power/{地址} summary.totalDai"))}
</div>
${x.p && x.p.records && x.p.records.length ? `<details class="fold"><summary>算力记录（${x.p.records.length} 条）</summary><div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>时间（北京）</th><th>类型</th><th class="r">数量</th><th class="r">算力</th><th>状态</th><th>交易</th></tr></thead><tbody>${x.p.records.map(r => `<tr><td class="mono">${bj(r.ts)}</td><td>${esc(MN[r.method] || r.method)}</td><td class="r">${r.daiAmount ? fmt(N(r.daiAmount), 2) + " DAI" : r.lgnsAmount ? fmt(N(r.lgnsAmount), 0) + " LGNS" : r.ailgnsAmount ? fmt(N(r.ailgnsAmount), 4) + " AiLGNS" : "—"}</td><td class="r">${fmt(N(r.power), 2)}</td><td>${r.status === "active" ? `<span class="pill ok">生效</span>` : r.status === "queued" ? `<span class="pill wn">排队</span>` : esc(r.status || "")}</td><td>${r.tx ? exLink("tx/" + r.tx, "↗") : ""}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
${sec("团队与等级")}
${c ? `<div class="grid g4">${kpi("团队人数", fmt(c.team, 0), "人", "", info("这个地址伞下所有层级成员总数。", "/community/{地址}"), "hl")}${kpi("直推人数", fmt(c.direct, 0), "人", "", info("直接推荐的人数。", "/community/{地址}"))}${kpi("团队有效算力", cp(N(c.teamActivePower)), "Power", "", info("整个团队现在有效的算力。", "/community/{地址}"))}${kpi("等级", l ? (l.level ? "P" + l.level : "无等级") : "—", "", l ? `治理锁仓 $${fmt(N(l.veUsd), 2)}${l.reason === "ve_below_p1" ? " · 锁仓未达 P1 门槛" : l.reason ? " · " + esc(l.reason) : ""}` : "", info("锁仓价值（美元）和对应等级。", "/level/{地址}"), "or")}</div>${levelProgress(l, x.z && x.z.zoneLines)}
<p class="note">上级：${c.referrer ? addrLink(c.referrer, c.referrer) : "—"} · 社区层级 ${fmt(c.level, 0)}</p>
<details class="fold"><summary>直推明细（${(c.directs || []).length} 人，按有效算力排序）</summary><div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th class="r">有效算力</th><th>绑定时间</th></tr></thead><tbody>${(c.directs || []).slice().sort((p, q) => N(q.activePower) - N(p.activePower)).map((d, i) => `<tr><td>${i + 1}</td><td>${addrLink(d.address)}</td><td class="r">${cp(N(d.activePower))}</td><td class="mono">${d.boundAt ? bj(d.boundAt, false) : "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">没有直推</td></tr>`}</tbody></table></div></details>` : empty("官网没有这个地址的社区数据")}
${sec("排放与领取")}
<div class="grid g4">
 ${kpi("最近每日获得", lastCredit ? fmt(N(lastCredit.amount), 4) : "—", "AiLGNS", lastCredit ? `${bj(lastCredit.ts, false)} · 近 7 日均 ${fmt(avg7, 4)}` : "", info("最近一次结算记入的 AiLGNS；近 7 天为最近 7 条每日记录的平均。", "/emission/{地址} accrued.credits"), "hl")}
 ${kpi("历史累计获得", fmt(creditedTotal, 4), "AiLGNS", pendingTotal != null ? `已领取 ${fmt(consumedTotal, 4)} · 未领取 ${fmt(pendingTotal, 4)}` : "", info("链上累计记入这个地址的 AiLGNS 排放（含未领取）；已领取为 consumedTotal。", "/emission/{地址} accrued.creditedTotal"))}
 ${kpi("涡轮激活次数", fmt(e && e.activations ? e.activations.length : null, 0), "", e && e.activations && e.activations.length ? `共花 ${fmt(e.activations.reduce((s, q) => s + N(q.daiSpent), 0), 2)} DAI` : "", info("激活涡轮的次数和花费。", "/emission/{地址} activations"))}
 ${kpi("生产 NFT", fmt(nft && nft.minted && nft.minted.tokens, 0), "", nft && nft.minted ? `剩余额度 ${fmt(N(nft.minted.remainingCapacityDaiNow), 2)} DAI` : "", info("NFT 数量与剩余收益额度。", "/nft/{地址}"))}
 ${kpi("社区池累计记账", nft && nft.poolCredited ? fmt(N(nft.poolCredited.growth) + N(nft.poolCredited.network) + N(nft.poolCredited.consensus), 6) : "—", "AiLGNS", "增长 + 网络 + 共识", info("三条动态线给这个地址记入的收益。", "/nft/{地址} poolCredited"))}
</div>
${sec("每日获得明细", credits.length ? `共 ${credits.length} 天 · 合计 ${fmt(credits.reduce((s, c) => s + N(c.amount), 0), 4)} AiLGNS` : "")}
${credits.length ? `<div class="card p0"><table class="tbl"><thead><tr><th>#</th><th>时间（北京）</th><th class="r">当天获得 AiLGNS</th><th class="r">占累计</th><th>交易</th></tr></thead><tbody>${credits.slice(0, Math.max(20, x.creditLimit || 20)).map((c, i) => `<tr><td>${i + 1}</td><td class="mono">${bj(c.ts)}</td><td class="r"><b>${fmt(N(c.amount), 4)}</b></td><td class="r">${fin(creditedTotal) && creditedTotal > 0 ? (N(c.amount) / creditedTotal * 100).toFixed(2) + "%" : "—"}</td><td>${c.tx ? exLink("tx/" + c.tx, "↗") : ""}</td></tr>`).join("")}</tbody></table></div>${(x.creditLimit || 20) < credits.length || !x.creditFull ? `<div id="creditMore" class="note" style="text-align:center;padding:12px">${x.creditBusy ? "正在加载更多…" : "向下滚动加载更多…"}</div>` : ""}` : `<div class="card"><div class="empty">暂无每日记入记录</div></div>`}
<p class="note">来自官方 /emission/{地址} 的 accrued.credits（只返回最近 30 条）；完整历史以获得总额为准。</p>
${sec("500 LGNS 销毁资格")}
<div class="card">${Q.elig && Q.elig.addr && Q.elig.addr.toLowerCase() === x.a.toLowerCase() ? eligView(Q.elig) : `<div class="empty">正在读取…</div>`}</div>
${sec("链上活动", x.act ? `共 ${fmt(x.act.total, 0)} 条` : "")}
${x.act && x.act.rows && x.act.rows.length ? `<div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>时间（北京）</th><th>模块</th><th>动作</th><th class="r">数量</th><th>交易</th></tr></thead><tbody>${x.act.rows.map(r => `<tr><td class="mono">${bj(r.ts)}</td><td>${esc(r.module)}</td><td>${esc(MN[r.method] || r.method)}</td><td class="r">${fmt(N(r.amount), 6)}</td><td>${exLink("tx/" + r.tx, "↗")}</td></tr>`).join("")}</tbody></table></div>${x.act.total > x.act.rows.length ? `<div style="text-align:center;margin-top:8px"><button class="btn gh" data-act-more>再加载 40 条</button></div>` : ""}` : empty("暂无活动记录")}
${sec("团队新增业绩")}<div class="card"><p class="note" style="margin:0">伞下逐层、逐直推线的新增入金 / 涡轮 / 锁仓：<a href="#/growth/${x.a}">打开「团队新增业绩」查这个地址 →</a>（实时查询）</p></div>`;
}
function watchSection() {
  const list = watchGet();
  if (!list.length) return `<div class="card mt"><b>我的关注</b><p class="note">查任一地址后点「☆ 关注」，这里会汇总它们的等级、团队、锁仓与余额。只存在本机浏览器。</p></div>`;
  const w = Q.watch; if ((!w || w.at < Date.now() - 300000) && !Q.watchBusy) setTimeout(loadWatch, 0);
  return `${sec("我的关注", `${list.length} 个地址`)}<div class="card p0 scroll"><table class="tbl"><thead><tr><th>地址</th><th>等级</th><th class="r">锁仓 $</th><th class="r">团队</th><th class="r">直推</th><th class="r">团队有效算力</th><th class="r">AiLGNS</th><th></th></tr></thead><tbody>${list.map(a => { const r = w && w.rows.find(z => z.a === a); return `<tr><td>${addrLink(a)}${nameOf(a) ? ` <span class="tag il">${esc(nameOf(a))}</span>` : ""}</td><td>${r ? (r.l && r.l.level ? `<span class="pill ok">P${r.l.level}</span>` : "无") : "…"}</td><td class="r">${r ? fmt(r.l && N(r.l.veUsd), 0) : "…"}</td><td class="r">${r ? fmt(r.c && r.c.team, 0) : "…"}</td><td class="r">${r ? fmt(r.c && r.c.direct, 0) : "…"}</td><td class="r">${r ? cp(r.c && N(r.c.teamActivePower), 1) : "…"}</td><td class="r">${r ? fmt(r.bal, 2) : "…"}</td><td><button class="btn gh sm" data-watch="${a}">✕</button></td></tr>`; }).join("")}</tbody></table></div>`;
}
async function loadWatch() {
  const list = watchGet(); if (!list.length || Q.watchBusy) return; Q.watchBusy = true;
  try {
    const bal = await batch(list.map(a => call(C.AILGNS, "balanceOf", a))).catch(() => []);
    const rows = await Promise.all(list.map(async (a, i) => { const [c, l] = await Promise.all([api("/community/" + a).catch(() => null), api("/level/" + a).catch(() => null)]); return { a, bal: bal[i] ? U(W(bal[i], 0)) : null, c, l }; }));
    Q.watch = { at: Date.now(), rows };
  } finally { Q.watchBusy = false; }
  if (route().p === "address" && !Q.addr) render();
}

/* ================= 页面：合约权限（链上实时扫描） ================= */
const PSEL = { owner: "0x8da5cb5b", roleCount: "0xca15c873", roleMember: "0x9010d07c", feeToSetter: "0x094b7415" };
const PSLOT = { impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" };
const PROLES = [["ADMIN", "0x" + "0".repeat(64)], ["GUARDIAN", "0x55435dd261a4b9b3364963f7738a7a662ad9c84396d64be3365284bb7f0a5041"], ["PAUSER", "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a"], ["MINTER", "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6"], ["LIQUIDITY", "0x39a8b3e6e97619937505a2ae24f70fc909c329e7595f016056def5c61ec407f4"]];
const PRN = { ADMIN: "最高管理员", GUARDIAN: "守护", PAUSER: "暂停", MINTER: "铸币", LIQUIDITY: "流动性" };
const ZERO = "0x0000000000000000000000000000000000000000";
const pAddr = h => h && h.length >= 66 && /^0x0{24}[0-9a-f]{40}$/i.test(h.slice(0, 66)) ? "0x" + h.slice(26, 66) : null;
const pNum = h => h && h.length === 66 ? Number(BigInt(h)) : null;
function permList() {
  const oc = (D.pr && D.pr.contracts) || {}, A = (k, fb) => oc[k] || fb || "";
  return [["AILGNS_ADDRESS", "AiLGNS 代币", C.AILGNS], ["LGNS_ADDRESS", "LGNS（A 链）", C.LGNS], ["DAI_ADDRESS", "DAI（A 链）", C.DAI], ["USDT_ADDRESS", "USDT（A 链）"], ["GLGNS_ADDRESS", "gLGNS"], ["A_ADDRESS", "A 币"],
    ["AILGNS_DAI_PAIR", "AiLGNS/DAI 主池", C.PAIR], ["AILGNS_LGNS_PAIR", "AiLGNS/LGNS 池"], ["AILGNS_GLGNS_PAIR", "AiLGNS/gLGNS 池"], ["AILGNS_USDT_PAIR", "AiLGNS/USDT 池"], ["AILGNS_A_PAIR", "AiLGNS/A 池"],
    ["HELIX_ROUTER_ADDRESS", "HelixRouter"], ["ROUTER_ADDRESS", "SwapRouter"], ["FACTORY_ADDRESS", "Factory"], ["ORACLE_ADDRESS", "Oracle"],
    ["POWER_LEDGER_ADDRESS", "PowerLedger", C.LEDGER], ["LGNS_BURN_GATE", "LgnsBurnGate", C.GATE], ["EPOCH_CLOCK_ADDRESS", "EpochClock", C.CLOCK], ["EMISSION_SCHEDULE_ADDRESS", "EmissionSchedule"], ["DAILY_SETTLEMENT_ADDRESS", "DailySettlement"], ["RISK_CONTROLLER_ADDRESS", "RiskController"], ["TURBINE_ADDRESS", "涡轮 Turbine", C.TURBINE],
    ["COMMUNITY_VAULT_ADDRESS", "社区排放金库", C.CVAULT], ["GAUGE_VAULT_ADDRESS", "DAO 排放金库", C.GVAULT], ["INSURANCE_TREASURY_ADDRESS", "保险储备国库", C.INSUR], ["PROTOCOL_RESERVE_ADDRESS", "协议储备", C.RESERVE], ["FEE_COLLECTOR_ADDRESS", "FeeCollector", C.FEECOL], ["POL_VAULT_ADDRESS", "POL Vault", C.POLV],
    ["VE_ADDRESS", "veAiLGNS", C.VE], ["GAUGE_VOTING_ADDRESS", "GaugeVoting"], ["COMMUNITY_ADDRESS", "社区关系 Community", C.COMMUNITY], ["PRODUCTION_NFT_ADDRESS", "ProductionNFT"]]
    .map(([k, n, fb]) => [k, n, A(k, fb)]).filter(x => isAddr(x[2]));
}
async function loadPerms() {
  if (Q.permsBusy) return; Q.permsBusy = true; render();
  try {
    const list = permList();
    const r1 = await pbatch(list.flatMap(([, , a]) => [{ to: a, data: PSEL.owner }, { method: "eth_getStorageAt", params: [a, PSLOT.impl, "latest"] }, { method: "eth_getStorageAt", params: [a, PSLOT.admin, "latest"] }, { method: "eth_getCode", params: [a, "latest"] }]));
    const rows = list.map(([k, n, a], i) => { const q = r1.slice(i * 4, i * 4 + 4); const z = v => v === ZERO ? null : v; return { k, n, a, owner: z(pAddr(q[0])), impl: z(pAddr(q[1])), padmin: z(pAddr(q[2])), code: q[3] ? (q[3].length - 2) / 2 : 0, roles: {} }; });
    const padmins = [...new Set(rows.map(x => x.padmin).filter(Boolean))];
    const roleT = rows.filter(x => x.code > 0 && !/_PAIR$/.test(x.k) && !["ROUTER_ADDRESS", "FACTORY_ADDRESS"].includes(x.k));
    const fac = rows.find(x => x.k === "FACTORY_ADDRESS");
    const items2 = [...padmins.map(a => ({ to: a, data: PSEL.owner })), ...roleT.flatMap(x => PROLES.map(([, h]) => ({ to: x.a, data: PSEL.roleCount + h.slice(2) })))]; if (fac) items2.push({ to: fac.a, data: PSEL.feeToSetter });
    const r2 = await pbatch(items2), padOwner = {}; padmins.forEach((a, i) => padOwner[a] = pAddr(r2[i]));
    let p = padmins.length; const counts = [];
    for (const x of roleT) for (const [rn, h] of PROLES) { const c = pNum(r2[p++]); if (c && c > 0) counts.push([x, rn, h, Math.min(c, 4)]); }
    if (fac) fac.feeToSetter = pAddr(r2[p]);
    const r3 = await pbatch(counts.flatMap(([x, , h, c]) => Array.from({ length: c }, (_, i) => ({ to: x.a, data: PSEL.roleMember + h.slice(2) + padN(i) })))); let q = 0;
    for (const [x, rn, , c] of counts) { x.roles[rn] = []; for (let i = 0; i < c; i++) { const m = pAddr(r3[q++]); if (m) x.roles[rn].push(m); } }
    rows.forEach(x => x.upgrader = x.padmin ? padOwner[x.padmin] || null : null);
    const cset = new Set(rows.map(x => x.a.toLowerCase())), power = {};
    const add = (a, f, x) => { if (!a) return; const k = a.toLowerCase(); if (cset.has(k)) return; (power[k] ||= { upgrade: [], admin: [], guard: [], mint: [], liq: [], own: [], fee: [] })[f].push(x.n); };
    for (const x of rows) { add(x.upgrader, "upgrade", x); add(x.owner, "own", x); (x.roles.ADMIN || []).forEach(m => add(m, "admin", x)); [...(x.roles.GUARDIAN || []), ...(x.roles.PAUSER || [])].forEach(m => add(m, "guard", x)); (x.roles.MINTER || []).forEach(m => add(m, "mint", x)); (x.roles.LIQUIDITY || []).forEach(m => add(m, "liq", x)); if (x.feeToSetter) add(x.feeToSetter, "fee", x); }
    const ctls = Object.keys(power);
    const r4 = await pbatch(ctls.flatMap(a => [{ method: "eth_getCode", params: [a, "latest"] }, { method: "eth_getTransactionCount", params: [a, "latest"] }, { to: a, data: "0xe75235b8" }, { to: a, data: "0xf27a0c92" }]));
    const ctlInfo = {}; ctls.forEach((a, i) => { const z = r4.slice(i * 4, i * 4 + 4); ctlInfo[a] = { code: z[0] ? (z[0].length - 2) / 2 : 0, nonce: z[1] ? parseInt(z[1], 16) : null, threshold: pNum(z[2]), minDelay: pNum(z[3]) }; });
    Q.perms = { rows, power, ctlInfo, cset, at: Date.now() };
  } catch (e) { Q.perms = { err: String(e.message || e) }; }
  Q.permsBusy = false; if (route().p === "about") render();
}
function pageAbout() {
  const P = Q.perms, head = ph("合约权限 · 风险", "每次打开本页都重新上链读取：谁能升级合约、谁持有管理员角色、控制地址是多签还是单把私钥。", `<button class="btn gh" id="permReload">重新扫描</button>`);
  if (!P || Q.permsBusy) return head + empty("正在逐个合约读取链上权限（约 300 次读取，几秒钟）…");
  if (P.err) return head + empty("链上权限读取失败：" + esc(P.err));
  const { rows, power, ctlInfo, cset } = P;
  const who = a => { if (!a) return "—"; const r = rows.find(x => x.a.toLowerCase() === a.toLowerCase()); const lb = r ? r.n : nameOf(a); return `${addrLink(a)}${lb ? ` <span class="tag il">${esc(lb)}</span>` : ""}`; };
  const kind = a => { const i = ctlInfo[String(a).toLowerCase()]; if (!i) return "—"; if (i.code === 0) return `<span class="pill wn">普通钱包 EOA</span>`; if (fin(i.threshold) && i.threshold > 0) return `<span class="pill ok">多签 ${i.threshold} 人</span>`; if (fin(i.minDelay)) return `<span class="pill ok">时间锁</span>`; return `<span class="pill">合约</span>`; };
  const ctls = Object.keys(power).sort((a, b) => (power[b].upgrade.length + power[b].admin.length) - (power[a].upgrade.length + power[a].admin.length));
  const eoa = ctls.filter(a => ctlInfo[a] && ctlInfo[a].code === 0).length, safeN = ctls.filter(a => ctlInfo[a] && (ctlInfo[a].threshold > 0 || fin(ctlInfo[a].minDelay))).length, upg = rows.filter(x => x.impl).length;
  const topAdmin = ctls.find(a => power[a].admin.length >= 5);
  return head + `<div class="grid g4">
 ${kpi("掌握控制权的地址", fmt(ctls.length, 0), "个", `普通钱包 ${eoa} · 多签/时间锁 ${safeN}`, info("能对这些合约下命令的地址数（所有者、升级管理员、角色持有人），不含合约自身。", "owner() + EIP-1967 admin 槽 → ProxyAdmin.owner() + AccessControl 角色成员"), eoa === ctls.length ? "rd" : "")}
 ${kpi("可升级合约", `${upg} / ${rows.length}`, "", "实现槽非零 = 逻辑可随时替换", info("有多少合约的代码可以被管理员替换。可升级 = 管理员可以改写合约逻辑，包括加提款或加铸币。", "EIP-1967 implementation slot"), upg ? "or" : "")}
 ${kpi("多签 / 时间锁", fmt(safeN, 0), "个", safeN ? "" : "所有控制地址都是单把私钥", info("控制地址里有几个是多签或带时间锁。为 0 表示全部由单把私钥决定，改动可在一笔交易内生效、无等待期。", "对每个控制地址试读 getThreshold() 与 getMinDelay()"), safeN ? "gr" : "rd")}
 ${kpi("Helix 最高管理员", topAdmin ? short(topAdmin) : "—", "", topAdmin ? `持有 ${power[topAdmin].admin.length} 个合约的 DEFAULT_ADMIN_ROLE` : "", info("持有最多合约最高管理员角色的地址。该角色能授予/撤销其他角色、改参数。", "getRoleMember(DEFAULT_ADMIN_ROLE, i)"))}
</div>
${sec("控制地址一览", "数字 = 对多少个合约拥有该权力，悬停看名单")}
<div class="card p0 scroll"><table class="tbl"><thead><tr><th>控制地址</th><th>类型</th><th class="r">能升级</th><th class="r">最高管理</th><th class="r">守护/暂停</th><th>其它权力</th><th class="r">已发交易</th></tr></thead><tbody>${ctls.map(a => { const p = power[a], i = ctlInfo[a] || {}; const other = [p.mint.length ? "铸币：" + p.mint.join("、") : "", p.liq.length ? "动储备流动性：" + p.liq.join("、") : "", p.own.length ? "owner：" + p.own.join("、") : "", p.fee.length ? "设交易所手续费接收人" : ""].filter(Boolean).join(" · "); return `<tr><td>${who(a)}</td><td>${kind(a)}</td><td class="r" title="${esc(p.upgrade.join(", "))}">${p.upgrade.length || ""}</td><td class="r" title="${esc(p.admin.join(", "))}">${p.admin.length || ""}</td><td class="r" title="${esc(p.guard.join(", "))}">${p.guard.length || ""}</td><td><span class="tag il">${esc(other)}</span></td><td class="r">${fmt(i.nonce, 0)}</td></tr>`; }).join("")}</tbody></table></div>
${sec("逐合约权限")}
<details class="fold" ${window.innerWidth > 640 ? "open" : ""}><summary>展开 ${rows.length} 个合约的权限明细</summary><div class="card p0 scroll"><table class="tbl"><thead><tr><th>合约</th><th>可升级 · 谁能换逻辑</th><th>最高管理员</th><th>其它角色</th></tr></thead><tbody>${rows.map(x => { const hum = ["GUARDIAN", "PAUSER", "MINTER", "LIQUIDITY"].flatMap(rn => (x.roles[rn] || []).map(m => `${PRN[rn]} ${who(m)}`)); return `<tr><td>${esc(x.n)}<span class="tag">${exLink("address/" + x.a, short(x.a))}</span></td><td>${x.impl ? `<span class="pill wn">可升级</span> ${who(x.upgrader)}` : x.code === 0 ? `<span class="pill">普通地址</span>` : `<span class="pill ok">不可升级</span>`}</td><td>${(x.roles.ADMIN || []).length ? x.roles.ADMIN.map(who).join("<br>") : x.owner ? "owner：" + who(x.owner) : x.feeToSetter ? "feeToSetter：" + who(x.feeToSetter) : `<span class="tag il">无 owner / 无管理员</span>`}</td><td>${hum.join("<br>")}</td></tr>`; }).join("")}</tbody></table></div></details>
<p class="note">扫描于 ${bj(Math.floor(P.at / 1000))}。合约清单优先取官网 /protocol contracts 配置，缺省用本地内置地址。</p>
${sec("数据来源说明")}
<div class="card"><ul class="feed">
<li><span>官方公开接口</span><span class="mono">${API}</span></li>
<li><span>Anubis 链 RPC（自动轮换）</span><span class="mono">${RPCS.map(u => u.replace("https://", "")).join(" · ")}</span></li>
<li><span>区块浏览器 Blockscout</span><span class="mono">${EXP}</span></li>
<li><span>本地采集器（第二期）</span><span class="mono">${D.cm ? `<span class="pill ok">已连接</span> 区块 ${fmt(D.cm.block, 0)}` : '<span class="pill">未运行</span>'} ./data/*.json</span></li>
</ul><p class="note">本工具不连接钱包、不请求签名、不发起交易，只读公开数据；数字仅供参考，不构成投资建议，一切以链上记录为准。</p></div>`;
}

/* ================= 第二期：社区（本地采集器） ================= */
const CMD = "node collector.js";
function localBox(what) {
  const st = D.st;
  if (!HTTP) return `<div class="soonbox"><b>${what}需要本地采集器</b>你现在是直接双击打开的页面（file://），浏览器不允许它读取本地数据文件。<br>请在 lgns-terminal 文件夹里双击「启动采集器.command」，或在终端运行 <span class="mono">${CMD}</span>，它会自动用 <span class="mono">http://localhost:8787</span> 打开本终端。<br><br><span class="tag il">需要 Node.js 18+ · 只读公开数据 · 不需要私钥 · 不发交易</span></div>`;
  if (!st) return `<div class="soonbox"><b>没连上本地采集器</b>页面是通过网页服务器打开的，但读不到采集器状态。请确认采集器窗口还开着（${CMD}）。</div>`;
  if (st.scanning) { const p = st.scanning.done / Math.max(1, st.scanning.to - st.scanning.from + 1) * 100; return `<div class="soonbox"><b>采集器正在扫链 ${p.toFixed(1)}%</b>首次运行要从头扫描约 1,750 万个区块、近 400 万个社区地址，通常 10–20 分钟。扫完自动显示，不用刷新。<div class="bar" style="max-width:420px;margin:12px auto 0"><i style="width:${p}%"></i></div><span class="tag il">已扫到区块 ${fmt(st.block, 0)} · 已发现 ${fmt(st.members, 0)} 个地址</span></div>`; }
  return `<div class="soonbox"><b>采集器在运行，数据还在生成</b>扫链结束后要计算团队树、逐个查询锁仓地址的等级，稍等几分钟，页面会自动出现。</div>`;
}
const cmStamp = x => x && x.at ? `<span class="tag il">区块 ${fmt(x.block, 0)} · ${bj(Math.floor(x.at / 1000))} 生成</span>` : "";
const lvPill = l => l ? `<span class="pill ${l >= 4 ? "ok" : "bl"}">P${l}</span>` : `<span class="tag il">—</span>`;
const CMTABS = [["team", "团队人数"], ["dai7", "近 7 天团队入金"], ["new7", "近 7 天团队新增"], ["rec7", "近 7 天直推拉新"]];

function pageCommunity() {
  const cm = D.cm, head = ph("社区增长", "Community 合约全部推荐关系：成员总数、每日新加入、层级分布、团队榜。", cmStamp(cm));
  if (!cm) return head + localBox("社区增长");
  const dy = cm.daily || [], today = dy.find(d => d.day === cm.curDay) || {}, last7 = dy.filter(d => d.day > cm.curDay - 7), s7 = k => last7.reduce((a, d) => a + (d[k] || 0), 0);
  const tab = Q.cmTab || "team", list = tab === "dai7" ? cm.topDai7 : tab === "new7" ? cm.topNew7 : tab === "rec7" ? cm.recruiters7 : cm.topTeams;
  const dmax = Math.max(1, ...cm.depth.map(d => d.n)), rec = tab === "rec7";
  return head + `<div class="grid g4">
 ${kpi("社区总成员", fmt(cm.total, 0), "个地址", `迁移导入 ${fmt(cm.imported, 0)} · 链上新加入 ${fmt(cm.joinedNew, 0)}`, info("在 Community 合约里绑定过推荐关系的全部地址。「迁移导入」是合约上线时官方批量导入的老社区成员；「新加入」是之后自己上链绑定的。", "扫描 Community 合约全部 Joined 事件；带导入标记事件的记为迁移导入", `${EXP}/address/${C.COMMUNITY}`), "hl")}
 ${kpi("今日新加入", fmt(today.joins || 0, 0), "人", `近 7 天 ${fmt(s7("joins"), 0)} 人 · 第 ${cm.curDay} 天`, info("今天（协议日，北京时间 0 点切换）新绑定推荐关系的地址数，不含迁移导入。", "Joined 事件按区块时间归到协议日"))}
 ${kpi("今日新入金", fmt(today.dai || 0, 0), "DAI", `${fmt(today.daiUsers || 0, 0)} 人 · 近 7 天 ${cp(s7("dai"))} DAI`, info("今天全网用 DAI 参与算力的金额与人数。", "PowerLedger PowerDaiQueued 事件按协议日汇总"), "gr")}
 ${kpi("今日涡轮花费", cp(today.turbDai || 0), "DAI", `${fmt(today.turbUsers || 0, 0)} 人 · 近 7 天 ${cp(s7("turbDai"))} DAI`, info("今天全网激活涡轮花费的 DAI 与人数。", "Turbine 激活事件按协议日汇总"), "or")}
</div>
<div class="grid g4 mt">
 ${kpi("推荐树最深", fmt(cm.maxDepth, 0), "层", `根地址 ${cm.roots.length} 个`, info("从根地址往下最深有多少层。", "按 referrer 关系从根节点逐层遍历"))}
 ${kpi("今日 LGNS 销毁换算力", fmt(today.burnCnt || 0, 0), "笔", `近 7 天 ${fmt(s7("burnCnt"), 0)} 笔`, info("今天销毁 500 LGNS 换算力的笔数。", "PowerLedger PowerBurnQueued 事件"))}
 ${kpi("今日新锁仓", fmt(today.veAi || 0, 2), "AiLGNS", `近 7 天 ${fmt(s7("veAi"), 2)}（含永久治理销毁）`, info("今天新建治理锁仓与永久治理销毁的 AiLGNS 合计。", "veAiLGNS VePositionCreated + PermanentBurned 事件"))}
 ${kpi("今日新增算力", cp(today.power || 0), "Power", "DAI 参与 + LGNS 销毁", info("今天 DAI 参与与 LGNS 销毁新排队的算力合计。", "PowerDaiQueued + PowerBurnQueued 的 power 字段"))}
</div>
<div class="grid g2 mt">
 <div class="card"><h3>每日新加入人数（不含迁移导入）</h3>${barChart(dy.map(d => ({ v: d.joins, l: dayL(d.day) })), { fv: v => fmt(v, 0) + " 人", fy: v => fmt(v, 0) })}</div>
 <div class="card"><h3>每日入金 DAI</h3>${barChart(dy.map(d => ({ v: d.dai, l: dayL(d.day), alt: true, extra: d.daiUsers + " 人" })), { fv: v => fmt(v, 0) + " DAI" })}</div>
 <div class="card"><h3>每日涡轮花费 DAI</h3>${barChart(dy.map(d => ({ v: d.turbDai, l: dayL(d.day), extra: d.turbUsers + " 人" })), { fv: v => fmt(v, 0) + " DAI" })}</div>
 <div class="card"><h3>每日新锁仓 AiLGNS</h3>${barChart(dy.map(d => ({ v: d.veAi, l: dayL(d.day), alt: true })), { fv: v => fmt(v, 2) + " AiLGNS" })}</div>
</div>
${sec("团队榜", "点「业绩 →」看伞下逐层、逐线的新增")}
<div class="card"><div class="seg" id="cmSeg">${CMTABS.map(([k, n]) => `<button data-cm="${k}" class="${tab === k ? "on" : ""}">${n}</button>`).join("")}</div>
<div class="scroll maxh mt"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th>等级</th><th class="r">团队人数</th><th class="r">直推</th><th class="r">所在层</th>${rec ? `<th class="r">7 天直推新增</th>` : ""}<th class="r">今日新增</th><th class="r">7 天新增</th><th class="r">今日入金</th><th class="r">7 天入金</th><th class="r">30 天入金</th><th class="r">7 天涡轮</th><th></th></tr></thead><tbody>${(list || []).map((r, i) => `<tr><td>${i + 1}</td><td>${addrLink(r.a)}${nameOf(r.a) ? ` <span class="tag il">${esc(nameOf(r.a))}</span>` : ""}</td><td>${lvPill(r.level)}</td><td class="r">${fmt(r.team, 0)}</td><td class="r">${fmt(r.direct, 0)}</td><td class="r">${fmt(r.depth, 0)}</td>${rec ? `<td class="r"><b>${fmt(r.newDirect7, 0)}</b></td>` : ""}<td class="r">${fmt(r.new1, 0)}</td><td class="r">${fmt(r.new7, 0)}</td><td class="r">${fmt(r.dai1, 0)}</td><td class="r">${fmt(r.dai7, 0)}</td><td class="r">${fmt(r.dai30, 0)}</td><td class="r">${fmt(r.turb7, 0)}</td><td><a href="#/growth/${r.a}">业绩 →</a></td></tr>`).join("") || `<tr><td colspan="14" class="empty">暂无</td></tr>`}</tbody></table></div>
<p class="note">团队 = 伞下全部层级（不含自己）。入金 = DAI 参与算力；「新增」只算链上新加入，不含迁移导入。</p></div>
${sec("层级分布", `从根地址往下第几层有多少人 · 共 ${cm.maxDepth} 层`)}
<div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>层</th><th class="r">人数</th><th class="r">占比</th><th style="width:50%"></th></tr></thead><tbody>${cm.depth.map(d => `<tr><td>第 ${d.d} 层</td><td class="r">${fmt(d.n, 0)}</td><td class="r">${(d.n / cm.total * 100).toFixed(2)}%</td><td><div class="bar" style="margin:0"><i style="width:${d.n / dmax * 100}%"></i></div></td></tr>`).join("")}</tbody></table></div>
<p class="note">数据：本地采集器扫描 Community 合约全部 Joined 事件（${fmt(cm.total, 0)} 个地址${cm.dup ? `，忽略重复绑定 ${fmt(cm.dup, 0)} 次` : ""}）。官方接口的直推列表最多只给 20 条，无法遍历整棵树，所以必须扫链。</p>`;
}

function pageLevels() {
  const lv = D.lv, L = D.lvl, head = ph("社区等级分布", "P1–P7 各级人数与钱包地址、锁仓与三区业绩、升级还差多少。", L ? `<span class="tag il">名单 ${bj(Math.floor(L.at / 1000))} 查询</span>` : "");
  const dist = lv && lv.distribution || [], th = (lv && lv.thresholds) || (L && L.thresholds) || [], p1 = dist.filter(d => d.level > 0).reduce((s, d) => s + d.members, 0);
  const top = dist.filter(d => d.level > 0 && d.members > 0).map(d => d.level).pop(), thOf = l => th.find(t => t.level === l);
  let html = head + `<div class="grid g4">
 ${kpi("已评估地址", fmt(lv && lv.evaluated, 0), "个", lv ? `第 ${lv.day} 天结算` : "", info("官方等级系统最近一次评估覆盖的地址数。", "/level evaluated", `${API}/level`), "hl")}
 ${kpi("P1 及以上", fmt(lv ? p1 : null, 0), "人", lv && lv.evaluated ? `占已评估 ${(p1 / lv.evaluated * 100).toFixed(3)}%` : "", info("拿到任一等级的人数。", "/level distribution 中 level ≥ 1 合计"), "or")}
 ${kpi("当前最高等级", top ? "P" + top : "—", "", top ? `${fmt((dist.find(d => d.level === top) || {}).members, 0)} 人` : "", info("目前有人达到的最高等级。", "/level distribution"))}
 ${kpi("采集器找到", L ? fmt(L.rows.length, 0) : "—", "人", L ? `查了 ${fmt(L.checked, 0)} 个锁仓地址${lv ? (L.rows.length === p1 ? " · 与官方一致" : ` · 与官方差 ${Math.abs(L.rows.length - p1)}`) : ""}` : `<span class="pill">待采集器</span>`, info("采集器逐个查询所有有治理锁仓记录的地址（等级门槛要求锁仓，没锁仓不可能有等级），列出具体是谁。若与官方总数有差，多为两边评估时间不同。", "veAiLGNS 事件里出现过的地址 → /level/{地址}"))}
</div>
${sec("等级门槛与人数", "官方 /level 实时")}
<div class="card p0 scroll"><table class="tbl"><thead><tr><th>等级</th><th class="r">人数</th><th class="r">占 P1+</th><th class="r">锁仓价值 ≥</th><th class="r">区业绩 ≥</th><th>其它条件</th><th style="width:28%"></th></tr></thead><tbody>${dist.filter(d => d.level > 0).map(d => { const t = thOf(d.level) || {}; return `<tr><td>${lvPill(d.level)}</td><td class="r">${fmt(d.members, 0)}</td><td class="r">${p1 ? (d.members / p1 * 100).toFixed(1) + "%" : "—"}</td><td class="r">$${fmt(N(t.veUsd), 0)}</td><td class="r">${t.zoneUsd != null ? "$" + fmt(N(t.zoneUsd), 0) : "—"}</td><td>${t.contains != null ? `伞下含 P${t.contains}` : ""}</td><td><div class="bar" style="margin:0"><i style="width:${p1 ? d.members / p1 * 100 : 0}%"></i></div></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">${loadingTxt()}</td></tr>`}</tbody></table></div>
<p class="note">门槛为官方接口返回的原始数值。「区业绩」对应官方三区业绩（大区 / 二区 / 三区），具体怎样算达标以官方规则为准，本页只做对照。</p>
${sec("各级成员", "钱包地址、锁仓、三区业绩")}`;
  if (!L) return html + localBox("等级成员名单");
  const lvls = [...new Set(L.rows.map(r => r.level))].sort((a, b) => b - a), cur = Q.lvTab || "all", q = (Q.lvQ || "").trim().toLowerCase();
  let rows = cur === "near" ? L.near : cur === "all" ? L.rows : L.rows.filter(r => r.level === +cur);
  if (q) rows = rows.filter(r => r.a.includes(q));
  const tabs = [["all", `全部 P1+（${L.rows.length}）`], ...lvls.map(l => [String(l), `P${l}（${L.rows.filter(r => r.level === l).length}）`]), ["near", `接近 P1（${L.near.length}）`]];
  return html + `<div class="card"><div class="row"><div class="seg" id="lvSeg">${tabs.map(([k, n]) => `<button data-lv="${k}" class="${cur === k ? "on" : ""}">${n}</button>`).join("")}</div><input id="lvQ" class="ml" style="height:30px;padding:0 10px;border:1px solid var(--line);border-radius:5px;background:var(--panel);color:var(--ink);font:12px var(--mono);min-width:200px" placeholder="搜地址（部分即可）" value="${esc(Q.lvQ || "")}" autocomplete="off"><button class="btn gh sm" data-csv="levels">导出 CSV</button></div>
<div class="scroll maxh mt"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th>等级</th><th class="r">锁仓价值 $</th><th class="r">自身算力</th><th class="r">大区</th><th class="r">二区</th><th class="r">三区</th><th class="r">团队</th><th class="r">直推</th><th>升下一级</th></tr></thead><tbody>${rows.slice(0, 500).map((r, i) => {
    const t = thOf((r.level || 0) + 1), gap = t ? N(t.veUsd) - r.veUsd : null, zOk = t && t.zoneUsd != null ? r.zones.filter(z => z >= N(t.zoneUsd)).length : null;
    return `<tr><td>${i + 1}</td><td>${addrLink(r.a)}</td><td>${lvPill(r.level)}</td><td class="r">${fmt(r.veUsd, 0)}</td><td class="r">${cp(r.selfPower)}</td>${[0, 1, 2].map(k => `<td class="r">${cp(r.zones[k])}</td>`).join("")}<td class="r">${fmt(r.team, 0)}</td><td class="r">${fmt(r.directCount, 0)}</td><td>${t ? `<span class="tag il">P${t.level}：锁仓${gap > 0 ? ` <b class="dn">差 $${fmt(gap, 0)}</b>` : ` <span class="up">已够</span>`}${zOk != null ? ` · ≥$${cp(N(t.zoneUsd))} 的区 ${zOk}/3` : t.contains != null ? ` · 需伞下含 P${t.contains}` : ""}</span>` : `<span class="tag il">已最高</span>`}</td></tr>`;
  }).join("") || `<tr><td colspan="11" class="empty">没有符合的地址</td></tr>`}</tbody></table></div>
${rows.length > 500 ? `<p class="note">只显示前 500 条，导出 CSV 可拿全部。</p>` : ""}
<p class="note">「接近 P1」= 锁仓价值 ≥ $500 但还没有等级的地址（按锁仓价值排序，最多 300 个）。团队人数来自采集器推荐树；锁仓价值、自身算力、三区业绩来自官方 /level/{地址}。</p></div>`;
}

/* ================= 团队新增业绩（Worker API） ================= */
const TEAM_WIN = [["d0", "今天"], ["d1", "昨天"], ["d7", "近 7 天"]];
const TEAM_COLS = [["joins", "新加入", 0], ["dai", "入金 DAI", 2], ["power", "新增算力", -1], ["turbDai", "涡轮 DAI", 2], ["veAi", "锁仓 AiLGNS", 4], ["burnLgns", "销毁 LGNS", 0]];
const TEAM_BUCKETS = [["≥ 1 万", 10000, Infinity], ["5 千 – 1 万", 5000, 10000], ["1 千 – 5 千", 1000, 5000], ["< 1 千", -Infinity, 1000]];

function zeroM() { return { joins: 0, dai: 0, power: 0, turbDai: 0, turbAi: 0, burnCnt: 0, burnLgns: 0, veAi: 0, fundDai: 0 }; }
function teamLines(rows, w) {
  const map = new Map();
  for (const r of rows) {
    const k = r.line || "";
    let x = map.get(k);
    if (!x) map.set(k, x = { a: r.line || null, n: 0, m: zeroM() });
    x.n++;
    for (const kk in x.m) x.m[kk] += (r[w][kk] || 0);
  }
  return [...map.values()].sort((a, b) => b.m.dai - a.m.dai);
}
function teamVal(r, k, d) { return d < 0 ? cp(r[k]) : fmt(r[k], d); }
async function loadTeam(addr) {
  addr = String(addr || "").toLowerCase();
  if (!isAddr(addr)) return;
  Q.team.addr = addr; Q.team.for = ""; Q.team.data = null; Q.team.loading = true; Q.team.err = ""; Q.team.open = [false, false, false, false]; Q.team.bpage = [0, 0, 0, 0];
  Q.team.started = Date.now();
  if (route().p === "growth") render();
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(`/api/team?addr=${addr}`, { credentials: "same-origin", headers: { accept: "application/json" }, signal: ctl.signal });
    if (r.status === 401) { location.href = "/login"; return; }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    Q.team.data = j; Q.team.for = addr;
  } catch (e) {
    Q.team.err = (e && e.name === "AbortError") ? "查询超时（90 秒）。这个团队太大，建议改查它的某个直推线地址。" : /50[34]/.test(String(e && e.message)) ? "服务器计算超时（HTTP 503）。这个团队太大，建议改查它的某个直推线地址。" : String((e && e.message) || e);
  } finally { clearTimeout(to); }
  Q.team.loading = false;
  if (route().p === "growth") render();
}
function teamCsv() {
  const d = Q.team.data; if (!d || !d.rows) return;
  const w = Q.team.win, q = (Q.team.q || "").trim().toLowerCase();
  let list = q ? d.rows.filter(r => r.a.includes(q)) : d.rows.slice();
  list.sort((a, b) => { const x = a[w][Q.team.sort] || 0, y = b[w][Q.team.sort] || 0; return Q.team.dir > 0 ? x - y : y - x; });
  const H = ["分区", "直推线", "地址", ...TEAM_COLS.map(c => c[1])], out = [];
  for (const [name, lo, hi] of TEAM_BUCKETS) for (const r of list) { const v = r[w].dai || 0; if (v >= lo && v < hi) out.push([name, r.line, r.a, ...TEAM_COLS.map(([k]) => r[w][k] ?? 0)]); }
  csvDownload(`团队新增_${w}_${d.addr.slice(0, 8)}.csv`, [H, ...out]);
}
function teamLineCsv() {
  const d = Q.team.data; if (!d) return;
  const w = Q.team.win, q = (Q.team.q || "").trim().toLowerCase();
  const list = q ? (d.rows || []).filter(r => r.a.includes(q)) : (d.rows || []);
  const lines = d.lineSummary ? d.lineSummary.map(x => ({ a: x.line, n: x.n, m: x.m })) : teamLines(list, w);
  const H = ["直推线", "人数", "入金 DAI", "新加入", "新增算力", "涡轮 DAI", "锁仓 AiLGNS"];
  csvDownload(`直推线汇总_${w}_${d.addr.slice(0, 8)}.csv`, [H, ...lines.map(l => [l.a || "未知", l.n, +l.m.dai.toFixed(6), l.m.joins, +l.m.power.toFixed(6), +l.m.turbDai.toFixed(6), +l.m.veAi.toFixed(6)])]);
}

function pageGrowth(arg) {
  if (isAddr(arg) && arg.toLowerCase() !== Q.team.addr) { Q.team.addr = arg.toLowerCase(); Q.team.for = ""; Q.team.data = null; Q.team.err = ""; }
  const head = ph("团队新增业绩", "输入任意地址，看它伞下今天 / 昨天 / 近 7 天的新增，按入金分成 4 个分区。");
  const form = `<div class="card"><form class="form" id="teamForm"><input id="teamIn" placeholder="输入 0x 团队长地址" value="${esc(Q.team.addr)}" autocomplete="off" spellcheck="false"><button class="btn">查询</button></form>
<div class="row mt"><div class="seg" id="teamSeg">${TEAM_WIN.map(([k, n]) => `<button data-tw="${k}" class="${Q.team.win === k ? "on" : ""}">${n}</button>`).join("")}</div><span class="tag il ml">${Q.team.data ? `协议第 ${Q.team.data.curDay} 天 · 更新于 ${ago(Q.team.data.at || Date.now())}` : "每 30 分钟更新"}</span></div></div>`;
  if (!Q.team.addr) return head + form + `<div class="card mt"><p class="note" style="margin:0">粘贴任意地址查询。结果按所选时间段的「入金 DAI」分成 4 个分区：≥1 万、5 千–1 万、1 千–5 千、<1 千；分区默认收起，点标题展开。</p></div>`;
  if (Q.team.loading) {
    const sec = Math.max(0, Math.round((Date.now() - (Q.team.started || Date.now())) / 1000));
    if (!Q.team.tick) Q.team.tick = setTimeout(() => { Q.team.tick = null; if (Q.team.loading && route().p === "growth") render(); }, 1000);
    return head + form + `<div class="card mt"><div class="empty">正在查询伞下新增…${sec >= 3 ? `（已 ${sec} 秒，大团队可能需要 10–20 秒）` : ""}</div></div>`;
  }
  Q.team.tick = null;
  if (Q.team.err) return head + form + `<div class="verdict no">查询失败：${esc(Q.team.err)}</div>`;
  const d = Q.team.data;
  if (!d) return head + form;
  if (!d.found) return head + form + `<div class="verdict wn">${esc(d.reason || "这个地址近 7 天没有伞下记录")}</div>`;

  const w = Q.team.win, T = d.totals[w] || {};
  const kpis = `<div class="grid g4 mt">
${kpi("伞下新加入", fmt(T.joins, 0), "人", `伞下共 ${fmt(d.size, 0)} 人`, info("所选时间段内伞下新绑定推荐关系的人数（不含迁移导入）。", "Community Joined 事件"), "hl")}
${kpi("伞下入金", fmt(T.dai, 2), "DAI", `新增算力 ${cp(T.power)}`, info("所选时间段内伞下所有人用 DAI 参与算力的合计。", "PowerDaiQueued 事件"), "gr")}
${kpi("伞下涡轮", fmt(T.turbDai, 2), "DAI", `激活 ${fmt(T.turbAi, 4)} AiLGNS`, info("所选时间段内伞下激活涡轮花的 DAI。", "Turbine 激活事件"), "or")}
${kpi("伞下锁仓", fmt(T.veAi, 4), "AiLGNS", `销毁 ${fmt(T.burnLgns, 0)} LGNS · ${fmt(T.burnCnt, 0)} 笔`, info("所选时间段内伞下新建治理锁仓与永久治理销毁。", "VePositionCreated + PermanentBurned 事件"))}
</div>`;

  if (d.tooLarge) {
    const lines = (d.lineSummary || []).map(x => ({ a: x.line, n: x.n, m: x.m }));
    const lineDai = lines.reduce((s, l) => s + l.m.dai, 0);
    const lineTable = `<div class="card mt"><div class="row" style="padding:10px 14px"><b>直推线汇总</b><span class="tag il ml">${fmt(lines.length, 0)} 条线</span><span class="ml">合计 ${fmt(lineDai, 2)} DAI</span><span style="flex:1"></span><button class="btn gh sm" id="teamLineCsv">导出直推线 CSV</button></div><div class="scroll maxh"><table class="tbl"><thead><tr><th>直推线</th><th class="r">人数</th><th class="r">入金 DAI</th><th class="r">新加入</th><th class="r">新增算力</th><th class="r">涡轮 DAI</th><th class="r">锁仓 AiLGNS</th></tr></thead><tbody>${lines.map(l => `<tr><td>${addrLink(l.a)}</td><td class="r">${fmt(l.n, 0)}</td><td class="r"><b>${fmt(l.m.dai, 2)}</b></td><td class="r">${fmt(l.m.joins, 0)}</td><td class="r">${cp(l.m.power)}</td><td class="r">${fmt(l.m.turbDai, 2)}</td><td class="r">${fmt(l.m.veAi, 4)}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">这段时间没有直推线新增</td></tr>`}</tbody></table></div></div>`;
    return head + form +
      `<div class="card mt"><div class="row"><b class="mono" style="word-break:break-all">${esc(d.addr)}</b><span class="ml">伞下 ${fmt(d.size, 0)} 人</span><span class="ml">${addrLink(d.addr, "看这个地址 →")}</span></div></div>` + kpis +
      `<div class="verdict wn" style="margin-top:12px">这个团队超过 10 万人，逐地址明细会超过服务器计算上限。下面是按直推线的汇总；想看逐地址明细，请点某条直推线地址再查它。</div>` +
      lineTable;
  }

  const q = (Q.team.q || "").trim().toLowerCase();
  let list = q ? d.rows.filter(r => r.a.includes(q)) : d.rows.slice();
  const key = Q.team.sort, dir = Q.team.dir;
  list.sort((a, b) => { const x = a[w][key] || 0, y = b[w][key] || 0; return dir > 0 ? x - y : y - x; });

  const th = TEAM_COLS.map(([k, n]) => `<th class="r" data-sort="${k}" style="cursor:pointer;white-space:nowrap">${n}${Q.team.sort === k ? (Q.team.dir < 0 ? " ↓" : " ↑") : ""}</th>`).join("");
  const groups = TEAM_BUCKETS.map(([name, lo, hi]) => {
    const rows = list.filter(r => { const v = r[w].dai || 0; return v >= lo && v < hi; });
    return { name, rows, sum: rows.reduce((s, r) => s + (r[w].dai || 0), 0) };
  });
  const sections = groups.map((g, gi) => {
    const open = !!Q.team.open[gi], cnt = g.rows.length;
    const pages = Math.max(1, Math.ceil(cnt / 50));
    let page = Q.team.bpage[gi] || 0; if (page >= pages) page = pages - 1;
    const shown = g.rows.slice(page * 50, page * 50 + 50);
    const tr = shown.map((r, i) => `<tr><td>${page * 50 + i + 1}</td><td>${addrLink(r.line)}</td><td>${addrLink(r.a)}</td>${TEAM_COLS.map(([k, , dg]) => `<td class="r">${teamVal(r[w], k, dg)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="9" class="empty">${q ? "没有匹配的地址" : "这个分区没有新增"}</td></tr>`;
    const pager = cnt > 50 ? `<div class="row" style="padding:8px 12px"><button class="btn gh sm" data-bp="${gi}" data-bd="-1" ${page <= 0 ? "disabled" : ""}>上一页</button><span class="tag il" style="margin:0 8px">第 ${page + 1} / ${pages} 页</span><button class="btn gh sm" data-bp="${gi}" data-bd="1" ${page >= pages - 1 ? "disabled" : ""}>下一页</button></div>` : "";
    return `<div class="card p0 mt"><button class="teamHead" data-bk="${gi}"><span class="tag il">${open ? "▾" : "▸"}</span><b>入金 ${g.name}</b><span class="tag il ml">${fmt(cnt, 0)} 个地址</span><span class="ml">合计 ${fmt(g.sum, 2)} DAI</span><span class="ml" style="color:#8591a5;font-size:12px">${open ? "点击收起" : "点击展开"}</span></button>${open ? `<div class="scroll maxh"><table class="tbl"><thead><tr><th>#</th><th>直推线</th><th>地址</th>${th}</tr></thead><tbody>${tr}</tbody></table></div>${pager}` : ""}</div>`;
  }).join("");
  const anyOpen = Q.team.open.some(Boolean);
  const lines = teamLines(list, w);
  const lineDai = lines.reduce((s, l) => s + l.m.dai, 0);
  const lineTable = `<div class="card mt"><div class="row" style="padding:10px 14px"><b>直推线汇总</b><span class="tag il ml">${fmt(lines.length, 0)} 条线</span><span class="ml">合计 ${fmt(lineDai, 2)} DAI</span><span style="flex:1"></span><button class="btn gh sm" id="teamLineCsv">导出直推线 CSV</button></div><div class="scroll maxh"><table class="tbl"><thead><tr><th>直推线</th><th class="r">人数</th><th class="r">入金 DAI</th><th class="r">新加入</th><th class="r">新增算力</th><th class="r">涡轮 DAI</th><th class="r">锁仓 AiLGNS</th></tr></thead><tbody>${lines.map(l => `<tr><td>${addrLink(l.a)}</td><td class="r">${fmt(l.n, 0)}</td><td class="r"><b>${fmt(l.m.dai, 2)}</b></td><td class="r">${fmt(l.m.joins, 0)}</td><td class="r">${cp(l.m.power)}</td><td class="r">${fmt(l.m.turbDai, 2)}</td><td class="r">${fmt(l.m.veAi, 4)}</td></tr>`).join("") || `<tr><td colspan="7" class="empty">这段时间没有直推线新增</td></tr>`}</tbody></table></div></div>`;

  const hugeNote = d.lineUnavailable ? `<p class="note" style="color:#b7791f">这个团队超过 10 万人，本次不计算「直推线」列（避免服务器超时）；其余数据正常。想按直推线看，请查询某条直推线的地址。</p>` : "";
  return head + form +
    `<div class="card mt"><div class="row"><b class="mono" style="word-break:break-all">${esc(d.addr)}</b><span class="ml">伞下 ${fmt(d.size, 0)} 人</span><span class="ml">${addrLink(d.addr, "看这个地址 →")}</span></div></div>` + kpis +
    `<div class="card mt"><div class="row"><input id="teamQ" placeholder="按地址搜索" value="${esc(Q.team.q)}" style="max-width:300px"><span class="tag il ml">${fmt(list.length, 0)} 个地址有新增</span><span style="flex:1"></span><button class="btn gh sm" id="teamAll">${anyOpen ? "全部收起" : "全部展开"}</button><button class="btn gh sm" id="teamCsv">导出 CSV</button></div></div>` +
    hugeNote + (d.lineUnavailable ? "" : lineTable) +
    `<div class="note mt">按所选时间段的「入金 DAI」分区；点分区标题展开/收起，展开后每页 50 条。</div>` +
    sections +
    `<p class="note">「新增」按协议日统计，含入金、涡轮、锁仓、销毁与新加入；数字为采集器快照，上方显示更新时间。</p>`;
}

function pageChanges() {
  const X = D.chg, head = ph("变动追踪", "每天快照对比：等级升降、团队人数变化、持币大户增减持。", X ? `<span class="tag il">已有 ${X.snaps.length} 天快照</span>` : "");
  if (!X) return head + localBox("变动追踪");
  const k = Q.chgK || "d1", c = X[k];
  const seg = `<div class="seg" id="chgSeg">${[["d1", "较昨天"], ["d7", "较 7 天前"], ["d30", "较 30 天前"]].map(([kk, n]) => `<button data-chg="${kk}" class="${k === kk ? "on" : ""}">${n}</button>`).join("")}</div>`;
  if (!c) return head + `<div class="card">${seg}<div class="empty">还没有能对比的旧快照。采集器每天存一份快照（已有：${X.snaps.map(esc).join("、") || "无"}），明天起这里就有对比。<br>只要每天让采集器运行一次即可。</div></div>`;
  const up = c.levels.filter(x => x.to > x.from), dn = c.levels.filter(x => x.to < x.from), dt = c.totalTo - c.totalFrom;
  const hv = (x, k2) => x[k2] == null ? (k2 === "from" ? "未上榜" : "跌出榜") : fmt(x[k2], 4);
  return head + `<div class="card">${seg}<span class="tag il" style="margin-left:10px">对比 ${esc(c.date)} → ${esc(X.date)}</span></div>
<div class="grid g4 mt">
 ${kpi("社区总成员", fmt(c.totalTo, 0), "", `${dt >= 0 ? "+" : ""}${fmt(dt, 0)} 人`, info("两份快照之间社区成员数变化。", "community.json total"), "hl")}
 ${kpi("等级上升", fmt(up.length, 0), "人", "", info("等级比旧快照高的地址数（含新获得等级）。", "快照 levels 对比"), "gr")}
 ${kpi("等级下降", fmt(dn.length, 0), "人", "", info("等级比旧快照低的地址数（含失去等级）。常见原因：锁仓到期、币价下跌导致锁仓价值不足。", "快照 levels 对比"), dn.length ? "rd" : "")}
 ${kpi("大户持仓变动", fmt(c.holders.length, 0), "个", "持币前 200 名范围内", info("持币榜前 200 名（两份快照合并）里持仓有变化的地址数。", "Blockscout 持币榜快照对比"), "or")}
</div>
${sec("等级变动")}
<div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>地址</th><th>原等级</th><th>现等级</th><th>变化</th></tr></thead><tbody>${c.levels.map(x => `<tr><td>${addrLink(x.a)}</td><td>${lvPill(x.from)}</td><td>${lvPill(x.to)}</td><td class="${x.to > x.from ? "up" : "dn"}">${x.to > x.from ? "↑ 升" : "↓ 降"} ${Math.abs(x.to - x.from)} 级</td></tr>`).join("") || `<tr><td colspan="4" class="empty">没有等级变化</td></tr>`}</tbody></table></div>
${sec("团队人数增长最多", "团队人数前 2,000 名范围内")}
<div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>#</th><th>地址</th><th class="r">原团队</th><th class="r">现团队</th><th class="r">增加</th><th></th></tr></thead><tbody>${c.teamsUp.filter(x => x.d > 0).map((x, i) => `<tr><td>${i + 1}</td><td>${addrLink(x.a)}</td><td class="r">${fmt(x.from, 0)}</td><td class="r">${fmt(x.to, 0)}</td><td class="r up">+${fmt(x.d, 0)}</td><td><a href="#/growth/${x.a}">业绩 →</a></td></tr>`).join("") || `<tr><td colspan="6" class="empty">无</td></tr>`}</tbody></table></div>
${c.teamsDown.length ? sec("团队人数减少") + `<div class="card p0 scroll"><table class="tbl"><thead><tr><th>地址</th><th class="r">原团队</th><th class="r">现团队</th><th class="r">变化</th></tr></thead><tbody>${c.teamsDown.map(x => `<tr><td>${addrLink(x.a)}</td><td class="r">${fmt(x.from, 0)}</td><td class="r">${fmt(x.to, 0)}</td><td class="r dn">${fmt(x.d, 0)}</td></tr>`).join("")}</tbody></table></div>` : ""}
${sec("持币大户增减持", "AiLGNS 持币榜前 200 名")}
<div class="card p0 scroll maxh"><table class="tbl"><thead><tr><th>地址</th><th class="r">原持有</th><th class="r">现持有</th><th class="r">变化</th></tr></thead><tbody>${c.holders.map(x => `<tr><td>${addrLink(x.a)}${nameOf(x.a) ? ` <span class="tag il">${esc(nameOf(x.a))}</span>` : ""}</td><td class="r">${hv(x, "from")}</td><td class="r">${hv(x, "to")}</td><td class="r ${x.d == null ? "" : x.d >= 0 ? "up" : "dn"}">${x.d == null ? "—" : (x.d >= 0 ? "+" : "") + fmt(x.d, 4)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">无变化</td></tr>`}</tbody></table></div>
<p class="note">「未上榜 / 跌出榜」表示那一天不在前 200 名内（不代表持有为 0），这种情况不计算变化量。合约权限变化请看「合约权限 · 风险」页，每次打开都实时重扫。</p>`;
}

function csvDownload(name, rows) {
  const s = rows.map(r => r.map(v => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + s], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function exportCsv(k) {
  const H = ["新加入", "入金DAI", "新增算力", "涡轮DAI", "新锁仓AiLGNS", "LGNS销毁笔数"], V = r => [r.joins, r.dai, r.power, r.turbDai, r.veAi, r.burnCnt];
  if (k === "levels" && D.lvl) return csvDownload("等级成员.csv", [["地址", "等级", "锁仓价值$", "自身算力", "大区", "二区", "三区", "团队", "直推"], ...[...D.lvl.rows, ...D.lvl.near].map(r => [r.a, r.level, r.veUsd, r.selfPower, r.zones[0], r.zones[1], r.zones[2], r.team, r.directCount])]);
  const g = Q.g; if (!g || !g.layers) return; const tag = `${g.addr.slice(0, 8)}_第${g.from}-${g.to}天`;
  if (k === "layers") csvDownload(`按层_${tag}.csv`, [["层", "团队人数", ...H], ...g.layers.map(r => [r.deeper ? `${g.maxDepth + 1}+` : r.layer, r.members, ...V(r)])]);
  if (k === "lines") csvDownload(`按直推线_${tag}.csv`, [["直推地址", "线上人数", ...H], ...g.lines.map(r => [r.a, r.members, ...V(r)])]);
}

/* ================= 导航 & 路由 ================= */
const NAV = [
  ["行情", [["overview", "▦", "数据总览"], ["market", "↗", "行情 · 底池 · 储备"], ["holders", "◎", "持币地址"]]],
  ["产出", [["emission", "≋", "排放结算"], ["turbine", "✺", "涡轮 Turbine"], ["burn", "▲", "销毁数据"], ["elig", "◷", "500 LGNS 资格"]]],
  ["算力 · 治理", [["power", "ϟ", "算力"], ["gauge", "☑", "治理投票 Gauge"]]],
  ["社区", [["community", "☺", "社区增长", 1], ["levels", "★", "等级分布", 1], ["growth", "⤴", "团队新增业绩", 1]]],
  ["工具", [["address", "⌕", "查地址"], ["calc", "∑", "计算器"], ["changes", "↻", "变动追踪", 1], ["about", "⚿", "合约权限 · 风险"]]],
];
const PAGES = { overview: pageOverview, market: pageMarket, holders: pageHolders, emission: pageEmission, turbine: pageTurbine, burn: pageBurn, elig: pageElig, power: pagePower, gauge: pageGauge, levels: pageLevels, community: pageCommunity, growth: pageGrowth, address: pageAddress, calc: pageCalc, changes: pageChanges, about: pageAbout };
function route() { const h = location.hash.replace(/^#\/?/, "").split("/"); return { p: PAGES[h[0]] ? h[0] : "overview", arg: h[1] || "" }; }
function navHtml(p) { return NAV.map(([g, items]) => `<div class="g">${g}</div>` + items.map(([id, ic, n, s]) => `<a href="#/${id}" class="${id === p ? "on" : ""}"><i>${ic}</i>${n}${s && !D.cm ? `<span class="soon">采集器</span>` : ""}</a>`).join("")).join("") + `<div class="ft">只读公开数据 · 不连钱包<br>${D.at ? "更新于 " + ago(D.at) : "加载中"} · 60 秒自动刷新${EMB ? `<br><b>快照版</b> · 社区数据截至 ${bj(Math.floor(EMB.at / 1000), false)}` : D.cm ? `<br>本地采集器 · 区块 ${fmt(D.cm.block, 0)}` : ""}</div>`; }

function strip() {
  const ch = D.ch || {}, p = priceNow(), c = chg24(), ov = D.ov && D.ov.latest, em = D.em;
  const bad = Object.entries(D.health).filter(([, v]) => !v.ok).map(([k]) => HN[k] || k);
  const it = (k, v, cls = "") => `<div class="it"><span>${k}</span><b class="${cls}">${v}</b></div>`;
  $("#strip").innerHTML = `<div class="it"><i class="live ${bad.length ? "off" : ""}" title="${bad.length ? "不可用：" + esc(bad.join("、")) : "全部数据源正常"}"></i><b>AiLGNS/DAI</b></div>` + it("价格", fmt(p, 4)) + it("24h", pct(c), pcls(c) === "dn" ? "dn" : "up") + it("TVL", "$" + cp(ov && N(ov.tvl_usd))) + it("储备", cp(ch.reserveDai) + " DAI") + it("流通", cp(ch.circulating)) + it("销毁", cp(ch.burned)) + it("全网算力", cp(D.pw && N(D.pw.totalActivePower))) + it("风险系数", em ? (em.factor.factorBps / 100).toFixed(0) + "%" : "—") + it("500 LGNS", fin(ch.gateMax) && ch.gateMax ? (ch.gateBurned / ch.gateMax * 100).toFixed(0) + "%" : "—") + it("协议日", ch.day ? `D${ch.day} · E${ch.epoch}` : "—") + it("区块", ch.head ? "#" + ch.head.n.toLocaleString() : "—") + (bad.length ? it("异常", esc(bad.join("、")), "dn") : "");
}

function render() {
  const { p, arg } = route(), ae = document.activeElement;
  const keep = ae && ae.id && /^(INPUT|SELECT)$/.test(ae.tagName) ? { id: ae.id, v: ae.value, s: ae.selectionStart } : null;
  if (keep && /^[csd]-/.test(keep.id) && p === "calc" && $("#c-out")) return; // 计算器输入中不重绘
  $("#side").innerHTML = navHtml(p);
  INFO = []; CH = [];
  let html;
  if (!D.at && !["calc", "address"].includes(p)) html = `<div class="sk" style="height:28px;width:40%;border-radius:4px;margin:4px 0 16px"></div><div class="grid g4">${'<div class="card sk" style="height:92px"></div>'.repeat(4)}</div><div class="card sk mt" style="height:240px"></div>`;
  else { try { html = PAGES[p](arg); } catch (e) { console.error(e); html = empty("页面渲染出错：" + esc(e.message) + "（数据结构可能有变，请反馈）"); } }
  $("#page").innerHTML = html + `<div class="foot">LGNS Terminal · 本地运行 · 数据来自 awakehelix.io 官方接口、Anubis 链直读与 Blockscout · 只读，不连钱包、不签名 · 仅供参考，不构成投资建议</div>`;
  fitCharts(); bindCharts(); bindPage(p);
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.s); } catch { } } }
  tickCountdown();
  if (!D.at) return;
  if (p === "market" && !Q.klineData[Q.kline]) loadKline(Q.kline);
  if (p === "power" && !Q.rankData[Q.rank]) loadRank(Q.rank);
  if (p === "elig") loadBurners(Q.burnDay);
  if (p === "holders" && !Q.holders.length && !Q.holdersBusy) loadHolders(false);
  if (p === "about" && !Q.perms && !Q.permsBusy) loadPerms();
  if (p === "growth" && isAddr(Q.team.addr) && Q.team.for !== Q.team.addr && !Q.team.loading) loadTeam(Q.team.addr);
}
let lastTouch = 0, pending = false;
["scroll", "touchmove", "wheel", "pointerdown", "keydown"].forEach(t => window.addEventListener(t, () => lastTouch = Date.now(), { passive: true, capture: true }));
const busy = () => Date.now() - lastTouch < 2500 || (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) || !$("#modal").hidden || String(getSelection && getSelection()).length > 0;
function softRender() {
  if (D.at && busy()) { if (!pending) { pending = true; const w = () => { if (busy()) return setTimeout(w, 1500); pending = false; softRender(); }; setTimeout(w, 1500); } return; }
  const y = scrollY, sc = $$("#page .scroll").map(e => [e.scrollLeft, e.scrollTop]), op = $$("#page details").map(e => e.open);
  render();
  $$("#page .scroll").forEach((e, i) => { if (sc[i]) { e.scrollLeft = sc[i][0]; e.scrollTop = sc[i][1]; } });
  $$("#page details").forEach((e, i) => { if (op[i] != null) e.open = op[i]; });
  if (Math.abs(scrollY - y) > 2) scrollTo(0, y);
}
const INF = new Set();
async function loadKline(i) { if (INF.has("k" + i)) return; INF.add("k" + i); try { Q.klineData[i] = await api(`/kline?pair=${C.PAIR}&interval=${i}&limit=${i === "1d" ? 60 : 120}`); } catch { Q.klineData[i] = { candles: [] }; } INF.delete("k" + i); if (route().p === "market") render(); }
async function loadRank(k) { if (INF.has("r" + k)) return; INF.add("r" + k); try { Q.rankData[k] = await api(`/community/ranking?period=${k}&limit=30`); } catch { Q.rankData[k] = { rows: [] }; } INF.delete("r" + k); if (route().p === "power") render(); }

function bindPage(p) {
  $$("[data-info]").forEach(b => b.onclick = () => openInfo(+b.dataset.info));
  $$("[data-copy]").forEach(b => b.onclick = () => copyText(b.dataset.copy, b));
  $$("[data-watch]").forEach(b => b.onclick = () => toggleWatch(b.dataset.watch));
  $$("#klSeg [data-kl]").forEach(b => b.onclick = () => { Q.kline = b.dataset.kl; render(); });
  $$("#rkSeg [data-rk]").forEach(b => b.onclick = () => { Q.rank = b.dataset.rk; render(); });
  $$("#bdSeg [data-bd]").forEach(b => b.onclick = () => { Q.burnDay = +b.dataset.bd; render(); });
  const rb = $("[data-retry-burn]"); if (rb) rb.onclick = () => loadBurners(Q.burnDay, true);
  const cb = $("[data-copy-burn]"); if (cb) cb.onclick = () => { const b = Q.burners[Q.burnDay]; if (b) copyText(b.rows.map(r => r.user).join("\n"), cb); };
  const bq = $("#bdQ"); if (bq) bq.oninput = () => { Q.burnSearch = bq.value; clearTimeout(bq._t); bq._t = setTimeout(render, 250); };
  const ef = $("#eligForm"); if (ef) ef.onsubmit = e => { e.preventDefault(); checkElig($("#eligIn").value); };
  const af = $("#addrForm"); if (af) af.onsubmit = e => { e.preventDefault(); const v = $("#addrIn").value.trim(); if (isAddr(v)) { if (v === Q.addrQ) { Q.addrQ = ""; } location.hash = "#/address/" + v; render(); } else $("#addrIn").classList.add("err"); };
  const cm = $("#creditMore");
  if (cm) {
    if (window.__creditObs) window.__creditObs.disconnect();
    window.__creditObs = new IntersectionObserver(es => { if (es[0] && es[0].isIntersecting) loadMoreCredits(); }, { rootMargin: "260px" });
    window.__creditObs.observe(cm);
  }
  const am = $("[data-act-more]"); if (am && Q.addr) am.onclick = () => { am.textContent = "加载中…"; loadAddr(Q.addr.a, (Q.addr.lim || 40) + 40); };
  const hm = $("#hMore"); if (hm) hm.onclick = () => loadHolders(true);
  const pr = $("#permReload"); if (pr) pr.onclick = () => { Q.perms = null; loadPerms(); };
  // 第二期页面
  $$("#cmSeg [data-cm]").forEach(b => b.onclick = () => { Q.cmTab = b.dataset.cm; render(); });
  $$("#lvSeg [data-lv]").forEach(b => b.onclick = () => { Q.lvTab = b.dataset.lv; render(); });
  const lq = $("#lvQ"); if (lq) lq.oninput = () => { Q.lvQ = lq.value; clearTimeout(lq._t); lq._t = setTimeout(render, 250); };
  const tf = $("#teamForm"); if (tf) tf.onsubmit = e => { e.preventDefault(); const v = $("#teamIn").value.trim().toLowerCase(); if (!isAddr(v)) return $("#teamIn").classList.add("err"); if (location.hash !== "#/growth/" + v) location.hash = "#/growth/" + v; else loadTeam(v); };
  $$("#teamSeg [data-tw]").forEach(b => b.onclick = () => { Q.team.win = b.dataset.tw; Q.team.bpage = [0, 0, 0, 0]; render(); });
  $$("[data-sort]").forEach(h => h.onclick = () => { const k = h.dataset.sort; if (Q.team.sort === k) Q.team.dir *= -1; else { Q.team.sort = k; Q.team.dir = -1; } Q.team.bpage = [0, 0, 0, 0]; render(); });
  const tq = $("#teamQ"); if (tq) tq.oninput = () => { Q.team.q = tq.value; Q.team.bpage = [0, 0, 0, 0]; clearTimeout(tq._t); tq._t = setTimeout(render, 220); };
  const tc = $("#teamCsv"); if (tc) tc.onclick = teamCsv;
  const tlc = $("#teamLineCsv"); if (tlc) tlc.onclick = teamLineCsv;
  $$("[data-bk]").forEach(b => b.onclick = () => { const i = +b.dataset.bk; Q.team.open[i] = !Q.team.open[i]; render(); });
  $$("[data-bp]").forEach(b => b.onclick = () => { const i = +b.dataset.bp, d = +b.dataset.bd, p = (Q.team.bpage[i] || 0) + d; if (p >= 0) { Q.team.bpage[i] = p; render(); } });
  const ta = $("#teamAll"); if (ta) ta.onclick = () => { const open = !Q.team.open.some(Boolean); Q.team.open = Q.team.open.map(() => open); render(); };
  $$("#chgSeg [data-chg]").forEach(b => b.onclick = () => { Q.chgK = b.dataset.chg; render(); });
  $$("[data-csv]").forEach(b => b.onclick = () => exportCsv(b.dataset.csv));
  if (p === "calc") { $$("#page input,#page select").forEach(i => { i.oninput = calcRun; i.onchange = calcRun; }); calcRun(); }
}

/* ================= 初始化 ================= */
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.hasAttribute("data-close")) $("#modal").hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#modal").hidden = true; });
$("#hs").onsubmit = e => { e.preventDefault(); const v = $("#hsIn").value.trim(); if (isAddr(v)) { location.hash = "#/address/" + v; $("#hsIn").value = ""; $("#hsIn").blur(); } else { $("#hsIn").classList.add("err"); setTimeout(() => $("#hsIn").classList.remove("err"), 800); } };
$("#refreshBtn").onclick = () => { Q.burners = {}; Q.klineData = {}; Q.rankData = {}; load(); };
$("#themeBtn").onclick = () => { const dk = document.documentElement.getAttribute("data-theme") === "dark"; if (dk) document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", "dark"); try { localStorage.setItem("lt-theme", dk ? "light" : "dark"); } catch { } };
$("#menuBtn").onclick = () => $("#side").classList.toggle("open");
$("#side").addEventListener("click", e => { if (e.target.closest("a")) $("#side").classList.remove("open"); });
window.addEventListener("hashchange", () => { $("#page").classList.remove("fade"); void $("#page").offsetWidth; $("#page").classList.add("fade"); render(); scrollTo(0, 0); });
loadCache(); if (D.at) strip(); render(); load();
setInterval(() => { if (document.visibilityState === "visible") load(); }, 60000);
setInterval(() => { if (route().p === "elig" && document.visibilityState === "visible") loadBurners(0); }, 60000);
})();
