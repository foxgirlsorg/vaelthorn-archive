// Step 5: fields and ports, from the finished world (world.json is read, never written).
//   public/data/landuse/fields-index.json  block (32 km) -> pack id
//   public/data/landuse/f###.bin           gzip JSON: block -> [[kind, x0, y0, x1, y1, x2, y2, x3, y3], ...] (10 m units)
//   public/data/landuse/ports.json         harbours: piers, terminals, sheds and breakwaters out in the water
//
// The land between the towns: a jittered grid whose cells hold what the land is used for, by
// where they are: farmland (big fields on the plains, small ones in the hills, pasture and
// heath up high, vineyards on the southern slopes), small woods, marsh on the floodplains and
// lake shores, a quarry or a solar farm here and there; round towns paddocks, allotments,
// cemeteries, market gardens and golf courses; in the open ground inside a town, commons,
// allotments, cemeteries and woods, never fields. Kept off forests, lakes, rivers, the high
// mountains and the unloaded blocks. Drawn under the roads. Ports are built out into the sea in front of coastal places, so they
// never take a house of the town behind them.
import fs from 'node:fs';
import zlib from 'node:zlib';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/data/landuse/', ROOT);
globalThis.fetch = async () => ({ json: async () => JSON.parse(fs.readFileSync(new URL('public/data/world.json', ROOT))) });
const { loadWorld } = await import('../src/lib/world.js');
const { h32 } = await import('../src/lib/town.js');
const { inPoly } = await import('./lib/clash.mjs');
const w = await loadWorld();
const hm = JSON.parse(fs.readFileSync(new URL('public/data/height.json', ROOT)));
const hb = fs.readFileSync(new URL('public/data/height.bin', ROOT));
const HT = new Int16Array(hb.buffer, hb.byteOffset, hb.length / 2);
const heightAt = (x, y) => HT[Math.min(hm.h - 1, Math.max(0, Math.floor(y / hm.cell))) * hm.w + Math.min(hm.w - 1, Math.max(0, Math.floor(x / hm.cell)))];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- masks at 250 m
const R = 0.25, MW = Math.ceil(w.w / R), MH = Math.ceil(w.h / R);
const LAND = 1, NOFIELD = 2, BUILT = 4, URB = 8, WET = 16, ROADS = 32;
const mask = new Uint8Array(MW * MH);
// fill rings (flat x,y arrays) with a bit, even-odd within one call
function fillRings(rings, bit, set = true) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of rings) for (let i = 1; i < p.length; i += 2) { y0 = Math.min(y0, p[i]); y1 = Math.max(y1, p[i]); }
  for (let j = Math.max(0, Math.floor(y0 / R)); j <= Math.min(MH - 1, Math.ceil(y1 / R)); j++) {
    const yy = (j + 0.5) * R, xs = [];
    for (const p of rings) for (let i = 0, k = p.length - 2; i < p.length; k = i, i += 2) {
      const yi = p[i + 1], yk = p[k + 1];
      if ((yi > yy) !== (yk > yy)) xs.push(p[i] + ((yy - yi) * (p[k] - p[i])) / (yk - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] / R - 0.5)); i <= Math.min(MW - 1, Math.floor(xs[k + 1] / R - 0.5)); i++) {
      if (set) mask[j * MW + i] |= bit; else mask[j * MW + i] ^= bit;
    }
  }
}
// a line with a half width (km), marked with a bit
function strokeLine(p, hw, bit) {
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (R * 0.5)) + 1, rr = Math.ceil(hw / R);
    for (let s = 0; s <= n; s++) {
      const cx = Math.floor((ax + ((bx - ax) * s) / n) / R), cy = Math.floor((ay + ((by - ay) * s) / n) / R);
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < MW && y < MH && Math.hypot(dx, dy) * R <= hw + R * 0.5) mask[y * MW + x] |= bit;
      }
    }
  }
}
// land: the coast rings are even-odd, as the map draws them
{
  const rings = w.land.map((f) => f.p);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of rings) for (let i = 1; i < p.length; i += 2) { y0 = Math.min(y0, p[i]); y1 = Math.max(y1, p[i]); }
  for (let j = Math.max(0, Math.floor(y0 / R)); j <= Math.min(MH - 1, Math.ceil(y1 / R)); j++) {
    const yy = (j + 0.5) * R, xs = [];
    for (const p of rings) for (let i = 0, k = p.length - 2; i < p.length; k = i, i += 2) {
      const yi = p[i + 1], yk = p[k + 1];
      if ((yi > yy) !== (yk > yy)) xs.push(p[i] + ((yy - yi) * (p[k] - p[i])) / (yk - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] / R - 0.5)); i <= Math.min(MW - 1, Math.floor(xs[k + 1] / R - 0.5)); i++) mask[j * MW + i] |= LAND;
  }
}
const isLand = (x, y) => { const i = Math.floor(x / R), j = Math.floor(y / R); return i >= 0 && j >= 0 && i < MW && j < MH && (mask[j * MW + i] & LAND) !== 0; };
// no fields: lakes, forests, glaciers, towns (and a margin round them), rivers
for (const f of w.lakes) fillRings([f.p], NOFIELD);
for (const f of w.forests) fillRings([f.p], NOFIELD);
for (const f of w.glaciers) fillRings([f.p], NOFIELD);
// towns: what is built (even-odd, as drawn, and a margin), and the whole of each outline with
// the open ground it holds
for (const u of w.urban) { fillRings(u.rings.map((r) => r.p), BUILT); for (const r of u.rings) { strokeLine(r.p, 0.15, BUILT); fillRings([r.p], URB); } }
for (const r of w.rivers) if (r.a1 >= 300) strokeLine(r.p, Math.min(0.3, 0.00028 * Math.sqrt(r.a1)) + 0.05, NOFIELD);
// floodplains and lake shores (for marsh), and the land along the roads (for quarries and solar farms)
for (const r of w.rivers) if (r.a1 >= 2000) strokeLine(r.p, 0.35 + Math.min(0.6, r.a1 / 60000), WET);
for (const f of w.lakes) strokeLine(f.p, 0.45, WET);
for (const r of w.roads) if (r.c >= 1) strokeLine(r.p, 0.3, ROADS);
// how far (in 250 m cells, up to 12) every cell is from a town and from a forest
function distFrom(test, max) {
  const d = new Uint8Array(MW * MH).fill(255), q = new Int32Array(MW * MH);
  let h = 0, t = 0;
  for (let k = 0; k < d.length; k++) if (test(k)) { d[k] = 0; q[t++] = k; }
  while (h < t) {
    const k = q[h++], dk = d[k];
    if (dk >= max) continue;
    const x = k % MW;
    for (const n of [x > 0 ? k - 1 : -1, x < MW - 1 ? k + 1 : -1, k - MW, k + MW]) if (n >= 0 && n < d.length && d[n] === 255) { d[n] = dk + 1; q[t++] = n; }
  }
  return d;
}
const forestMask = new Uint8Array(MW * MH);
{ const save = mask.slice(); mask.fill(0); for (const f of w.forests) fillRings([f.p], 1); forestMask.set(mask); mask.set(save); }
const distTown = distFrom((k) => mask[k] & BUILT, 12), distForest = distFrom((k) => forestMask[k], 6);
// the gaps a town closes round (up to 3 km across, between its districts): grow the built-up area
// 1.5 km and shrink it back; what that fills in is the town's open ground, not farmland
const awayFromTown = distFrom((k) => distTown[k] > 6, 7);
const enclosed = (k) => awayFromTown[k] > 6;
const cellOf = (x, y) => { const i = Math.floor(x / R), j = Math.floor(y / R); return i < 0 || j < 0 || i >= MW || j >= MH ? -1 : j * MW + i; };
{
  let land = 0, open = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k] & LAND) { land++; if (!(mask[k] & NOFIELD)) open++; }
  log(`masks: land ${Math.round(land * R * R)} km², open land ${Math.round(open * R * R)} km²`);
}

// ---------------------------------------------------------------- fields
// a jittered grid of 1.2 km cells, each cut into one to three strips; a few kinds by region
const G = 1.2, GX = Math.ceil(w.w / G) + 1, GY = Math.ceil(w.h / G) + 1;
const vert = (i, j) => [i * G + (h32(i, j, 1) - 0.5) * G * 0.45, j * G + (h32(i, j, 2) - 0.5) * G * 0.45];
// open land: not water, forest, glacier or the top of a mountain; in town, the open ground only
const openLand = (x, y) => {
  const k = cellOf(x, y);
  if (k < 0) return false;
  const m = mask[k];
  return (m & LAND) !== 0 && (m & (NOFIELD | BUILT)) === 0 && w.isLoaded(x, y) && heightAt(x, y) < 1500;
};
const slopeAt = (x, y) => Math.max(Math.abs(heightAt(x + 1, y) - heightAt(x - 1, y)), Math.abs(heightAt(x, y + 1) - heightAt(x, y - 1))) / 2; // m per km
// golf courses: one or two on the edge of each bigger city, on gentle ground
const golf = new Set();
for (const p of w.places) {
  if (p.c !== 'est' || p.pop < 120000) continue;
  const want = p.pop > 500000 ? 2 : 1, cand = [];
  for (let j = Math.floor((p.y - 14) / G); j <= Math.floor((p.y + 14) / G); j++) for (let i = Math.floor((p.x - 14) / G); i <= Math.floor((p.x + 14) / G); i++) {
    const cx = (i + 0.5) * G, cy = (j + 0.5) * G, k = cellOf(cx, cy);
    if (k < 0 || !openLand(cx, cy) || (mask[k] & URB) || distTown[k] < 2 || distTown[k] > 7 || slopeAt(cx, cy) > 40) continue;
    cand.push([h32(i, j, 77), i, j]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, i, j] of cand.slice(0, want)) golf.add(i + ',' + j);
}
// kinds (render.js draws each): 0 arable, 1 pasture, 2 orchard, 3 fallow, 4 vineyard, 5 wood, 6 marsh,
// 7 heath, 8 common, 9 allotments, 10 cemetery, 11 golf course, 12 quarry, 13 market garden, 14 solar farm
const ARABLE = 0, PASTURE = 1, ORCHARD = 2, FALLOW = 3, VINEYARD = 4, WOOD = 5, MARSH = 6, HEATH = 7, COMMON = 8, ALLOT = 9, CEMETERY = 10, GOLF = 11, QUARRY = 12, NURSERY = 13, SOLAR = 14;
const counts = new Array(15).fill(0);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const blocks = new Map(); // "bx,by" -> fields
const B = 32;
let nFields = 0;
const put = (kind, q) => {
  const mx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, my = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  const key = `${Math.floor(mx / B)},${Math.floor(my / B)}`;
  if (!blocks.has(key)) blocks.set(key, []);
  blocks.get(key).push([kind, ...q.flatMap(([x, y]) => [Math.round(x * 100), Math.round(y * 100)])]);
  nFields++; counts[kind]++;
};
// inset a little: the hedges and tracks between fields show as thin gaps
const inset = (q, f = 0.94) => { const mx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, my = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4; return q.map(([x, y]) => [mx + (x - mx) * f, my + (y - my) * f]); };
const fits = (q) => { const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2; return q.filter(([x, y]) => openLand(x, y)).length >= 3 && openLand(mx, my); };
// a cell cut into pieces: strips one way, or (small fields) a grid of n x m
function pieces(a, b, c, d, n, m, across) {
  const out = [];
  for (let u = 0; u < n; u++) for (let v = 0; v < m; v++) {
    const P = (s, t) => lerp(lerp(a, b, s), lerp(d, c, s), t); // s along a-b, t along a-d
    const [s0, s1, t0, t1] = across ? [u / n, (u + 1) / n, v / m, (v + 1) / m] : [v / m, (v + 1) / m, u / n, (u + 1) / n];
    out.push([P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)]);
  }
  return out;
}
// a small plot (allotments, a cemetery, glasshouses: 150 to 300 m) in one corner of a cell, the
// rest of the cell as `rest` (or left as it is)
function plot(i, j, a, b, c, d, kind, rest, across) {
  const qs = pieces(a, b, c, d, 2, 2, across), pick = Math.floor(h32(i, j, 9) * 4);
  qs.forEach((q, p) => {
    if (p !== pick && rest === null) return;
    const qi = inset(q, p === pick ? 0.35 + 0.2 * h32(i, j, 15) : 0.94);
    if (fits(qi)) put(p === pick ? kind : rest, qi);
  });
}
for (let j = 0; j < GY - 1; j++) for (let i = 0; i < GX - 1; i++) {
  const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), d = vert(i, j + 1);
  const cx = (a[0] + c[0]) / 2, cy = (a[1] + c[1]) / 2, k = cellOf(cx, cy);
  if (k < 0 || !openLand(cx, cy)) continue;
  const m = mask[k], elev = heightAt(cx, cy), slope = slopeAt(cx, cy), r0 = h32(i, j, 5), across = h32(i, j, 4) < 0.5;
  const dt = distTown[k], df = distForest[k];
  // inside a town's outline: its open ground
  if ((m & URB) || enclosed(k)) {
    if (r0 < 0.2) plot(i, j, a, b, c, d, ALLOT, COMMON, across);
    else if (r0 < 0.3) plot(i, j, a, b, c, d, CEMETERY, COMMON, across);
    else { const qi = inset([a, b, c, d], 0.92); if (fits(qi)) put(r0 < 0.45 ? WOOD : COMMON, qi); }
    continue;
  }
  if (golf.has(i + ',' + j)) { const qi = inset([a, b, c, d], 0.92); if (fits(qi)) put(GOLF, qi); continue; }
  // the edge of a town: small paddocks, and its allotments, cemetery and market gardens
  if (dt <= 4) {
    if (r0 < 0.1) { plot(i, j, a, b, c, d, ALLOT, PASTURE, across); continue; }
    if (r0 < 0.15) { plot(i, j, a, b, c, d, CEMETERY, PASTURE, across); continue; }
    if (r0 > 0.92 && elev < 500) { plot(i, j, a, b, c, d, NURSERY, ARABLE, across); continue; }
  }
  // marsh on a floodplain or a lake shore, where it is low and flat
  if ((m & WET) && slope < 25 && elev < 450 && r0 < 0.55) {
    for (const q of pieces(a, b, c, d, 1 + (h32(i, j, 6) < 0.5), 1, across)) { const qi = inset(q, 0.97); if (fits(qi)) put(h32(i, j, 7) < 0.75 ? MARSH : PASTURE, qi); }
    continue;
  }
  // a small wood between the fields (more of them by the forests)
  if (h32(i, j, 8) < (df <= 3 ? 0.16 : 0.06)) {
    const qs = pieces(a, b, c, d, 2, 1, across), w0 = Math.floor(h32(i, j, 11) * 2);
    for (let p = 0; p < 2; p++) { const qi = inset(qs[p], 0.95); if (fits(qi)) put(p === w0 ? WOOD : PASTURE, qi); }
    continue;
  }
  // a quarry in the hills by a road; a solar farm on flat land by a road in the sunny south
  if ((m & ROADS) && elev > 200 && slope > 20 && h32(i, j, 12) < 0.03) { plot(i, j, a, b, c, d, QUARRY, HEATH, across); continue; }
  if ((m & ROADS) && cy > 700 && slope < 15 && dt > 2 && h32(i, j, 13) < 0.01) { plot(i, j, a, b, c, d, SOLAR, ARABLE, across); continue; }
  // farmland: big fields on the plains, small ones in the hills and by the towns; some ground left open
  if (h32(i, j, 14) < 0.05) continue;
  const flat = slope < 12 && elev < 350, hills = slope > 35 || elev > 550;
  const [n, mm] = dt <= 4 ? [2 + Math.floor(h32(i, j, 3) * 2), 2] : flat ? [1 + Math.floor(h32(i, j, 3) * 2), 1] : hills ? [2 + Math.floor(h32(i, j, 3) * 2), 2] : [1 + Math.floor(h32(i, j, 3) * 3), 1];
  const south = cy > 820, high = elev > 650;
  // the slope faces south when the land falls away southwards (y grows to the south)
  const southFacing = heightAt(cx, cy + 1) < heightAt(cx, cy - 1) - 15;
  let t = 0;
  for (const q of pieces(a, b, c, d, n, mm, across)) {
    const qi = inset(q);
    if (!fits(qi)) { t++; continue; }
    const r = h32(i, j, 10 + t++);
    const kind = high ? (r < 0.45 ? PASTURE : r < 0.85 ? HEATH : FALLOW)
      : south && southFacing && slope > 15 ? (r < 0.6 ? VINEYARD : r < 0.8 ? ORCHARD : ARABLE)
      : south ? (r < 0.5 ? ARABLE : r < 0.65 ? ORCHARD : r < 0.75 ? VINEYARD : r < 0.92 ? PASTURE : FALLOW)
      : hills ? (r < 0.3 ? ARABLE : r < 0.85 ? PASTURE : r < 0.92 ? HEATH : FALLOW)
      : r < 0.62 ? ARABLE : r < 0.9 ? PASTURE : r < 0.95 ? ORCHARD : FALLOW;
    put(kind, qi);
  }
}
log(`land use: ${['arable', 'pasture', 'orchard', 'fallow', 'vineyard', 'wood', 'marsh', 'heath', 'common', 'allotments', 'cemetery', 'golf', 'quarry', 'market garden', 'solar'].map((n, q) => `${n} ${counts[q]}`).join(', ')}`);
log(`fields: ${nFields} in ${blocks.size} blocks`);
{
  const morton = (x, y) => { let m = 0; for (let i = 0; i < 16; i++) m += (((x >> i) & 1) << (2 * i)) + (((y >> i) & 1) << (2 * i + 1)); return m; };
  const keys = [...blocks.keys()].sort((p, q) => { const [ax, ay] = p.split(',').map(Number), [bx, by] = q.split(',').map(Number); return morton(ax, ay) - morton(bx, by); });
  const index = {};
  let pid = 0, cur = {}, size = 0, total = 0;
  const flush = () => {
    if (!Object.keys(cur).length) return;
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(cur)), { level: 9 });
    fs.writeFileSync(new URL(`f${String(pid).padStart(3, '0')}.bin`, OUT), gz);
    total += gz.length;
    for (const k of Object.keys(cur)) index[k] = pid;
    pid++; cur = {}; size = 0;
  };
  for (const k of keys) { cur[k] = blocks.get(k); size += cur[k].length * 60; if (size > 4e6) flush(); }
  flush();
  fs.writeFileSync(new URL('fields-index.json', OUT), JSON.stringify({ block: B, q: 100, packs: pid, index }));
  log(`field packs: ${pid}, ${(total / 1e6).toFixed(1)} MB`);
}

// ---------------------------------------------------------------- ports
// In front of a coastal place, where its harbour fits: a quay built out along the shore (it
// follows the coastline), berths off its edge with cranes, warehouses and container stacks on
// it; a fishing village gets a jetty. All of it out on the water, never over the town's houses.
const sea = (x, y) => w.isLoaded(x, y) && !isLand(x, y);
// samples of the coastline near a place, nearest first, each with its place on its ring
function coastNear(p, max) {
  const out = [];
  for (const f of w.landIndex.query(p.x - max, p.y - max, p.x + max, p.y + max)) {
    const q = f.p;
    for (let i = 2; i < q.length; i += 2) {
      const ax = q[i - 2], ay = q[i - 1], bx = q[i], by = q[i + 1];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-6) continue;
      for (let t = 0; t < l; t += 0.15) {
        const x = ax + ((bx - ax) * t) / l, y = ay + ((by - ay) * t) / l, d = Math.hypot(x - p.x, y - p.y);
        if (d <= max) out.push({ x, y, d, q, i, t: t / l });
      }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}
// the shore either side of a sample, every 50 m, len long, with seaward normals smoothed over
// 200 m; null where the shore turns too hard or the sea in front is too narrow
function shoreStretch(c, len) {
  const q = c.q, n = q.length / 2;
  const P = (k) => { const m = ((k % n) + n) % n; return [q[2 * m], q[2 * m + 1]]; };
  const walk = (dir) => {
    const pts = [];
    let [x, y] = [c.x, c.y], k = dir > 0 ? c.i / 2 : c.i / 2 - 1, left = len / 2, step = 0.05, acc = 0, guard = 0;
    while (left > 0 && guard++ < 20000) {
      const [nx, ny] = P(k);
      const l = Math.hypot(nx - x, ny - y);
      if (acc + l >= step) { const t = (step - acc) / l; x += (nx - x) * t; y += (ny - y) * t; pts.push([x, y]); left -= step; acc = 0; continue; }
      acc += l; x = nx; y = ny; k += dir;
    }
    return pts;
  };
  const pts = [...walk(-1).reverse(), [c.x, c.y], ...walk(1)];
  const out = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 4)], b = pts[Math.min(pts.length - 1, k + 4)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
    let nx = -ty, ny = tx;
    const [x, y] = pts[k];
    if (!sea(x + nx * 0.25, y + ny * 0.25)) { nx = -nx; ny = -ny; }
    if (!sea(x + nx * 0.25, y + ny * 0.25)) return null;
    if (out.length && nx * out[out.length - 1].nx + ny * out[out.length - 1].ny < 0.6) return null; // a sharp turn
    out.push({ x, y, tx: -ny, ty: nx, nx, ny });
  }
  return out;
}
const rectQ = (x, y, ux, uy, len, wid) => { const px = -uy * wid / 2, py = ux * wid / 2; return [[x - ux * len / 2 + px, y - uy * len / 2 + py], [x + ux * len / 2 + px, y + uy * len / 2 + py], [x + ux * len / 2 - px, y + uy * len / 2 - py], [x - ux * len / 2 - px, y - uy * len / 2 - py]]; };
const allSea = (pts) => pts.every(([x, y]) => sea(x, y));
// open water in front of a quay: the sea goes on well past its edge (not the head of an inlet or
// a river's mouth, where a quay would fill the water and run into the town on the far shore)
const openWater = (st, dep) => st.filter((v) => sea(v.x + v.nx * (dep + 0.4), v.y + v.ny * (dep + 0.4)) && sea(v.x + v.nx * (dep + 1), v.y + v.ny * (dep + 1))).length >= st.length * 0.9;
// no road across it (a road over the water is a bridge or a causeway: the harbour goes elsewhere)
function roadAcross(quay) {
  const ring = quay.flat(), xs = quay.map((p) => p[0]), ys = quay.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  for (const r of w.roadsIndex.query(x0, y0, x1, y1)) {
    const q = r.p;
    for (let i = 2; i < q.length; i += 2) {
      const ax = q[i - 2], ay = q[i - 1], bx = q[i], by = q[i + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.02);
      for (let k = 0; k <= n; k++) { const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n; if (x > x0 && x < x1 && y > y0 && y < y1 && inPoly(x, y, ring)) return true; }
    }
  }
  return false;
}
const r4 = (q) => q.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);
// A river may run out across a quay (it is drawn over it, so the quay lies either side of it): no
// shed, container stack, crane or pier stands in its channel (as wide as the map draws it) or
// within pad km of its banks
function inRiver(pts, pad = 0.015) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), m = 0.35;
  for (const r of w.riversIndex.query(Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m)) {
    const half = Math.min(0.32, 0.00028 * Math.sqrt((r.a0 + r.a1 * 2) / 3)) / 2 + pad, q = r.p;
    for (const [x, y] of pts) for (let i = 2; i < q.length; i += 2) {
      const ax = q[i - 2], ay = q[i - 1], bx = q[i], by = q[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      if (Math.hypot(ax + dx * t - x, ay + dy * t - y) < half) return true;
    }
  }
  return false;
}
const withMid = (q) => [...q, [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2]];
const SPEC = { 3: { len: 2.4, dep: 0.34, berth: 0.26, pier: 0.18 }, 2: { len: 0.6, dep: 0.1, berth: 0.18, pier: 0.1 } };
const ports = [];
for (const p of w.places) {
  if ((p.k !== 'village' && p.k !== 'town' && p.k !== 'city') || p.pop < 400 || !w.isLoaded(p.x, p.y)) continue;
  const size = p.k === 'city' ? 3 : p.k === 'town' ? 2 : 1;
  for (const c of coastNear(p, size === 3 ? 8 : size === 2 ? 4 : 2.5).slice(0, 80)) {
    const port = { name: `Port of ${p.n}`, town: p.n, size, x: +c.x.toFixed(3), y: +c.y.toFixed(3), quay: null, piers: [], sheds: [], containers: [], cranes: [] };
    if (size === 1) {
      // a fishing village's jetty
      const st = shoreStretch(c, 0.1);
      if (!st) continue;
      // a landing along the shore (half on the land), the jetty out from it with a T at its end,
      // and a boat shed on the landing
      const m = st[Math.floor(st.length / 2)], L = 0.1 + 0.06 * h32(Math.round(p.x * 100), Math.round(p.y * 100), 5);
      const q = rectQ(m.x + m.nx * (L / 2 - 0.01), m.y + m.ny * (L / 2 - 0.01), m.nx, m.ny, L, 0.012);
      if (!allSea([q[1], q[2]]) || inRiver(withMid(q))) continue;
      const land = rectQ(m.x + m.nx * 0.002, m.y + m.ny * 0.002, m.tx, m.ty, 0.06, 0.022);
      const head = rectQ(m.x + m.nx * (L - 0.016), m.y + m.ny * (L - 0.016), m.tx, m.ty, 0.04, 0.01);
      if (!allSea([head[0], head[1], head[2], head[3]]) || roadAcross(land)) continue;
      port.quay = r4(land);
      port.piers.push(r4(q), r4(head));
      port.sheds.push(r4(rectQ(m.x - m.nx * 0.003 + m.tx * 0.017, m.y - m.ny * 0.003 + m.ty * 0.017, m.tx, m.ty, 0.018, 0.012)));
      ports.push(port);
      break;
    }
    const S = SPEC[size], st = shoreStretch(c, S.len);
    if (!st) continue;
    const inner = st.map((v) => [v.x - v.nx * 0.015, v.y - v.ny * 0.015]), outer = st.map((v) => [v.x + v.nx * S.dep, v.y + v.ny * S.dep]);
    if (!allSea(outer) || !allSea(st.map((v) => [v.x + v.nx * S.dep * 0.5, v.y + v.ny * S.dep * 0.5]))) continue;
    if (!openWater(st, S.dep)) continue;
    const quay = [...inner, ...[...outer].reverse()];
    if (roadAcross(quay)) continue;
    port.quay = r4(quay);
    // berths: piers off the quay's edge, a crane at the root of each
    const every = Math.round(S.berth / 0.05);
    for (let k = Math.floor(every / 2); k < st.length - 2; k += every) {
      const v = st[k], o = outer[k], q = rectQ(o[0] + v.nx * S.pier / 2, o[1] + v.ny * S.pier / 2, v.nx, v.ny, S.pier, size === 3 ? 0.035 : 0.022);
      if (!allSea([q[1], q[2]]) || inRiver(withMid(q))) continue;
      port.piers.push(r4(q));
      port.cranes.push([+(o[0] - v.nx * 0.02).toFixed(4), +(o[1] - v.ny * 0.02).toFixed(4)]); // (with its pier: out of the river too)
    }
    // warehouses behind the edge, and (a city's terminal) container stacks between them and the shore
    for (let k = 2; k < st.length - 2; k += size === 3 ? 4 : 3) {
      const v = st[k];
      if (h32(Math.round(v.x * 1000), Math.round(v.y * 1000), 9) < 0.25) continue;
      const q = rectQ(v.x + v.nx * S.dep * 0.62, v.y + v.ny * S.dep * 0.62, v.tx, v.ty, 0.15, S.dep * 0.32);
      if (!inRiver(withMid(q))) port.sheds.push(r4(q));
    }
    // (a stack: two 12 m boxes end to end, four wide, 24 x 10 m; two to every 50 m of the quay, in rows)
    if (size === 3) for (let k = 1; k < st.length - 1; k++) for (const f of [0.12, 0.17, 0.22, 0.27]) for (const a of [-0.0125, 0.0125]) {
      const v = st[k], x = v.x + v.nx * S.dep * f + v.tx * a, y = v.y + v.ny * S.dep * f + v.ty * a;
      if (h32(Math.round(x * 1000), Math.round(y * 1000), 11) < 0.2) continue;
      const q = rectQ(x, y, v.tx, v.ty, 0.022, 0.01);
      if (!inRiver(withMid(q), 0.01)) port.containers.push([r4(q), Math.floor(h32(Math.round(x * 1000), Math.round(y * 1000), 12) * 5)]);
    }
    ports.push(port);
    break;
  }
}
fs.writeFileSync(new URL('ports.json', OUT), JSON.stringify(ports));
log(`ports: ${ports.length} (${ports.filter((q) => q.size === 3).length} city terminals, ${ports.filter((q) => q.size === 2).length} town harbours, ${ports.filter((q) => q.size === 1).length} jetties)`);
