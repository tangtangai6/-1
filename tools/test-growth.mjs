import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { queryTeam } from "../worker/team.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = path.join(root, "tmp", "growth-test");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40), C = "0x" + "c".repeat(40),
  D = "0x" + "d".repeat(40), E = "0x" + "e".repeat(40), F = "0x" + "f".repeat(40), G = "0x" + "1".repeat(40);
const day1 = 1_000_000;
const tsOf = d => day1 + (d - 1) * 86400 + 10;
const addrs = [A, B, C, D, E, F, G];
const par = [-1, 0, 0, 1, 2, -1, 3];
const ts = [1, 2, 3, 9, 10, 10, 10].map(tsOf);
const flag = [1, 1, 1, 1, 1, 1, 1];
const K = (i, d) => i * 4096 + d;
const flows = [
  [K(3, 10), 100, 10, 0, 0, 0, 0, 0, 0],   // D: dai 100, power 10
  [K(4, 9), 0, 0, 50, 5, 0, 0, 0, 0],      // E: turbDai 50, turbAi 5
  [K(1, 10), 0, 7, 0, 0, 0, 0, 0, 0],      // B: power 7
  [K(6, 10), 30, 0, 0, 0, 0, 0, 0, 0],     // G: dai 30
  [K(2, 8), 0, 0, 0, 0, 0, 0, 20, 0],      // C: veAi 20
];
fs.writeFileSync(path.join(tmp, "state.json"), JSON.stringify({ v: 1, cursor: 100, day1, addrs, par, ts, flag, flows, veSet: [] }));

execFileSync(process.execPath, [path.join(root, "tools/build-growth.js"), "--state", path.join(tmp, "state.json"), "--curday", "10", "--out", path.join(tmp, "growth")], { stdio: "inherit" });

const out = path.join(tmp, "growth");
const meta = JSON.parse(fs.readFileSync(path.join(out, "meta.json"), "utf8"));
const read = async p => {
  const b = fs.readFileSync(path.join(out, p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const show = r => ({ found: r.found, count: r.count, totals: { d0: { dai: +r.totals.d0.dai.toFixed(2), power: +r.totals.d0.power.toFixed(2) }, d1: { turbDai: +r.totals.d1.turbDai.toFixed(2) }, d7: { dai: +r.totals.d7.dai.toFixed(2), veAi: +r.totals.d7.veAi.toFixed(2) } }, rows: r.rows.map(x => x.a.slice(0, 6)) });

const ra = await queryTeam(A, read, meta);
console.log("A:", JSON.stringify(show(ra)));
const rd = await queryTeam(D, read, meta);
console.log("D:", JSON.stringify(show(rd)));
const rx = await queryTeam("0x" + "9".repeat(40), read, meta);
console.log("unknown:", JSON.stringify({ found: rx.found, reason: rx.reason }));

const byAddr = Object.fromEntries(ra.rows.map(r => [r.a, r.line]));
const lineOk = byAddr[B] === B && byAddr[C] === C && byAddr[D] === B && byAddr[G] === B && byAddr[E] === C;
console.log("lines:", JSON.stringify({ B: byAddr[B], C: byAddr[C], D: byAddr[D], G: byAddr[G], E: byAddr[E] }));
const ok = ra.found && ra.count === 5 && Math.abs(ra.totals.d0.dai - 130) < 1e-6 && Math.abs(ra.totals.d0.power - 17) < 1e-6
  && Math.abs(ra.totals.d1.turbDai - 50) < 1e-6 && Math.abs(ra.totals.d7.veAi - 20) < 1e-6
  && rd.found && rd.count === 1 && Math.abs(rd.totals.d0.dai - 30) < 1e-6 && !rx.found && lineOk;
console.log(ok ? "TEST PASS" : "TEST FAIL");
process.exit(ok ? 0 : 1);
