// Loads the pre-generated towns and businesses (public/data/towns, made by gen/towns.mjs)
// on demand: a tile asks for its area, the packs covering it are fetched once, and
// chunk records are decoded when first drawn.
const BASE = './data/towns/';
// file extension of the binary data; a host that does not serve .bin can use another (VITE_BIN_EXT)
export const BIN = import.meta.env?.VITE_BIN_EXT || 'bin';
const AREA = ['plaza', 'park', 'pitch', 'parking'];
const BUILD = ['row', 'flat', 'house', 'shed', 'industrial', 'church', 'school', 'shop'];

let INDEX = null;
const PACKS = new Map(); // id -> Promise
const LOC = new Map(); // chunk key -> {dv, off, len, names}
const DEC = new Map(); // chunk key -> decoded record (LRU)
const POIP = new Map(); // poi pack id -> Promise
const POIS = new Map(); // block key -> [poi]

export async function initPacks() {
  if (!INDEX) INDEX = await fetch(BASE + 'index.json').then((r) => r.json());
  return INDEX;
}
export const packsReady = () => !!INDEX;
export const CH = () => INDEX.ch;

async function gunzip(buf) {
  const ds = new DecompressionStream('gzip');
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

function blocks(x0, y0, x1, y1) {
  const B = INDEX.block, out = [];
  for (let by = Math.floor(y0 / B); by <= Math.floor(y1 / B); by++) for (let bx = Math.floor(x0 / B); bx <= Math.floor(x1 / B); bx++) out.push(bx + ',' + by);
  return out;
}

function loadPack(id) {
  let p = PACKS.get(id);
  if (!p) {
    p = fetch(`${BASE}c${String(id).padStart(3, '0')}.${BIN}`).then((r) => r.arrayBuffer()).then(gunzip).then((ab) => {
      const dv0 = new DataView(ab);
      const hl = dv0.getUint32(0, true);
      const table = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hl)));
      const dv = new DataView(ab, 4 + hl);
      for (const [key, [off, len, names]] of Object.entries(table)) LOC.set(key, { dv, off, len, names });
    });
    PACKS.set(id, p);
  }
  return p;
}

// fetch everything needed to draw the box (km); resolves when it is in memory
export async function ensureArea(x0, y0, x1, y1) {
  if (!INDEX) await initPacks();
  await initEdits();
  const ids = new Set();
  for (const b of blocks(x0, y0, x1, y1)) for (const id of INDEX.chunks[b] || []) ids.add(id);
  await Promise.all([...ids].map(loadPack));
}

// ---------------------------------------------------------------- edits
// public/data/edits.json, made in the map editor (and by gen/overlaps.mjs), part of the map for
// every build: town buildings and streets removed or reshaped (by chunk and their index in it),
// the country's roads removed or re-routed (by index), and roads added; businesses and TPF sites
// moved, renamed, removed or added. edits.json is the map editor's; auto-edits.json is
// gen/overlaps.mjs's (overlapping buildings removed, businesses and TPF pins put back on a
// building), and an edit in edits.json wins over it. `base` says which map data each was made on:
// the indexes mean nothing on a map generated again.
const EMPTY = () => ({ v: 1, roads: {}, added: [], chunks: {}, pois: {}, poisAdded: [], sites: {}, sitesAdded: [] });
let EDITS = EMPTY(), AUTO = { chunks: {}, pois: {}, sites: {} }, EDITS_P = null;
export function initEdits() {
  return (EDITS_P ||= (async () => {
    try { EDITS = await fetch('./data/edits.json', { cache: 'no-store' }).then((r) => r.json()); } catch {}
    try { AUTO = await fetch('./data/auto-edits.json', { cache: 'no-store' }).then((r) => r.json()); } catch {}
    EDITS = { ...EMPTY(), ...EDITS };
    AUTO = { chunks: {}, pois: {}, sites: {}, ...AUTO };
    // (an older edits.json kept the generator's removals itself: they are auto-edits.json's now)
    for (const ch of Object.values(EDITS.chunks)) for (const [i, e] of Object.entries(ch.b || {})) if (e && e.auto) delete ch.b[i];
    return EDITS;
  })());
}
export const edits = () => EDITS;
export const autoEdits = () => AUTO;
// the edits made on this map (or on none yet), else none at all and a warning: true if they apply
export function checkEdits(roadCount) {
  const now = { roads: roadCount, packs: INDEX.packs, build: INDEX.build };
  const same = (b) => b.roads === now.roads && b.packs === now.packs && b.build === now.build;
  if (AUTO.base && !same(AUTO.base)) { console.warn('auto-edits.json was made on other map data: not applied'); AUTO = { chunks: {}, pois: {}, sites: {} }; }
  if (!EDITS.base) { EDITS.base = now; return true; }
  if (same(EDITS.base)) return true;
  console.warn(`edits.json was made on other map data (${JSON.stringify(EDITS.base)}, now ${JSON.stringify(now)}): not applied`);
  EDITS = { ...EMPTY(), base: now, stale: true };
  return false;
}
export const forgetChunk = (key) => DEC.delete(key); // decoded again, with the edits, next time
function applyChunkEdits(key, R) {
  R.buildings.forEach((b, i) => { b.i = i; });
  R.streets.forEach((s, i) => { s.i = i; });
  R.areas.forEach((a, i) => { a.i = i; });
  const e = EDITS.chunks[key], a = AUTO.chunks[key];
  if (!e && !a) return R;
  if (e?.b || a?.b) R.buildings = R.buildings.filter((b) => { const x = e?.b?.[b.i] || a?.b?.[b.i]; if (!x) return true; if (x.del) return false; if (x.r) { b.r = x.r; b.cx = (x.r[0][0] + x.r[2][0]) / 2; b.cy = (x.r[0][1] + x.r[2][1]) / 2; b.rr = Math.hypot(x.r[2][0] - x.r[0][0], x.r[2][1] - x.r[0][1]) / 2; } if (x.kind) b.kind = x.kind; return true; });
  if (e?.a || a?.a) R.areas = R.areas.filter((x) => { const d = e?.a?.[x.i] || a?.a?.[x.i]; return !(d && d.del); });
  if (!e) return R;
  if (e.s) R.streets = R.streets.filter((s) => { const x = e.s[s.i]; if (!x) return true; if (x.del) return false; if (x.pts) s.pts = Float64Array.from(x.pts); return true; });
  return R;
}

// every pack loaded at once, and the keys of all their chunks (for the generator's checks)
export async function loadAllPacks() {
  if (!INDEX) await initPacks();
  await Promise.all(Array.from({ length: INDEX.packs }, (_, id) => loadPack(id)));
  return [...LOC.keys()];
}

export function chunkRecord(townId, cx, cy) {
  const key = `${townId}|${cx}|${cy}`;
  let r = DEC.get(key);
  if (r) { DEC.delete(key); DEC.set(key, r); return r; }
  const loc = LOC.get(key);
  if (!loc) return null;
  r = applyChunkEdits(key, decode(loc, cx * INDEX.ch, cy * INDEX.ch));
  DEC.set(key, r);
  if (DEC.size > 1800) DEC.delete(DEC.keys().next().value);
  return r;
}

function decode({ dv, off, len, names }, ox, oy) {
  let o = off;
  const u8 = () => dv.getUint8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const X = () => { const v = dv.getInt16(o, true); o += 2; return ox + v / 10000; };
  const Y = () => { const v = dv.getInt16(o, true); o += 2; return oy + v / 10000; };
  const pts = () => { const n = u16(), a = []; for (let i = 0; i < n; i++) a.push([X(), Y()]); return a; };
  const streets = [];
  for (let k = u16(); k > 0; k--) {
    const f = u8(), w = u8() / 2000, nm = u16(), n = u16();
    const p = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) { p[i * 2] = X(); p[i * 2 + 1] = Y(); }
    streets.push({ pts: p, w, name: nm ? names[nm - 1] : '', main: !!(f & 1), lane: !!(f & 2), regional: !!(f & 4) });
  }
  const areas = [];
  for (let k = u16(); k > 0; k--) {
    const kind = AREA[u8()], poly = pts();
    const paths = [];
    for (let q = u8(); q > 0; q--) { const n = u16(), p = []; for (let i = 0; i < n; i++) p.push(X(), Y()); paths.push(p); }
    const pond = pts();
    areas.push({ kind, poly, paths: paths.length ? paths : null, pond: pond.length ? pond : null });
  }
  const buildings = [];
  for (let k = u32(); k > 0; k--) {
    const cx = X(), cy = Y(), w = u8() / 500, d = u8() / 500, a = (u8() / 256) * Math.PI, kind = BUILD[u8()];
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, hw = w / 2, hd = d / 2;
    const rr = Math.hypot(hw, hd); // (cx, cy, rr: a circle round it, to skip it fast where it is not drawn)
    buildings.push({ kind, cx, cy, rr, r: [[cx - ux * hw - nx * hd, cy - uy * hw - ny * hd], [cx + ux * hw - nx * hd, cy + uy * hw - ny * hd], [cx + ux * hw + nx * hd, cy + uy * hw + ny * hd], [cx - ux * hw + nx * hd, cy - uy * hw + ny * hd]] });
  }
  const paths = [];
  for (let k = u16(); k > 0; k--) paths.push([X(), Y(), X(), Y()]);
  const rounds = [];
  for (let k = u8(); k > 0; k--) rounds.push({ x: X(), y: Y(), r: u8() / 2000 });
  return { streets, areas, buildings, paths, rounds };
}

// ---------------------------------------------------------------- businesses
const POI_RAW = []; // every business loaded, as generated
let POI_V = 0;
export const poiVersion = () => POI_V; // (changes when businesses are loaded, added or edited)
let ADDED_IN = false;
const poiBlock = (x, y) => Math.floor(x / INDEX.block) + ',' + Math.floor(y / INDEX.block);
function putPoi(q) { const k = poiBlock(q.x, q.y); let l = POIS.get(k); if (!l) POIS.set(k, (l = [])); l.push(q); }
// a business with its edits (moved, renamed), or null if removed; the editor's own edit wins
function poiWithEdits(q) {
  const a = AUTO.pois[q.id], e = EDITS.pois[q.id];
  if (e ? e.del : a && a.del) return null;
  return a || e ? { ...q, ...(a || {}), ...(e || {}) } : q;
}
// all businesses again from the edits, after the map editor changed one
export function refreshPois() {
  POI_V++;
  POIS.clear();
  for (const q of POI_RAW) { const w = poiWithEdits(q); if (w) putPoi(w); }
  for (const a of EDITS.poisAdded) if (a) putPoi(a);
}
// the generator works on the businesses as generated
export function skipEdits() { EDITS_P = Promise.resolve(EDITS); }
function loadPoiPack(id) {
  let p = POIP.get(id);
  if (!p) {
    p = Promise.all([fetch(`${BASE}p${String(id).padStart(3, '0')}.${BIN}`).then((r) => r.arrayBuffer()).then(gunzip), initEdits()]).then(([ab]) => {
      const data = JSON.parse(new TextDecoder().decode(ab));
      for (const list of Object.values(data)) for (const [id2, type, name, x, y, chain, town, province, country, street, num, rating, reviews, phone] of list) {
        const q = { id: id2, type, name, x, y, chain: chain || null, town, province: province || null, country, street, num, rating, reviews, phone };
        POI_RAW.push(q);
        const w = poiWithEdits(q);
        if (w) putPoi(w);
      }
      POI_V++;
    });
    POIP.set(id, p);
  }
  return p;
}
export async function ensurePois(x0, y0, x1, y1) {
  if (!INDEX) await initPacks();
  await initEdits();
  if (!ADDED_IN) { ADDED_IN = true; for (const a of EDITS.poisAdded) if (a) putPoi(a); POI_V++; } // (businesses added in the editor)
  const ids = new Set();
  for (const b of blocks(x0, y0, x1, y1)) if (INDEX.pois[b] !== undefined) ids.add(INDEX.pois[b]);
  await Promise.all([...ids].map(loadPoiPack));
}
// businesses already in memory within r km of (x, y)
export function poisNear(x, y, r, filter = () => true) {
  if (!INDEX) return [];
  const out = [];
  for (const b of blocks(x - r, y - r, x + r, y + r)) for (const q of POIS.get(b) || []) if (filter(q) && Math.hypot(q.x - x, q.y - y) < r) out.push(q);
  return out;
}
export function poisInBox(x0, y0, x1, y1) {
  if (!INDEX) return [];
  const out = [];
  for (const b of blocks(x0, y0, x1, y1)) for (const q of POIS.get(b) || []) if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) out.push(q);
  return out;
}

// ---------------------------------------------------------------- countryside and compounds
let RIDX = null, COMPOUNDS = null;
const RPACK = new Map(), RURAL = new Map();
export async function initExtras() {
  if (!RIDX) [RIDX, COMPOUNDS] = await Promise.all([fetch(BASE + 'rural-index.json').then((r) => r.json()), fetch(BASE + 'compounds.json').then((r) => r.json())]);
}
function loadRural(id) {
  let p = RPACK.get(id);
  if (!p) {
    p = fetch(`${BASE}r${String(id).padStart(3, '0')}.${BIN}`).then((r) => r.arrayBuffer()).then(gunzip).then((ab) => {
      const data = JSON.parse(new TextDecoder().decode(ab));
      for (const [k, v] of Object.entries(data)) {
        // each farm: 8 numbers per building (4 corners)
        RURAL.set(k, { farms: v.farms.map((f) => { const out = []; for (let i = 0; i < f.length; i += 8) out.push([[f[i], f[i + 1]], [f[i + 2], f[i + 3]], [f[i + 4], f[i + 5]], [f[i + 6], f[i + 7]]]); return out; }), tracks: v.tracks });
      }
    });
    RPACK.set(id, p);
  }
  return p;
}
export async function ensureRural(x0, y0, x1, y1) {
  await initExtras();
  const B = RIDX.block, ids = new Set();
  for (let by = Math.floor((y0 - 0.3) / B); by <= Math.floor((y1 + 0.3) / B); by++) for (let bx = Math.floor((x0 - 0.3) / B); bx <= Math.floor((x1 + 0.3) / B); bx++) {
    const id = RIDX.index[bx + ',' + by];
    if (id !== undefined) ids.add(id);
  }
  await Promise.all([...ids].map(loadRural));
}
export function ruralInBox(x0, y0, x1, y1) {
  const out = { farms: [], tracks: [] };
  if (!RIDX) return out;
  const B = RIDX.block;
  for (let by = Math.floor((y0 - 0.3) / B); by <= Math.floor((y1 + 0.3) / B); by++) for (let bx = Math.floor((x0 - 0.3) / B); bx <= Math.floor((x1 + 0.3) / B); bx++) {
    const r = RURAL.get(bx + ',' + by);
    if (!r) continue;
    for (const f of r.farms) if (f[0][0][0] > x0 - 0.25 && f[0][0][0] < x1 + 0.25 && f[0][0][1] > y0 - 0.25 && f[0][0][1] < y1 + 0.25) out.farms.push(f);
    for (const t of r.tracks) {
      const ex = t.length - 2;
      if (Math.max(t[0], t[ex]) > x0 - 0.1 && Math.min(t[0], t[ex]) < x1 + 0.1 && Math.max(t[1], t[ex + 1]) > y0 - 0.1 && Math.min(t[1], t[ex + 1]) < y1 + 0.1) out.tracks.push(t);
    }
  }
  return out;
}
export function compoundsInBox(x0, y0, x1, y1) {
  if (!COMPOUNDS) return [];
  return COMPOUNDS.filter((c) => c.x > x0 - 4 && c.x < x1 + 4 && c.y > y0 - 4 && c.y < y1 + 4);
}

// ---------------------------------------------------------------- fields and ports (gen/landuse.mjs)
const LU = './data/landuse/';
let FIDX = null, PORTS = null;
const FPACK = new Map(), FIELDS = new Map(); // block -> [{kind, q: [[x, y] x4], x0, y0, x1, y1}]
export async function initLanduse() {
  if (!FIDX) [FIDX, PORTS] = await Promise.all([fetch(LU + 'fields-index.json').then((r) => r.json()), fetch(LU + 'ports.json').then((r) => r.json())]);
}
function loadFields(id) {
  let p = FPACK.get(id);
  if (!p) {
    p = fetch(`${LU}f${String(id).padStart(3, '0')}.${BIN}`).then((r) => r.arrayBuffer()).then(gunzip).then((ab) => {
      const data = JSON.parse(new TextDecoder().decode(ab)), q = FIDX.q;
      for (const [k, list] of Object.entries(data)) {
        FIELDS.set(k, list.map((f) => {
          const pts = [[f[1] / q, f[2] / q], [f[3] / q, f[4] / q], [f[5] / q, f[6] / q], [f[7] / q, f[8] / q]];
          const xs = pts.map((v) => v[0]), ys = pts.map((v) => v[1]);
          return { kind: f[0], q: pts, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
        }));
      }
    });
    FPACK.set(id, p);
  }
  return p;
}
export async function ensureFields(x0, y0, x1, y1) {
  await initLanduse();
  const B = FIDX.block, ids = new Set();
  for (let by = Math.floor((y0 - 1) / B); by <= Math.floor((y1 + 1) / B); by++) for (let bx = Math.floor((x0 - 1) / B); bx <= Math.floor((x1 + 1) / B); bx++) {
    const id = FIDX.index[bx + ',' + by];
    if (id !== undefined) ids.add(id);
  }
  await Promise.all([...ids].map(loadFields));
}
export function fieldsInBox(x0, y0, x1, y1) {
  const out = [];
  if (!FIDX) return out;
  const B = FIDX.block;
  for (let by = Math.floor((y0 - 1) / B); by <= Math.floor((y1 + 1) / B); by++) for (let bx = Math.floor((x0 - 1) / B); bx <= Math.floor((x1 + 1) / B); bx++) {
    for (const f of FIELDS.get(bx + ',' + by) || []) if (f.x1 > x0 && f.x0 < x1 && f.y1 > y0 && f.y0 < y1) out.push(f);
  }
  return out;
}
export function portsInBox(x0, y0, x1, y1) {
  if (!PORTS) return [];
  return PORTS.filter((p) => p.x > x0 - 4 && p.x < x1 + 4 && p.y > y0 - 4 && p.y < y1 + 4);
}
