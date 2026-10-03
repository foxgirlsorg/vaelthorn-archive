// Step 3: pre-generate every town. Runs the same town and business code the app used to
// run live, for every chunk of every built-up area, and writes compact binary packs that
// the app loads on demand.
//
//   public/data/towns/index.json   block (32 km) -> pack ids, for chunks and for businesses
//   public/data/towns/c###.bin     gzip: u32 header length, header JSON, chunk records
//   public/data/towns/p###.bin     gzip: JSON of businesses for a set of blocks
//
// Chunk record (coordinates int16 in 0.1 m from the chunk corner):
//   u16 streets: u8 flags(1 main, 2 lane), u8 width(0.5 m), u16 name, u16 n, n*(i16 x, i16 y)
//   u16 areas:   u8 kind, u16 n, pts; u8 paths: u8 n, pts; u8 pond n (0 = none), pts
//   u32 buildings: i16 cx, i16 cy, u8 w(2 m), u8 d(2 m), u8 angle(pi/256), u8 kind
//
// Towns are made on the world shrunk TS times and written TS times larger (lib/townscale.mjs):
// chunks are CH * TS wide on the map.
//   u16 footpaths: 4*i16     u8 roundabouts: i16 x, i16 y, u8 r(0.5 m)
import fs from 'node:fs';
import zlib from 'node:zlib';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('public/data/towns/', ROOT);
const { TS, shrinkWorld } = await import('./lib/townscale.mjs');
globalThis.fetch = async () => ({ json: async () => shrinkWorld(JSON.parse(fs.readFileSync(new URL('public/data/world.json', ROOT)))) });
const { loadWorld } = await import('../src/lib/world.js');
const town = await import('../src/lib/town.js');
const { poisOf, chunkPois } = await import('../src/lib/pois.js');

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
const w = await loadWorld();
const CH = town.CH, BLOCK = 32;
const AREA = ['plaza', 'park', 'pitch', 'parking'];
const BUILD = ['row', 'flat', 'house', 'shed', 'industrial', 'church', 'school', 'shop'];
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

class Writer {
  constructor() { this.b = Buffer.alloc(1 << 16); this.n = 0; }
  need(k) { if (this.n + k > this.b.length) { const nb = Buffer.alloc(Math.max(this.b.length * 2, this.n + k)); this.b.copy(nb, 0, 0, this.n); this.b = nb; } }
  u8(v) { this.need(1); this.b.writeUInt8(Math.max(0, Math.min(255, Math.round(v))), this.n); this.n += 1; }
  u16(v) { this.need(2); this.b.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(v))), this.n); this.n += 2; }
  u32(v) { this.need(4); this.b.writeUInt32LE(v, this.n); this.n += 4; }
  i16(v) { this.need(2); this.b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), this.n); this.n += 2; }
  out() { return this.b.subarray(0, this.n); }
}

function encodeChunk(C, D, ox, oy, names) {
  const W = new Writer();
  // ox, oy: the chunk corner on the map; points are in the shrunk world
  const X = (x) => (x * TS - ox) * 10000, Y = (y) => (y * TS - oy) * 10000; // km -> 0.1 m
  const nameId = (s) => { if (!s) return 0; let i = names.get(s); if (i === undefined) { i = names.size + 1; names.set(s, i); } return i; };
  const streets = [];
  for (const s of C.streets) if (!D.stubs?.has(s)) streets.push({ pts: s.pts, w: s.w, name: s.name, main: false, lane: !!s.lane });
  for (const m of C.mains) if (!m.street?.river) streets.push({ pts: [m.ax, m.ay, m.bx, m.by], w: m.w, name: m.street?.name, main: true, regional: !!m.street?.regional });
  W.u16(streets.length);
  for (const s of streets) {
    W.u8((s.main ? 1 : 0) | (s.lane ? 2 : 0) | (s.regional ? 4 : 0));
    W.u8(s.w * TS * 2000);
    W.u16(s.regional ? 0 : nameId(s.name));
    const n = s.pts.length / 2;
    W.u16(n);
    for (let i = 0; i < s.pts.length; i += 2) { W.i16(X(s.pts[i])); W.i16(Y(s.pts[i + 1])); }
  }
  const pts = (p) => { W.u16(p.length); for (const [x, y] of p) { W.i16(X(x)); W.i16(Y(y)); } };
  W.u16(D.areas.length);
  for (const a of D.areas) {
    W.u8(AREA.indexOf(a.kind));
    pts(a.poly);
    const paths = a.paths || [];
    W.u8(paths.length);
    for (const p of paths) { W.u16(p.length / 2); for (let i = 0; i < p.length; i += 2) { W.i16(X(p[i])); W.i16(Y(p[i + 1])); } }
    if (a.pond) pts(a.pond); else W.u16(0);
  }
  W.u32(D.buildings.length);
  for (const b of D.buildings) {
    const r = b.r;
    const cx = (r[0][0] + r[2][0]) / 2, cy = (r[0][1] + r[2][1]) / 2;
    const wv = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), dv = Math.hypot(r[3][0] - r[0][0], r[3][1] - r[0][1]);
    let ang = Math.atan2(r[1][1] - r[0][1], r[1][0] - r[0][0]);
    if (ang < 0) ang += Math.PI; // a rectangle turned by pi is the same rectangle
    W.i16(X(cx)); W.i16(Y(cy)); W.u8(wv * TS * 500); W.u8(dv * TS * 500); W.u8((ang / Math.PI) * 256 % 256); W.u8(Math.max(0, BUILD.indexOf(b.kind)));
  }
  W.u16(D.paths.length);
  for (const [ax, ay, bx, by] of D.paths) { W.i16(X(ax)); W.i16(Y(ay)); W.i16(X(bx)); W.i16(Y(by)); }
  W.u8(D.rounds.length);
  for (const r of D.rounds) { W.i16(X(r.x)); W.i16(Y(r.y)); W.u8(r.r * TS * 2000); }
  return W.out();
}

// ---------------------------------------------------------------- generate
const towns = w.urban.filter((u) => u.place);
towns.sort((a, b) => a.place.x + a.place.y * 3000 - (b.place.x + b.place.y * 3000));
const records = []; // {key, block, morton, buf, names}
const pois = new Map(); // block -> list
let nChunks = 0, nBuild = 0, nPois = 0, done = 0;
const addPoi = (q0) => {
  const q = { ...q0, x: q0.x * TS, y: q0.y * TS };
  const k = `${Math.floor(q.x / BLOCK)},${Math.floor(q.y / BLOCK)}`;
  if (!pois.has(k)) pois.set(k, []);
  // compact: [id, type, name, x, y, chain, town, province, country, street, num, rating, reviews, phone]
  pois.get(k).push([q.id, q.type, q.name, +q.x.toFixed(4), +q.y.toFixed(4), q.chain || 0, q.town, q.province || 0, q.country, q.street, q.num, q.rating, q.reviews, q.phone]);
  nPois++;
};
// TPF sites inside cities are ordinary buildings: the pin goes on a real building near the
// site (a block of flats, an industrial building or a terrace), never on a road or a field,
// and that building takes no business
const { compoundsIn } = await import('../src/lib/compounds.js');
const rural = new Set(compoundsIn(w, -10, -10, w.w + 10, w.h + 10).map((c) => c.x + ',' + c.y));
const inRings = (rings, x, y) => {
  let ins = false;
  for (const r of rings) {
    if (x < r.b[0] || x > r.b[2] || y < r.b[1] || y > r.b[3]) continue;
    const q = r.p;
    for (let i = 0, k = q.length - 2; i < q.length; k = i, i += 2) if ((q[i + 1] > y) !== (q[k + 1] > y) && x < ((q[k] - q[i]) * (y - q[i + 1])) / (q[k + 1] - q[i + 1]) + q[i]) ins = !ins;
  }
  return ins;
};
const citySites = new Map(); // urban id -> sites
for (const s of w.sites) {
  if (!s.tpf || rural.has(s.x + ',' + s.y)) continue;
  const u = towns.find((t) => t.place.pop >= 20000 && inRings(t.rings, s.x, s.y));
  if (u) { if (!citySites.has(u.id)) citySites.set(u.id, []); citySites.get(u.id).push(s); }
}
const PIN_KIND = { flat: 1, industrial: 1.1, row: 0.8 };
function pinFor(T, s) {
  const c0x = Math.floor(s.x / CH), c0y = Math.floor(s.y / CH);
  for (const R of [1, 2, 3]) {
    let best = null, bs = 0;
    for (let cy = c0y - R; cy <= c0y + R; cy++) for (let cx = c0x - R; cx <= c0x + R; cx++) {
      for (const b of town.detail(T, cx, cy, w).buildings) {
        const k = PIN_KIND[b.kind];
        if (!k) continue;
        const r = b.r, bx = (r[0][0] + r[2][0]) / 2, by = (r[0][1] + r[2][1]) / 2;
        const area = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]) * Math.hypot(r[3][0] - r[0][0], r[3][1] - r[0][1]) * 1e6;
        const sc = (k * Math.min(area, 2500)) / (1 + Math.hypot(bx - s.x, by - s.y) / 0.25);
        if (sc > bs) { bs = sc; best = { b, x: bx, y: by }; }
      }
    }
    if (best) return best;
  }
  return null;
}
const pins = new Map(); // site id -> [x, y]
for (const u of towns) {
  const T = town.townOf(u, w);
  const here = [];
  for (const s of citySites.get(u.id) || []) {
    const p = pinFor(T, s);
    if (!p) { log(`no building for ${s.id}`); continue; }
    here.push([p.x, p.y]); pins.set(s.id, [+(p.x * TS).toFixed(4), +(p.y * TS).toFixed(4)]);
  }
  const clear = (q) => !here.some(([x, y]) => Math.hypot(q.x - x, q.y - y) < 0.03);
  const pinned = (bx, by) => here.some(([x, y]) => Math.hypot(bx - x, by - y) < 0.005);
  for (let cy = Math.floor(T.y0 / CH); cy <= Math.floor(T.y1 / CH); cy++) {
    for (let cx = Math.floor(T.x0 / CH); cx <= Math.floor(T.x1 / CH); cx++) {
      // skip slots the town's built-up area does not reach
      let any = false;
      for (let k = 0; k < 9 && !any; k++) if (T.inMask(cx * CH + CH * ((k % 3) * 0.4 + 0.1), cy * CH + CH * (Math.floor(k / 3) * 0.4 + 0.1))) any = true;
      if (!any) continue;
      const C = town.chunk(T, cx, cy, w), D = town.detail(T, cx, cy, w);
      if (!C.streets.length && !D.buildings.length && !C.mains.length) continue;
      const names = new Map();
      const buf = encodeChunk(C, D, cx * CH * TS, cy * CH * TS, names);
      const bx = Math.floor((cx * CH * TS) / BLOCK), by = Math.floor((cy * CH * TS) / BLOCK);
      records.push({ key: `${u.id}|${cx}|${cy}`, block: `${bx},${by}`, cx, cy, buf, names: [...names.keys()] });
      nChunks++; nBuild += D.buildings.length;
      for (const q of chunkPois(T, C, D, cx, cy, pinned)) if (clear(q)) addPoi(q);
    }
  }
  for (const q of poisOf(T)) if (clear(q)) addPoi(q);
  T.pois = null; // free memory
  town.forgetTown(u.id);
  if (++done % 200 === 0) log(`${done}/${towns.length} towns, ${nChunks} chunks, ${nBuild} buildings, ${nPois} businesses`);
}
log(`generated: ${nChunks} chunks, ${nBuild} buildings, ${nPois} businesses`);
// the pins go into world.json beside the sites' own positions, which stay as generated
{
  const file = new URL('public/data/world.json', ROOT), raw = JSON.parse(fs.readFileSync(file));
  for (const s of raw.sites) if (pins.has(s.id)) s.pin = pins.get(s.id);
  fs.writeFileSync(file, JSON.stringify(raw));
  log(`TPF pins on buildings: ${pins.size}`);
}

// ---------------------------------------------------------------- pack (Morton order keeps neighbours together)
const morton = (x, y) => { let m = 0; for (let i = 0; i < 16; i++) m += (((x >> i) & 1) << (2 * i)) + (((y >> i) & 1) << (2 * i + 1)); return m; };
records.sort((a, b) => morton(a.cx, a.cy) - morton(b.cx, b.cy));
// build: new each time the towns are made (their buildings and streets are numbered afresh), so
// edits.json can tell whether it was made on these (packs.js checkEdits)
const index = { v: 2, build: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, block: BLOCK, ch: CH * TS, chunks: {}, pois: {}, packs: 0, poiPacks: 0 };
const PACK = 1.6e6;
let cur = [], size = 0, pid = 0, total = 0;
const flush = () => {
  if (!cur.length) return;
  const table = {};
  let off = 0;
  for (const r of cur) { table[r.key] = [off, r.buf.length, r.names]; off += r.buf.length; }
  const head = Buffer.from(JSON.stringify(table));
  const len = Buffer.alloc(4); len.writeUInt32LE(head.length);
  const gz = zlib.gzipSync(Buffer.concat([len, head, ...cur.map((r) => r.buf)]), { level: 9 });
  fs.writeFileSync(new URL(`c${String(pid).padStart(3, '0')}.bin`, OUT), gz);
  total += gz.length;
  for (const r of cur) { const l = (index.chunks[r.block] ||= []); if (!l.includes(pid)) l.push(pid); }
  pid++; cur = []; size = 0;
};
for (const r of records) { cur.push(r); size += r.buf.length; if (size > PACK) flush(); }
flush();
index.packs = pid;
log(`chunk packs: ${pid}, ${(total / 1e6).toFixed(1)} MB`);

// businesses: blocks in Morton order, packed to ~1 MB of JSON
const blocks = [...pois.keys()].sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return morton(ax, ay) - morton(bx, by); });
let pp = 0, pcur = {}, psize = 0, ptotal = 0;
const pflush = () => {
  if (!Object.keys(pcur).length) return;
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(pcur)), { level: 9 });
  fs.writeFileSync(new URL(`p${String(pp).padStart(3, '0')}.bin`, OUT), gz);
  ptotal += gz.length;
  for (const k of Object.keys(pcur)) index.pois[k] = pp;
  pp++; pcur = {}; psize = 0;
};
for (const k of blocks) { pcur[k] = pois.get(k); psize += pcur[k].length * 110; if (psize > 1.2e6) pflush(); }
pflush();
index.poiPacks = pp;
fs.writeFileSync(new URL('index.json', OUT), JSON.stringify(index));
log(`business packs: ${pp}, ${(ptotal / 1e6).toFixed(1)} MB; index written`);
