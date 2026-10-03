// Step 4: pre-generate the countryside (farmsteads, hamlet houses) and the TPF compounds.
//   public/data/towns/rural-index.json  block (32 km) -> pack id
//   public/data/towns/r###.bin          gzip JSON: block -> { farms: [[x,y,...8 per building]], tracks: [[x0,y0,x1,y1,...] polylines] }
//   public/data/towns/compounds.json    compounds of the TPF sites
import fs from 'node:fs';
import zlib from 'node:zlib';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/data/towns/', ROOT);
// made on the world shrunk TS times and written TS times larger, like the towns
const { TS, shrinkWorld } = await import('./lib/townscale.mjs');
globalThis.fetch = async () => ({ json: async () => shrinkWorld(JSON.parse(fs.readFileSync(new URL('public/data/world.json', ROOT)))) });
const { loadWorld } = await import('../src/lib/world.js');
const { ruralIn } = await import('../src/lib/rural.js');
const { compoundsIn, compoundOf } = await import('../src/lib/compounds.js');
const town = await import('../src/lib/town.js');
const w = await loadWorld();
fs.mkdirSync(OUT, { recursive: true });
const B = 32, r1 = (v) => Math.round(v * TS * 1000) / 1000; // shrunk world -> map, 1 m
const b = B / TS; // a block in the shrunk world

// what a farm building may not stand on, on the map as drawn (not shrunk): roads, rivers, lakes, the sea
const { makeClash, worldLines } = await import('./lib/clash.mjs');
globalThis.fetch = async () => ({ json: async () => JSON.parse(fs.readFileSync(new URL('public/data/world.json', ROOT))) });
const W = worldLines(await loadWorld());
const clash = makeClash(W.lines, W.areas, W.sea, 0.25);
// two convex quads overlap unless some edge separates them
function overlap(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < 4; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4], nx = y2 - y1, ny = x1 - x2;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const [x, y] of a) { const v = nx * x + ny * y; amin = Math.min(amin, v); amax = Math.max(amax, v); }
    for (const [x, y] of b) { const v = nx * x + ny * y; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
    if (amax <= bmin + 1e-4 * Math.hypot(nx, ny) || bmax <= amin + 1e-4 * Math.hypot(nx, ny)) return false;
  }
  return true;
}
let dropped = 0;

const blocks = new Map();
for (let by = 0; by < Math.ceil(w.h / b); by++) for (let bx = 0; bx < Math.ceil(w.w / b); bx++) {
  const x0 = bx * b, y0 = by * b;
  if (!w.isLoaded(x0 + 0.5, y0 + 0.5)) continue;
  const r = ruralIn(w, x0, y0, x0 + b, y0 + b);
  const farms = [], tracks = [], placed = [];
  r.farms.forEach((f, i) => {
    const cx = f[0][0][0], cy = f[0][0][1];
    if (cx < x0 || cx >= x0 + b || cy < y0 || cy >= y0 + b) return; // each farm belongs to one block
    // on the map: buildings on a road or in water, or on another of the block's buildings, left out
    const qs = f.map((q) => q.map(([x, y]) => [r1(x), r1(y)])).filter((q) => {
      if (clash(q) || placed.some((o) => overlap(q, o))) { dropped++; return false; }
      placed.push(q); return true;
    });
    if (!qs.length) return;
    farms.push(qs.flatMap((q) => q.flat()));
    const t = r.tracks[i];
    if (t && i < r.tracks.length) tracks.push(t.map(r1));
  });
  if (farms.length) blocks.set(`${bx},${by}`, { farms, tracks });
}
console.log(`farm buildings left out (on a road, in water or on another): ${dropped}`);
const morton = (x, y) => { let m = 0; for (let i = 0; i < 16; i++) m += (((x >> i) & 1) << (2 * i)) + (((y >> i) & 1) << (2 * i + 1)); return m; };
const keys = [...blocks.keys()].sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return morton(ax, ay) - morton(bx, by); });
const index = {};
let pid = 0, cur = {}, size = 0, total = 0;
const flush = () => {
  if (!Object.keys(cur).length) return;
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(cur)), { level: 9 });
  fs.writeFileSync(new URL(`r${String(pid).padStart(3, '0')}.bin`, OUT), gz);
  total += gz.length;
  for (const k of Object.keys(cur)) index[k] = pid;
  pid++; cur = {}; size = 0;
};
for (const k of keys) { cur[k] = blocks.get(k); size += JSON.stringify(cur[k]).length; if (size > 2.5e6) flush(); }
flush();
fs.writeFileSync(new URL('rural-index.json', OUT), JSON.stringify({ block: B, packs: pid, index }));
// the streets of towns near a site, so its track joins them instead of crossing them
const streetsNear = (site) => {
  const out = [], R = 2.5;
  for (const u of w.urban) {
    if (!u.place || !u.rings.some((r) => r.b[0] < site.x + R && r.b[2] > site.x - R && r.b[1] < site.y + R && r.b[3] > site.y - R)) continue;
    const T = town.townOf(u, w), CH = town.CH;
    for (let cy = Math.floor(Math.max(T.y0, site.y - R) / CH); cy <= Math.floor(Math.min(T.y1, site.y + R) / CH); cy++)
      for (let cx = Math.floor(Math.max(T.x0, site.x - R) / CH); cx <= Math.floor(Math.min(T.x1, site.x + R) / CH); cx++) {
        const C = town.chunk(T, cx, cy, w);
        for (const st of C.streets) for (let i = 2; i < st.pts.length; i += 2) out.push([st.pts[i - 2], st.pts[i - 1], st.pts[i], st.pts[i + 1]]);
        for (const m of C.mains) out.push([m.ax, m.ay, m.bx, m.by]);
      }
  }
  return out;
};
const comps = compoundsIn(w, -10, -10, w.w + 10, w.h + 10, streetsNear).map((c) => ({ yard: c.yard.map((p) => p.map(r1)), buildings: c.buildings.map((q) => q.map((p) => p.map(r1))), track: c.track ? c.track.map(r1) : null, ruin: c.ruin, x: r1(c.x), y: r1(c.y), r: c.r * TS }));
fs.writeFileSync(new URL('compounds.json', OUT), JSON.stringify(comps));
// a compound's pin is on its main building, not in the open yard
{
  const file = new URL('public/data/world.json', ROOT), raw = JSON.parse(fs.readFileSync(file));
  let n = 0;
  for (const c of compoundsIn(w, -10, -10, w.w + 10, w.h + 10)) {
    const s = raw.sites.find((q) => q.tpf && Math.abs(q.x / TS - c.x) < 1e-6 && Math.abs(q.y / TS - c.y) < 1e-6), bd = c.buildings[0];
    if (!s || !bd) continue;
    s.pin = [r1((bd[0][0] + bd[2][0]) / 2), r1((bd[0][1] + bd[2][1]) / 2)]; n++;
  }
  fs.writeFileSync(file, JSON.stringify(raw));
  console.log(`compound pins on buildings: ${n}`);
}
console.log(`rural packs ${pid}, ${(total / 1e6).toFixed(1)} MB, ${blocks.size} blocks; compounds ${comps.length}`);
