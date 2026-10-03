// Finds buildings that overlap (town buildings, farmsteads, compound and harbour buildings), or
// stand on a road, a street or in water, and car parks, squares and pitches in water,
// and writes them into public/data/auto-edits.json as removed; then puts every business and TPF
// pin that is not on a building left standing onto the nearest free one.
//   node overlaps.mjs [--dry]
import fs from 'node:fs';
const PUB = new URL('../public/data/', import.meta.url);
globalThis.fetch = async (url) => {
  const buf = fs.readFileSync(new URL(String(url).replace(/^\.\/data\//, ''), PUB));
  return { json: async () => JSON.parse(buf), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
};
const P = await import('../src/lib/packs.js');
P.skipEdits(); // (the map as generated)
const { loadWorld } = await import('../src/lib/world.js');
const { makeClash, worldLines } = await import('./lib/clash.mjs');
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
const keys = await P.loadAllPacks();
log(`${keys.length} chunks`);

// every building: its key for edits.json, its corners, its area
const all = [];
for (const key of keys) {
  const [town, cx, cy] = key.split('|');
  const R = P.chunkRecord(town, +cx, +cy);
  R.buildings.forEach((b, i) => all.push({ id: `${key}#${i}`, r: b.r, kind: b.kind }));
}
log(`${all.length} town buildings`);
// (farmsteads, compound and harbour buildings: only checked against town buildings round them)
await P.initExtras(); await P.initLanduse();
const area = (r) => Math.abs((r[1][0] - r[0][0]) * (r[3][1] - r[0][1]) - (r[1][1] - r[0][1]) * (r[3][0] - r[0][0]));
// two convex quads overlap unless some edge separates them (with a hair of tolerance: touching is fine)
function overlap(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < 4; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4], nx = y2 - y1, ny = x1 - x2;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const [x, y] of a) { const v = nx * x + ny * y; amin = Math.min(amin, v); amax = Math.max(amax, v); }
    for (const [x, y] of b) { const v = nx * x + ny * y; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
    const eps = 1e-4 * Math.hypot(nx, ny); // 0.1 m
    if (amax <= bmin + eps || bmax <= amin + eps) return false;
  }
  return true;
}
const G = 0.1, grid = new Map();
for (let k = 0; k < all.length; k++) {
  const r = all[k].r;
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  all[k].bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  for (let gy = Math.floor(all[k].bb[1] / G); gy <= Math.floor(all[k].bb[3] / G); gy++) for (let gx = Math.floor(all[k].bb[0] / G); gx <= Math.floor(all[k].bb[2] / G); gx++) {
    const gk = gx * 100003 + gy;
    let l = grid.get(gk); if (!l) grid.set(gk, (l = [])); l.push(k);
  }
}
const removed = new Set();
let pairs = 0;
for (const l of grid.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
  const A = all[l[i]], B = all[l[j]];
  if (removed.has(A.id) || removed.has(B.id)) continue;
  if (A.bb[2] < B.bb[0] || B.bb[2] < A.bb[0] || A.bb[3] < B.bb[1] || B.bb[3] < A.bb[1]) continue;
  if (!overlap(A.r, B.r)) continue;
  pairs++;
  removed.add(area(A.r) < area(B.r) ? A.id : B.id);
}
log(`${pairs} overlapping pairs among town buildings; ${removed.size} to remove`);
// farmsteads against town buildings
let farmHits = 0;
const near = (bb) => { const out = new Set(); for (let gy = Math.floor(bb[1] / G); gy <= Math.floor(bb[3] / G); gy++) for (let gx = Math.floor(bb[0] / G); gx <= Math.floor(bb[2] / G); gx++) for (const k of grid.get(gx * 100003 + gy) || []) out.add(k); return out; };
const ridx = JSON.parse(fs.readFileSync(new URL('towns/rural-index.json', PUB)));
for (const [blk] of Object.entries(ridx.index)) {
  const [bx, by] = blk.split(',').map(Number), B = ridx.block;
  await P.ensureRural(bx * B + 1, by * B + 1, bx * B + 2, by * B + 2);
}
for (let bi = 0; bi < 1; bi++) {
  const fr = P.ruralInBox(-1e4, -1e4, 1e4, 1e4);
  fr.farms.forEach((f, fi) => f.forEach((q, qi) => {
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    for (const k of near(bb)) if (!removed.has(all[k].id) && overlap(q, all[k].r)) { removed.add(all[k].id); farmHits++; }
  }));
}
log(`${farmHits} town buildings under farmsteads removed`);
// compound and harbour buildings against town buildings
let yardHits = 0;
const hitTown = (q) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); for (const k of near([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])) if (!removed.has(all[k].id) && overlap(q, all[k].r)) { removed.add(all[k].id); yardHits++; } };
for (const cp of P.compoundsInBox(-1e4, -1e4, 1e4, 1e4)) for (const q of cp.buildings) if (q.length === 4) hitTown(q);
for (const pt of P.portsInBox(-1e4, -1e4, 1e4, 1e4)) {
  for (const q of [...pt.piers, ...pt.sheds]) if (q.length === 4) hitTown(q);
  // the quay itself (the shore along it, then its outer edge back): piece by piece, nothing of the
  // town left half under it
  if (pt.quay) { const Q = pt.quay, n = Q.length / 2; for (let k = 0; k + 1 < n; k++) hitTown([Q[k], Q[k + 1], Q[Q.length - 2 - k], Q[Q.length - 1 - k]]); }
}
log(`${yardHits} town buildings in compounds or harbours removed`);

// buildings standing on a road, a street, a river, a lake, a pond or the sea
const world = await loadWorld('./data/world.json');
const W = worldLines(world);
const onWorld = makeClash(W.lines, W.areas, W.sea, 0.25);
// (a town square or a car park may lie along the road through town, but not in the water)
const onWater = makeClash(W.lines.filter((l) => l.kind !== 'road'), W.areas, W.sea, 0.25);
log(`world: ${W.lines.length} lines, ${W.areas.length} lakes`);
// streets and ponds: checked a chunk at a time, against the chunks round it (of every town)
const byCell = new Map();
for (const key of keys) { const [, cx, cy] = key.split('|'); const c = cx + '|' + cy; let l = byCell.get(c); if (!l) byCell.set(c, (l = [])); l.push(key); }
const onWhat = {}, areasGone = new Set();
const byKey = new Map();
for (const b of all) { const key = b.id.split('#')[0]; let l = byKey.get(key); if (!l) byKey.set(key, (l = [])); l.push(b); }
grid.clear();
let nk = 0;
for (const [key, list] of byKey) {
  if (++nk % 5000 === 0) log(`${nk} chunks checked: ${JSON.stringify(onWhat)}`);
  const [, cx, cy] = key.split('|').map(Number);
  const lines = [], areas = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const k2 of byCell.get((cx + dx) + '|' + (cy + dy)) || []) {
    const [t2, x2, y2] = k2.split('|');
    const R = P.chunkRecord(t2, +x2, +y2);
    for (const st of R.streets) lines.push({ p: st.pts, h: Math.min(0.009, (st.w / 3) * 0.8) / 2, kind: 'street' });
    for (const a of R.areas) if (a.pond) areas.push({ p: a.pond.flat(), kind: 'pond' });
  }
  const onTown = makeClash(lines, areas, null);
  for (const b of list) {
    if (removed.has(b.id)) continue;
    const k = onTown(b.r) || onWorld(b.r);
    if (k) { removed.add(b.id); onWhat[k] = (onWhat[k] || 0) + 1; }
  }
  // car parks, squares and pitches on a river, a lake or the sea (parks may have water)
  const [town, x0, y0] = key.split('|');
  for (const a of P.chunkRecord(town, +x0, +y0).areas) if (a.kind !== 'park' && onWater(a.poly)) { areasGone.add(`${key}#${a.i}`); }
}
const clash = onWorld;
log(`town buildings on roads, streets or water removed: ${JSON.stringify(onWhat)}`);
let farmOn = {};
for (const f of P.ruralInBox(-1e4, -1e4, 1e4, 1e4).farms) for (const q of f) { const k = clash(q); if (k) farmOn[k] = (farmOn[k] || 0) + 1; }
log(`farm buildings on roads or water (not removed here): ${JSON.stringify(farmOn)}`);
log(`car parks, squares and pitches on water removed: ${areasGone.size}`);
if (process.argv.includes('--dry')) process.exit(0);

// ---------------------------------------------------------------- businesses and TPF pins
// the buildings left standing, in a grid
const live = all.filter((b) => !removed.has(b.id));
const LG = 0.1, lgrid = new Map();
live.forEach((b, k) => {
  b.cx = (b.r[0][0] + b.r[2][0]) / 2; b.cy = (b.r[0][1] + b.r[2][1]) / 2;
  b.area = Math.hypot(b.r[1][0] - b.r[0][0], b.r[1][1] - b.r[0][1]) * Math.hypot(b.r[3][0] - b.r[0][0], b.r[3][1] - b.r[0][1]);
  const gk = Math.floor(b.cx / LG) * 100003 + Math.floor(b.cy / LG);
  let l = lgrid.get(gk); if (!l) lgrid.set(gk, (l = [])); l.push(k);
});
const liveNear = (x, y, r) => { const out = []; for (let gy = Math.floor((y - r) / LG); gy <= Math.floor((y + r) / LG); gy++) for (let gx = Math.floor((x - r) / LG); gx <= Math.floor((x + r) / LG); gx++) for (const k of lgrid.get(gx * 100003 + gy) || []) out.push(live[k]); return out; };
const inQuad = (q, x, y) => { let n = 0; for (let i = 0; i < 4; i++) { const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4]; n += Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); } return Math.abs(n) === 4; };
const under = (x, y) => liveNear(x, y, 0.15).find((b) => inQuad(b.r, x, y));
const used = new Map(); // building -> businesses in it
const take = (b) => used.set(b, (used.get(b) || 0) + 1);
// a building takes more than one business only if it is big (a shopping parade, a mall)
const room = (b) => Math.max(1, Math.floor(b.area / 0.0012)) - (used.get(b) || 0);
await P.ensurePois(-10, -10, 1e4, 1e4);
const pois = P.poisInBox(-1e4, -1e4, 1e4, 1e4);
const lost = [];
for (const q of pois) { const b = under(q.x, q.y); if (b) take(b); else lost.push(q); }
const autoPois = {};
const CIVIC = { church: 'church', school: 'school' };
let moved = 0, dropped = 0;
// the nearest building with room, looked for further out until there is one (so a business whose
// street lost its buildings moves up the road, instead of closing)
for (const q of lost) {
  let best = null, bd = Infinity;
  for (const R of [0.15, 0.4, 1, 2]) {
    for (const b of liveNear(q.x, q.y, R)) {
      if (room(b) <= 0 || (CIVIC[b.kind] && CIVIC[b.kind] !== q.type)) continue;
      const d = Math.hypot(b.cx - q.x, b.cy - q.y) * (b.kind === 'shop' || b.kind === 'row' ? 0.8 : 1);
      if (d < bd && d < R) { bd = d; best = b; }
    }
    if (best) break;
  }
  // (none with room: it shares the nearest building that will take it, up to 5 km off)
  if (!best) for (const R of [0.4, 1, 2, 5]) {
    for (const b of liveNear(q.x, q.y, R)) {
      if (CIVIC[b.kind] && CIVIC[b.kind] !== q.type) continue;
      const d = Math.hypot(b.cx - q.x, b.cy - q.y) + (used.get(b) || 0) * 0.05;
      if (d < bd && d < R) { bd = d; best = b; }
    }
    if (best) break;
  }
  if (best) { take(best); autoPois[q.id] = { x: +best.cx.toFixed(5), y: +best.cy.toFixed(5) }; moved++; }
  else { autoPois[q.id] = { del: true }; dropped++; }
}
log(`businesses: ${pois.length}, ${moved} moved onto a building, ${dropped} with no building within 5 km removed`);
// TPF sites in towns (those without a compound of their own): the pin on a big building near
// the site that no business is in (a block of flats, an industrial building or a terrace)
await P.initExtras();
const compound = new Set(P.compoundsInBox(-1e4, -1e4, 1e4, 1e4).map((c) => c.x + ',' + c.y)); // (a compound is at its site)
const PIN_KIND = { flat: 1, industrial: 1.1, row: 0.8, shop: 0.6 };
const autoSites = {};
let pinned = 0;
for (const s of world.sites) {
  if (!s.tpf || compound.has(s.x + ',' + s.y)) continue;
  if (s.pin && under(s.pin[0], s.pin[1]) && !used.get(under(s.pin[0], s.pin[1]))) { take(under(s.pin[0], s.pin[1])); continue; }
  let best = null, bs = 0;
  for (const b of liveNear(s.x, s.y, 0.75)) {
    const k = PIN_KIND[b.kind];
    if (!k || used.get(b)) continue;
    const sc = (k * Math.min(b.area * 1e6, 2500)) / (1 + Math.hypot(b.cx - s.x, b.cy - s.y) / 0.25);
    if (sc > bs) { bs = sc; best = b; }
  }
  if (best) { take(best); autoSites[s.id] = { pin: [+best.cx.toFixed(5), +best.cy.toFixed(5)] }; pinned++; }
  else log(`no building for the pin of ${s.id}`);
}
log(`TPF pins put on a building: ${pinned}`);

// ---------------------------------------------------------------- auto-edits.json
const tidx = JSON.parse(fs.readFileSync(new URL('towns/index.json', PUB)));
const out = { v: 1, base: { roads: JSON.parse(fs.readFileSync(new URL('world.json', PUB))).roads.length, packs: tidx.packs, build: tidx.build }, chunks: {}, pois: autoPois, sites: autoSites };
for (const id of removed) { const [key, i] = id.split('#'); ((out.chunks[key] ||= {}).b ||= {})[i] = { del: true }; }
for (const id of areasGone) { const [key, i] = id.split('#'); ((out.chunks[key] ||= {}).a ||= {})[i] = { del: true }; }
fs.writeFileSync(new URL('auto-edits.json', PUB), JSON.stringify(out));
log(`auto-edits.json: ${removed.size} buildings and ${areasGone.size} car parks, squares or pitches removed`);
