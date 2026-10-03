// Organic town generator. Every town is different and nothing here is a grid.
//
// 1. Skeleton (per town, cached): the old core, the regional roads that enter the
//    town, and main streets grown from the core as wandering, branching lines. Some
//    towns get part of a ring where the walls stood; most do not.
// 2. Local streets (per 0.8 km chunk, cached): grown from the main streets and from
//    fixed crossing points on the chunk edges (shared with the neighbour chunk, so
//    streets continue across). They wander, branch, join other streets or end.
// 3. Buildings line every street; open land is kept for squares, parks, car parks,
//    schools and churches.
// All randomness comes from hashes of positions and ids, so a town is always the same.

import { STYLES, DEFAULT_STYLE } from './styles.js';
import { compoundsIn } from './compounds.js';

const TOWNS = new Map();
export const STATS = {}; // debug counters: why footprints were rejected
const no = (k) => { STATS[k] = (STATS[k] || 0) + 1; return false; };
const CHUNKS = new Map();
// drop a town that is done with (the generator, town after town); it is rebuilt if asked for again
export function forgetTown(id) {
  TOWNS.delete(id);
  for (const k of CHUNKS.keys()) if (k.startsWith(id + ':')) CHUNKS.delete(k);
}
const CH = 0.8; // chunk size, km
// how loosely towns are laid out: street spacing and the gaps between buildings grow with it
const SPREAD = 1.45;

export function h32(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2246822519) + Math.imul(d | 0, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
function vnoise(x, y, seed) { // smooth value noise, 0..1
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h32(seed, xi, yi), b = h32(seed, xi + 1, yi), c = h32(seed, xi, yi + 1), d = h32(seed, xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------- spatial hash of segments
class SegHash {
  // clip: optional [x0, y0, x1, y1]; long segments are cut into short pieces and only
  // the pieces near the clip box are kept (a long river edge would fill thousands of cells)
  constructor(cell = 0.04, clip = null) { this.cell = cell; this.m = new Map(); this.segs = []; this.clip = clip; this.stamp = 0; }
  add(ax, ay, bx, by, w, street) {
    const L = Math.hypot(bx - ax, by - ay);
    if (L > this.cell * 3) {
      const n = Math.ceil(L / (this.cell * 1.5));
      let last = null;
      for (let k = 0; k < n; k++) {
        const x0 = ax + ((bx - ax) * k) / n, y0 = ay + ((by - ay) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, y1 = ay + ((by - ay) * (k + 1)) / n;
        const c = this.clip;
        if (c && (Math.max(x0, x1) < c[0] || Math.min(x0, x1) > c[2] || Math.max(y0, y1) < c[1] || Math.min(y0, y1) > c[3])) continue;
        last = this.add1(x0, y0, x1, y1, w, street);
      }
      return last;
    }
    return this.add1(ax, ay, bx, by, w, street);
  }
  add1(ax, ay, bx, by, w, street) {
    const s = { ax, ay, bx, by, w, street };
    const id = this.segs.push(s) - 1;
    const c = this.cell;
    for (let y = Math.floor(Math.min(ay, by) / c); y <= Math.floor(Math.max(ay, by) / c); y++)
      for (let x = Math.floor(Math.min(ax, bx) / c); x <= Math.floor(Math.max(ax, bx) / c); x++) {
        const k = x * 73856093 ^ y * 19349663;
        let l = this.m.get(k);
        if (!l) this.m.set(k, (l = []));
        l.push(id);
      }
    return s;
  }
  near(x, y, r, cb) {
    const c = this.cell, st = ++this.stamp;
    for (let yy = Math.floor((y - r) / c); yy <= Math.floor((y + r) / c); yy++)
      for (let xx = Math.floor((x - r) / c); xx <= Math.floor((x + r) / c); xx++) {
        const l = this.m.get(xx * 73856093 ^ yy * 19349663);
        if (!l) continue;
        for (const id of l) { const s = this.segs[id]; if (s.st === st) continue; s.st = st; if (cb(s) === false) return; }
      }
  }
}
function segDist(x, y, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
  const qx = s.ax + t * dx, qy = s.ay + t * dy;
  return { d: Math.hypot(qx - x, qy - y), qx, qy };
}
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t > 1e-6 && t < 1 && u >= 0 && u <= 1 ? [ax + (bx - ax) * t, ay + (by - ay) * t] : null;
}

// ---------------------------------------------------------------- town skeleton
export function townOf(u, world) {
  let T = TOWNS.get(u.id);
  if (T) return T;
  const p = u.place, seed = strHash(u.id);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of u.rings) { x0 = Math.min(x0, r.b[0]); y0 = Math.min(y0, r.b[1]); x1 = Math.max(x1, r.b[2]); y1 = Math.max(y1, r.b[3]); }
  x0 -= 0.1; y0 -= 0.1; x1 += 0.1; y1 += 0.1;
  // built-up mask at 40 m
  const MR = 0.04, mw = Math.ceil((x1 - x0) / MR), mh = Math.ceil((y1 - y0) / MR);
  const mask = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) {
    const yy = y0 + (j + 0.5) * MR, xs = [];
    for (const r of u.rings) {
      const q = r.p;
      for (let i = 0, k = q.length - 2; i < q.length; k = i, i += 2) {
        const yi = q[i + 1], yk = q[k + 1];
        if ((yi > yy) !== (yk > yy)) xs.push(q[i] + ((yy - yi) * (q[k] - q[i])) / (yk - yi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil((xs[k] - x0) / MR - 0.5)), b = Math.min(mw - 1, Math.floor((xs[k + 1] - x0) / MR - 0.5));
      for (let i = a; i <= b; i++) mask[j * mw + i] = 1;
    }
  }
  const R = Math.max(0.3, Math.max(x1 - p.x, p.x - x0, y1 - p.y, p.y - y0));
  T = { u, p, seed, R, x0, y0, x1, y1, MR, mw, mh, mask, big: p.pop >= 3000, city: p.pop >= 30000 };
  T.inMask = (x, y) => {
    const i = Math.floor((x - x0) / MR), j = Math.floor((y - y0) / MR);
    return i >= 0 && j >= 0 && i < mw && j < mh && mask[j * mw + i] === 1;
  };
  // character of the town: its region's style, varied a little per town
  const base = (p.c === 'est' ? STYLES[p.pr] : STYLES[p.c]) || DEFAULT_STYLE;
  const vary = (v, k) => v * (0.85 + 0.3 * h32(seed, 200 + k));
  const st = (T.style = {}); for (const [k, v] of Object.entries(base)) st[k] = typeof v === 'number' ? vary(v, k.length) : v;
  T.wind = (0.1 + 0.25 * h32(seed, 1)) * st.wind;
  T.branchy = (0.35 + 0.6 * h32(seed, 2)) * st.branch;
  T.ring = T.big && h32(seed, 3) < st.ring * (T.city ? 1 : 0.4);
  // a village has no packed core: detached houses in gardens along its lanes, few side streets
  T.village = !T.big;
  if (T.village) { st.linear = Math.max(st.linear || 0, 0.85); st.plot *= 1.25; }
  const densMax = T.village ? 0.32 : 1;
  T.density = (x, y) => {
    const d = Math.hypot(x - p.x, y - p.y) / R;
    return Math.max(0, Math.min(densMax, 0.85 * Math.exp((-d * (T.city ? 2.4 : 3.2)) / st.dens) + (vnoise(x * 1.3, y * 1.3, seed) - 0.5) * 0.35));
  };
  T.coreR = T.big ? Math.min(1.6, 0.12 + Math.sqrt(p.pop) / 1400) : 0.08;
  // rivers in town, with their half widths, for streets, buildings and shops
  T.rivers = new SegHash(0.08, [x0 - 0.2, y0 - 0.2, x1 + 0.2, y1 + 0.2]);
  for (const r of world.riversIndex.query(x0, y0, x1, y1)) {
    if (r.a1 < 600) continue;
    const q = r.p, hw = Math.min(0.16, 0.00014 * Math.sqrt(r.a1)) + 0.004;
    for (let i = 2; i < q.length; i += 2) T.rivers.add(q[i - 2], q[i - 1], q[i], q[i + 1], hw * 2, { river: true });
  }
  T.inWater = (x, y, extra = 0) => {
    let wet = false;
    T.rivers.near(x, y, 0.2, (s) => { if (segDist(x, y, s).d < s.w / 2 + extra) { wet = true; return false; } });
    return wet;
  };
  buildSkeleton(T, world);
  TOWNS.set(u.id, T);
  return T;
}

function buildSkeleton(T, world) {
  const { p, seed, R } = T;
  const art = new SegHash(0.12);
  T.art = art;
  T.mains = [];
  const W = (T.city ? 0.011 : T.big ? 0.0095 : 0.008) * T.style.street;
  // regional roads inside the town count as main streets (a long segment counts when any
  // part of it runs through the town); the nearest point on one is where the town meets it
  let near = null, nd = Infinity;
  for (const r of world.roadsIndex.query(T.x0, T.y0, T.x1, T.y1)) {
    const q = r.p;
    for (let i = 2; i < q.length; i += 2) {
      const ax = q[i - 2], ay = q[i - 1], bx = q[i], by = q[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.05));
      let inside = false;
      for (let k = 0; k <= n && !inside; k++) inside = T.inMask(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
      if (!inside) continue;
      art.add(ax, ay, bx, by, 0.012, { regional: true });
      const d = segDist(p.x, p.y, { ax, ay, bx, by });
      if (d.d < nd) { nd = d.d; near = d; }
    }
  }
  // grown main streets: from the core outward, wandering and branching
  const budget = Math.min(1400, 6 + (T.x1 - T.x0) * (T.y1 - T.y0) * (T.city ? 1.6 : 1.1)); // km of main street
  let used = 0;
  const n0 = T.big ? 3 + Math.floor(h32(seed, 4) * 5) : 1 + Math.floor(h32(seed, 4) * 3);
  const queue = [];
  // the core: the place itself, or the nearest dry ground when the place stands on the river
  let ox = p.x, oy = p.y;
  if (T.inWater(ox, oy, 0.01)) {
    search: for (let r = 0.02; r < 1; r += 0.02) for (let a = 0; a < 16; a++) {
      const qx = p.x + Math.cos((a * Math.PI) / 8) * r, qy = p.y + Math.sin((a * Math.PI) / 8) * r;
      if (!T.inWater(qx, qy, 0.01) && T.inMask(qx, qy)) { ox = qx; oy = qy; break search; }
    }
  }
  for (let k = 0; k < n0; k++) queue.push({ x: ox, y: oy, a: (k / n0) * Math.PI * 2 + h32(seed, 5, k) * 1.2, depth: 0, id: k });
  // the road the town grew up on: the first main street runs out to it
  if (near && nd > 0.06) Object.assign(queue[0], { a: Math.atan2(near.qy - oy, near.qx - ox), to: near, maxLen: nd + 0.2 });
  let sid = 0;
  while (queue.length && used < budget) {
    const s = queue.shift();
    const street = { name: mainName(T, sid), main: true, id: sid++, pts: [s.x, s.y], w: W * (s.depth === 0 ? 1 : 0.85) };
    let x = s.x, y = s.y, a = s.a, len = 0;
    const step = 0.09;
    const maxLen = Math.max(s.maxLen || 0, (s.depth === 0 ? R * 1.3 : R * (0.25 + 0.5 * h32(seed, 9, sid))) + 0.3);
    let sinceBranch = 0;
    while (len < maxLen) {
      a += (vnoise(x * 2.2, y * 2.2, seed + 17) - 0.5) * T.wind * (T.style.planned ? 0.4 : 2.2);
      if (s.to) { const t = Math.atan2(s.to.qy - y, s.to.qx - x); a = Math.atan2(Math.sin(a) + Math.sin(t) * 1.5, Math.cos(a) + Math.cos(t) * 1.5); }
      let nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      // never run alongside another main street or a through road: turn away from it
      let par = null;
      art.near(nx, ny, 0.08, (sg) => {
        if (sg.street === street) return;
        const d = segDist(nx, ny, sg);
        if (d.d > 0.075) return;
        let da = Math.abs(a - Math.atan2(sg.by - sg.ay, sg.bx - sg.ax)) % Math.PI;
        if (da > Math.PI / 2) da = Math.PI - da;
        if (da < 0.55) { par = d; return false; }
      });
      if (par) {
        const vx = nx - par.qx, vy = ny - par.qy, vl = Math.hypot(vx, vy) || 1e-9;
        a = Math.atan2(Math.sin(a) + (vy / vl) * 0.9, Math.cos(a) + (vx / vl) * 0.9);
        nx = x + Math.cos(a) * step; ny = y + Math.sin(a) * step;
      }
      if (!T.inMask(nx, ny) && !T.inWater(nx, ny)) break;
      if (T.inWater(nx, ny)) {
        // a bridge: some main streets cross straight over, the rest stop at the bank
        if (h32(seed, sid, 404) > 0.45) break;
        let k = 0;
        while (T.inWater(nx, ny) && k++ < 8) { nx += Math.cos(a) * step; ny += Math.sin(a) * step; }
        if (T.inWater(nx, ny) || !T.inMask(nx, ny)) break;
        street.bridges = (street.bridges || 0) + 1;
      }
      // meet another main street: join it and stop
      let hit = null;
      art.near(nx, ny, 0.05, (sg) => { if (sg.street === street) return; const d = segDist(nx, ny, sg); if (d.d < 0.045 && len > 0.15) { hit = d; return false; } });
      if (hit) { street.pts.push(hit.qx, hit.qy); art.add(x, y, hit.qx, hit.qy, street.w, street); used += Math.hypot(hit.qx - x, hit.qy - y); break; }
      art.add(x, y, nx, ny, street.w, street);
      street.pts.push(nx, ny);
      used += step; len += step; sinceBranch += step;
      x = nx; y = ny;
      // branch like a tree, more in branchy towns
      const gap = (0.35 + 0.9 * h32(seed, sid, Math.round(len * 100))) / T.branchy;
      if (sinceBranch > gap && s.depth < 3) {
        sinceBranch = 0;
        const side = h32(seed, sid, Math.round(len * 100), 3) < 0.5 ? -1 : 1;
        const turn = T.style.planned ? Math.PI / 2 + (h32(seed, sid, Math.round(len * 100), 4) - 0.5) * 0.6 : 0.7 + 0.8 * h32(seed, sid, Math.round(len * 100), 4);
        queue.push({ x, y, a: a + side * turn, depth: s.depth + 1 });
      }
    }
    if (street.pts.length >= 4) T.mains.push(street);
  }
  // a ring where the walls stood: partial, wobbly, only in some towns
  if (T.ring) {
    const rr = T.coreR * (1.1 + 0.4 * h32(seed, 31));
    const a0 = h32(seed, 32) * Math.PI * 2, span = Math.PI * (1.1 + 0.85 * h32(seed, 33));
    const street = { name: ringName(T), main: true, ring: true, id: sid++, pts: [], w: W * 1.15 };
    for (let k = 0; k <= 60; k++) {
      const ang = a0 + (span * k) / 60;
      const r = rr * (1 + (vnoise(Math.cos(ang) * 2 + 5, Math.sin(ang) * 2, seed) - 0.5) * 0.35);
      const x = p.x + Math.cos(ang) * r, y = p.y + Math.sin(ang) * r;
      if (!T.inMask(x, y)) { if (street.pts.length >= 4) { T.mains.push({ ...street, pts: street.pts }); } street.pts = []; continue; }
      if (street.pts.length) art.add(street.pts[street.pts.length - 2], street.pts[street.pts.length - 1], x, y, street.w, street);
      street.pts.push(x, y);
    }
    if (street.pts.length >= 4) T.mains.push(street);
  }
  // the old square at the core
  const sq = [];
  const sr = T.big ? 0.035 + 0.025 * h32(seed, 41) : 0.022;
  for (let k = 0; k < 7; k++) { const ang = (k / 7) * Math.PI * 2 + h32(seed, 42); const r = sr * (0.75 + 0.5 * h32(seed, 43, k)); sq.push([p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r]); }
  T.square = sq;
  T.squareR = sr;
}

const NAMES_A = ['Mill', 'Church', 'Station', 'Market', 'Bridge', 'King', 'Queen', 'High', 'Park', 'Garden', 'Orchard', 'Chapel', 'School', 'Water', 'Castle', 'Albion', 'Mercer', 'Tanner', 'Cooper', 'Weaver', 'Baker', 'Ropewalk', 'Granary', 'Foundry', 'Canal', 'Elm', 'Ash', 'Oak', 'Beech', 'Hawthorn', 'Rowan', 'Linden', 'Willow', 'Hazel', 'Holly', 'Cedar', 'Laurel', 'Alder', 'Maple', 'North', 'South', 'East', 'West', 'New', 'Old', 'Long', 'Broad', 'Narrow', 'Back', 'Lamb', 'Swan', 'Bell', 'Crown', 'Anchor', 'Saddler', 'Glover', 'Chandler', 'Fletcher', 'Turner', 'Hatter', 'Mason', 'Carter', 'Smith', 'Fuller', 'Dyer', 'Wheeler', 'Barley', 'Malt', 'Hop', 'Corn', 'Hay', 'Wool', 'Salt', 'Coal', 'Iron', 'Copper', 'Tower', 'Abbey', 'Priory', 'Friars', 'Temple', 'Guild', 'Hall', 'Court', 'Spring', 'Well', 'Pond', 'Brook', 'River', 'Meadow', 'Field', 'Moor', 'Heath', 'Common', 'Green', 'Hill', 'Vale', 'Ridge', 'Cliff', 'Quarry', 'Goose', 'Sheep', 'Cattle', 'Fish', 'Shambles', 'Pudding', 'Tallow', 'Candle', 'Needle', 'Pin', 'Cross', 'Gallows', 'Pound', 'Toll', 'Hythe', 'Staithe'];
const TYPES_MAIN = ['Street', 'Road', 'Gate', 'Way', 'Avenue', 'High Street'];
const TYPES_LOCAL = ['Street', 'Lane', 'Row', 'Close', 'Walk', 'Yard', 'Place', 'Terrace', 'Crescent', 'Gardens', 'Mews', 'Court', 'Alley', 'Passage', 'Rise', 'Grove', 'Drive', 'Hill'];
function mainName(T, id) {
  const a = NAMES_A[Math.floor(h32(T.seed, id, 51) * NAMES_A.length)];
  return id === 0 && T.big ? 'High Street' : `${a} ${TYPES_MAIN[Math.floor(h32(T.seed, id, 52) * (TYPES_MAIN.length - 1))]}`;
}
function ringName(T) { return ['Wall Street', 'The Ramparts', 'Town Wall', 'Bastion Road', 'Moat Street'][Math.floor(h32(T.seed, 61) * 5)]; }
export function localName(seed, id) {
  const a = NAMES_A[Math.floor(h32(seed, id, 71) * NAMES_A.length)];
  return `${a} ${TYPES_LOCAL[Math.floor(h32(seed, id, 72) * TYPES_LOCAL.length)]}`;
}

// ---------------------------------------------------------------- chunk: local streets, buildings, open land
export function chunk(T, cx, cy, world) {
  const key = T.u.id + ':' + cx + ':' + cy;
  let C = CHUNKS.get(key);
  if (C) return C;
  C = streetsOf(T, cx, cy, world);
  CHUNKS.set(key, C);
  if (CHUNKS.size > 900) CHUNKS.delete(CHUNKS.keys().next().value);
  return C;
}

function portalsOf(T, cx, cy, side) {
  // crossing points on one chunk edge; the same for both chunks that share it
  let ex, ey, dx, dy, id;
  if (side === 0) { ex = cx * CH; ey = cy * CH; dx = CH; dy = 0; id = [cx, cy, 0]; } // top
  else if (side === 1) { ex = cx * CH; ey = (cy + 1) * CH; dx = CH; dy = 0; id = [cx, cy + 1, 0]; } // bottom
  else if (side === 2) { ex = cx * CH; ey = cy * CH; dx = 0; dy = CH; id = [cx, cy, 1]; } // left
  else { ex = (cx + 1) * CH; ey = cy * CH; dx = 0; dy = CH; id = [cx + 1, cy, 1]; } // right
  const mx = ex + dx / 2, my = ey + dy / 2;
  const dens = T.density(mx, my);
  // at least one street crosses every edge inside a town, so no part of it is left without streets
  const n = Math.max(T.inMask(mx, my) ? 1 : 0, Math.floor(((1 + dens * 6) * h32(T.seed, id[0], id[1], id[2] + 5) + dens * 2) / SPREAD));
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = 0.06 + 0.88 * h32(T.seed, id[0] * 31 + k, id[1], id[2]);
    const x = ex + dx * t, y = ey + dy * t;
    if (T.inMask(x, y)) out.push({ x, y, k, id });
  }
  return out;
}

function streetsOf(T, cx, cy, world) {
  const X0 = cx * CH, Y0 = cy * CH, X1 = X0 + CH, Y1 = Y0 + CH;
  const segs = new SegHash(0.03, [X0 - 0.1, Y0 - 0.1, X1 + 0.1, Y1 + 0.1]);
  const streets = [];
  const seedK = T.seed ^ (cx * 92821 + cy * 68917);
  // main streets and regional roads that touch the chunk
  T.art.near((X0 + X1) / 2, (Y0 + Y1) / 2, CH * 0.75, (s) => {
    if (Math.max(s.ax, s.bx) < X0 - 0.05 || Math.min(s.ax, s.bx) > X1 + 0.05 || Math.max(s.ay, s.by) < Y0 - 0.05 || Math.min(s.ay, s.by) > Y1 + 0.05) return;
    segs.add(s.ax, s.ay, s.bx, s.by, s.w, s.street);
  });
  const mainSegs = segs.segs.slice();
  const inChunk = (x, y) => x >= X0 && x < X1 && y >= Y0 && y < Y1;
  const wet = (x, y) => T.inWater(x, y, 0.003);
  // seeds: chunk-edge crossings (heading in), and side-street starts along main streets
  const seeds = [];
  for (let side = 0; side < 4; side++) for (const pt of portalsOf(T, cx, cy, side)) {
    const a = side === 0 ? Math.PI / 2 : side === 1 ? -Math.PI / 2 : side === 2 ? 0 : Math.PI;
    seeds.push({ x: pt.x, y: pt.y, a: a + (h32(T.seed, pt.id[0] + pt.k, pt.id[1], 9) - 0.5) * 0.5, depth: 1, edge: true, nid: strHash(pt.id.join(',') + ':' + pt.k) });
  }
  let sn = 0;
  for (const s of mainSegs) {
    const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const ang = Math.atan2(s.by - s.ay, s.bx - s.ax);
    for (let t = 0; t < L; t += 0.03) {
      const x = s.ax + ((s.bx - s.ax) * t) / L, y = s.ay + ((s.by - s.ay) * t) / L;
      if (!inChunk(x, y)) continue;
      const dens = T.density(x, y);
      const spacing = (0.05 + 0.13 * (1 - dens) * (1 - dens)) * SPREAD;
      const r = h32(seedK, Math.round(x * 1000), Math.round(y * 1000), 2);
      if (r > (0.03 / spacing) * (1 - (T.style.linear || 0) * 0.75)) continue;
      const side = h32(seedK, Math.round(x * 1000), Math.round(y * 1000), 3) < 0.5 ? -1 : 1;
      seeds.push({ x, y, a: ang + side * (T.style.planned ? Math.PI / 2 + (h32(seedK, sn++, 4) - 0.5) * 0.55 : 1.15 + (h32(seedK, sn++, 4) - 0.5) * 0.9), depth: 1, nid: seedK + sn * 7 });
    }
  }
  // grow
  const step = 0.022;
  let guard = 0;
  while (seeds.length && guard++ < 2600) {
    const s = seeds.shift();
    const dens = T.density(s.x, s.y);
    const lane = dens > 0.7 && h32(s.nid, 5) < T.style.lane;
    const sw = T.style.street * (0.85 + 0.3 * h32(s.nid, 15));
    const street = { name: localName(T.seed, s.nid), pts: [s.x, s.y], w: (lane ? 0.0055 : dens > 0.4 ? 0.0095 : 0.0085) * sw, lane };
    let x = s.x, y = s.y, a = s.a, len = 0, since = 0;
    const maxLen = (0.12 + 0.55 * h32(s.nid, 6)) * (dens > 0.6 ? 0.7 : 1.2);
    // planned towns: straighter streets, but still laid out by hand, not ruled
    const wind = T.style.planned ? 0.07 : 0.08 + T.wind * (dens > 0.6 ? 1.6 : 0.8);
    let joined = false;
    while (len < maxLen) {
      a += (vnoise(x * 9, y * 9, s.nid & 0xffff) - 0.5) * wind;
      const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      if (!T.inMask(nx, ny)) break;
      if (!inChunk(nx, ny) && !s.edge) break;
      if (!inChunk(nx, ny) && s.edge && len > 0.02) break;
      if (wet(nx, ny)) break; // local streets stop at the water
      // join a street that comes close (not the one just left)
      let hit = null;
      // keep a block's depth between streets: join a street that comes within ~26 m
      const JOIN = 0.024 + 0.012 * (1 - dens);
      segs.near(nx, ny, JOIN + 0.01, (sg) => {
        if (sg.street === street) return;
        if (len < 0.03 && Math.hypot(sg.ax - s.x, sg.ay - s.y) < 0.04) return;
        const d = segDist(nx, ny, sg);
        if (d.d < JOIN) { hit = d; return false; }
      });
      if (hit) { segs.add(x, y, hit.qx, hit.qy, street.w, street); street.pts.push(hit.qx, hit.qy); joined = true; break; }
      segs.add(x, y, nx, ny, street.w, street);
      street.pts.push(nx, ny);
      x = nx; y = ny; len += step; since += step;
      const bgap = (0.045 + 0.12 * (1 - dens) * (1 - dens) + 0.04 * h32(s.nid, Math.round(len * 1000), 1)) * SPREAD;
      if (since > bgap && s.depth < (dens > 0.6 ? 6 : 4)) {
        since = 0;
        for (const side of [-1, 1]) {
          if (h32(s.nid, Math.round(len * 1000), side + 5) < 0.55 * T.branchy + 0.2)
            seeds.push({ x, y, a: a + side * (T.style.planned ? Math.PI / 2 + (h32(s.nid, Math.round(len * 1000), side + 9) - 0.5) * 0.5 : 1.25 + (h32(s.nid, Math.round(len * 1000), side + 9) - 0.5) * 0.8), depth: s.depth + 1, nid: s.nid * 31 + Math.round(len * 1000) * (side + 3) });
        }
      }
    }
    if (street.pts.length >= 4) { street.joined = joined; streets.push(street); }
  }
  return { X0, Y0, X1, Y1, segs, streets, mains: mainSegs };
}

// ---------------------------------------------------------------- open land and buildings for a chunk
function rectAt(x, y, ux, uy, w, d) { // centre, along-unit, width (along), depth
  const nx = -uy, ny = ux, hw = w / 2, hd = d / 2;
  return [[x - ux * hw - nx * hd, y - uy * hw - ny * hd], [x + ux * hw - nx * hd, y + uy * hw - ny * hd], [x + ux * hw + nx * hd, y + uy * hw + ny * hd], [x - ux * hw + nx * hd, y - uy * hw + ny * hd]];
}
function rectsOverlap(a, b) {
  for (const P of [a, b]) for (let i = 0; i < 4; i++) {
    const ex = P[(i + 1) % 4][0] - P[i][0], ey = P[(i + 1) % 4][1] - P[i][1];
    const nx = -ey, ny = ex;
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const q of a) { const v = q[0] * nx + q[1] * ny; amin = Math.min(amin, v); amax = Math.max(amax, v); }
    for (const q of b) { const v = q[0] * nx + q[1] * ny; bmin = Math.min(bmin, v); bmax = Math.max(bmax, v); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}
function blob(x, y, r, seed, n = 9) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const rr = r * (0.7 + 0.55 * h32(seed, k)); out.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
  return out;
}
function inPoly(p, x, y) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) ins = !ins;
  return ins;
}

export function detail(T, cx, cy, world) {
  const C = chunk(T, cx, cy, world);
  if (C.detail) return C.detail;
  // streets of this chunk and its neighbours, for collisions
  const all = new SegHash(0.03, [C.X0 - 0.15, C.Y0 - 0.15, C.X1 + 0.15, C.Y1 + 0.15]);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const N = dx || dy ? chunk(T, cx + dx, cy + dy, world) : C;
    for (const s of N.segs.segs) all.add(s.ax, s.ay, s.bx, s.by, s.w, s.street);
  }
  for (const r of world.riversIndex.query(C.X0 - 0.05, C.Y0 - 0.05, C.X1 + 0.05, C.Y1 + 0.05)) {
    if (r.a1 < 800) continue;
    const q = r.p, w = Math.min(0.32, 0.00028 * Math.sqrt(r.a1)) + 0.012;
    for (let i = 2; i < q.length; i += 2) all.add(q[i - 2], q[i - 1], q[i], q[i + 1], w, { river: true });
  }
  const seedK = T.seed ^ (cx * 7349 + cy * 15731);
  const areas = [];
  const blocked = []; // polygons where nothing is built
  // TPF compounds: nothing else is built inside their fences
  for (const cp of compoundsIn(world, C.X0, C.Y0, C.X1, C.Y1)) blocked.push(cp.yard);
  // the old square
  if (inPoly([[C.X0, C.Y0], [C.X1, C.Y0], [C.X1, C.Y1], [C.X0, C.Y1]], T.p.x, T.p.y)) {
    areas.push({ kind: 'plaza', poly: T.square });
    blocked.push(T.square);
  }
  // parks: where a slow noise is high, away from the core
  const parkN = (x, y) => vnoise(x * 2.6 + 11, y * 2.6, T.seed + 101);
  for (let k = 0; k < 3; k++) {
    const x = C.X0 + CH * (0.15 + 0.7 * h32(seedK, k, 1)), y = C.Y0 + CH * (0.15 + 0.7 * h32(seedK, k, 2));
    if (!T.inMask(x, y) || parkN(x, y) < 0.78 - 0.1 * T.style.park || Math.hypot(x - T.p.x, y - T.p.y) < T.squareR * 2) continue;
    const r = 0.06 + 0.12 * h32(seedK, k, 3);
    // only on open ground: no street or river through it
    let clear = true;
    all.near(x, y, r * 1.3, (s) => { if (segDist(x, y, s).d < r * 1.15 + s.w / 2) { clear = false; return false; } });
    if (!clear) continue;
    const poly = blob(x, y, r, seedK + k, 11);
    areas.push({ kind: 'park', poly, paths: parkPaths(poly, x, y, seedK + k), pond: r > 0.11 && h32(seedK, k, 7) < 0.4 ? blob(x + r * 0.2, y - r * 0.1, r * 0.22, seedK + k + 3, 8) : null });
    blocked.push(poly);
  }
  const buildings = [];
  const bh = new Map();
  const bkey = (x, y) => Math.floor(x / 0.05) * 73856093 ^ Math.floor(y / 0.05) * 19349663;
  const tryPlace = (r, kind, pad = 0.0004, onSquare = false) => {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    // a chunk owns footprints in [X0+E, X1+E]: the strip at its left/top edge belongs to
    // the neighbour, so buildings of two chunks can never overlap and no gap shows
    const E = 0.016;
    for (const [x, y] of r) {
      if (x < C.X0 + E || x > C.X1 + E || y < C.Y0 + E || y > C.Y1 + E) return no('edge');
      if (!T.inMask(x, y)) return no('mask');
      mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y);
    }
    const cx2 = (mnx + mxx) / 2, cy2 = (mny + mxy) / 2;
    for (const b of blocked) if ((!onSquare || b !== T.square) && (inPoly(b, cx2, cy2) || r.some(([x, y]) => inPoly(b, x, y)))) return no('open');
    // clear of every street
    let ok = true;
    const half = Math.hypot(mxx - mnx, mxy - mny) / 2;
    all.near(cx2, cy2, half + 0.02, (s) => {
      if (segDist(cx2, cy2, s).d > s.w / 2 + half + pad) return; // far: cannot touch
      for (let i = 0; i < 4; i++) if (segDist(r[i][0], r[i][1], s).d < s.w / 2 + pad) { ok = false; return false; }
      // the street must not pass through the footprint
      for (let i = 0; i < 4; i++) if (segCross(r[i][0], r[i][1], r[(i + 1) % 4][0], r[(i + 1) % 4][1], s.ax, s.ay, s.bx, s.by)) { ok = false; return false; }
    });
    if (!ok) return no(kind + ':street');
    for (let gy = Math.floor(mny / 0.05) - 1; gy <= Math.floor(mxy / 0.05) + 1; gy++) for (let gx = Math.floor(mnx / 0.05) - 1; gx <= Math.floor(mxx / 0.05) + 1; gx++) {
      for (const o of bh.get(gx * 73856093 ^ gy * 19349663) || []) if (rectsOverlap(o.r, r)) return no(kind + ':overlap');
    }
    const b = { r, kind, x: cx2, y: cy2 };
    STATS[kind + ':ok'] = (STATS[kind + ':ok'] || 0) + 1;
    buildings.push(b);
    const k = bkey(cx2, cy2);
    if (!bh.has(k)) bh.set(k, []);
    bh.get(k).push(b);
    return true;
  };
  // a church on the square
  // (on the square or at its edge, wherever no street runs: the main streets meet on the square)
  if (areas.some((a) => a.kind === 'plaza')) {
    const ang = h32(T.seed, 81) * Math.PI;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const nw = T.big ? 0.034 : 0.022, nd = T.big ? 0.014 : 0.01, tw = T.big ? 0.008 : 0.006, to = nw / 2 + tw / 2 + 0.0006; // the tower at the west end
    for (let k = 0; k < 24; k++) {
      const a2 = h32(T.seed, 82) * Math.PI * 2 + (k % 12) * (Math.PI / 6), off = T.squareR * (k < 12 ? 0.45 : 1.1);
      const cxs = T.p.x + Math.cos(a2) * off, cys = T.p.y + Math.sin(a2) * off;
      if (!tryPlace(rectAt(cxs, cys, ux, uy, nw, nd), 'church', 0.002, true)) continue;
      tryPlace(rectAt(cxs - ux * to, cys - uy * to, ux, uy, tw, tw), 'church', 0.0004, true);
      break;
    }
  }
  // buildings along every street in the chunk, both sides
  const streetsHere = [...C.mains.map((s) => ({ pts: [s.ax, s.ay, s.bx, s.by], w: s.w, main: true, ref: s.street })), ...C.streets];
  let n = 0;
  for (const st of streetsHere) {
    const q = st.pts;
    for (let i = 2; i < q.length; i += 2) {
      const ax = q[i - 2], ay = q[i - 1], bx = q[i], by = q[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-4) continue;
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      for (const side of [-1, 1]) {
        let t = h32(seedK, n++, 1) * 0.006;
        while (t < L) {
          const x = ax + ux * t, y = ay + uy * t;
          if (!T.inMask(x, y)) { t += 0.01; continue; }
          const dens = T.density(x, y);
          const ind = !T.big ? false : vnoise(x * 1.7 + 40, y * 1.7, T.seed + 7) > 0.82 - 0.08 * T.style.industry && dens < 0.5;
          const ps = T.style.plot;
          let w, d, set, gap, kind = 'house';
          const r1 = h32(seedK, n++, 2), r2 = h32(seedK, n++, 3);
          if (ind) { w = (0.03 + 0.06 * r1) * ps; d = (0.022 + 0.035 * r2) * ps; set = 0.012; gap = 0.012 + 0.012 * r1; kind = 'industrial'; }
          else if (dens > T.style.rows) { w = Math.max(0.0065, (0.007 + 0.011 * r1) * ps); d = Math.max(0.009, (0.010 + 0.008 * r2) * ps); set = 0.0008; gap = r2 < 0.85 ? 0.0002 : 0.003; kind = 'row'; }
          else if (dens > T.style.rows * 0.62) { w = (0.014 + 0.03 * r1) * ps; d = (0.010 + 0.007 * r2) * ps; set = 0.003 + 0.004 * r2; gap = (0.004 + 0.008 * r1) * SPREAD; kind = 'flat'; }
          else { w = (0.007 + 0.006 * r1) * ps; d = (0.007 + 0.005 * r2) * ps; set = (0.004 + 0.005 * r2) * ps * SPREAD; gap = (0.005 + 0.012 * r1) * ps * SPREAD; kind = 'house'; }
          // now and then a car park, a school or a shop with its car park
          const r3 = h32(seedK, n++, 4);
          const mx = x + ux * w / 2, my = y + uy * w / 2;
          const off = st.w / 2 + set + d / 2;
          const px = mx + side * -uy * off, py = my + side * ux * off;
          if (kind !== 'row' && r3 < 0.012 && dens > 0.25) {
            // school with a pitch behind
            const sw = 0.045, sd = 0.016;
            const sx = mx + side * -uy * (st.w / 2 + 0.006 + sd / 2), sy = my + side * ux * (st.w / 2 + 0.006 + sd / 2);
            if (tryPlace(rectAt(sx, sy, ux, uy, sw, sd), 'school', 0.004)) {
              const pd = 0.04;
              const fx = mx + side * -uy * (st.w / 2 + 0.006 + sd + 0.006 + pd / 2), fy = my + side * ux * (st.w / 2 + 0.006 + sd + 0.006 + pd / 2);
              const pitch = rectAt(fx, fy, ux, uy, 0.06, pd);
              if (pitch.every(([x2, y2]) => T.inMask(x2, y2))) { areas.push({ kind: 'pitch', poly: pitch }); blocked.push(pitch); }
              t += sw + 0.01;
              continue;
            }
          } else if (r3 < 0.028 && dens > 0.3 && st.main) {
            // supermarket with a car park
            const sw = 0.04, sd = 0.03;
            const sx = mx + side * -uy * (st.w / 2 + 0.03 + sd / 2), sy = my + side * ux * (st.w / 2 + 0.03 + sd / 2);
            if (tryPlace(rectAt(sx, sy, ux, uy, sw, sd), 'shop', 0.004)) {
              const pk = rectAt(mx + side * -uy * (st.w / 2 + 0.014), my + side * ux * (st.w / 2 + 0.014), ux, uy, sw, 0.022);
              areas.push({ kind: 'parking', poly: pk }); blocked.push(pk);
              t += sw + 0.008;
              continue;
            }
          } else if (r3 < 0.05 && dens > 0.35 && kind === 'flat') {
            const pk = rectAt(px, py, ux, uy, w, d);
            if (tryPlace(pk, 'parking-test')) { buildings.pop(); areas.push({ kind: 'parking', poly: pk }); blocked.push(pk); t += w + gap; continue; }
          }
          let placed = tryPlace(rectAt(px, py, ux, uy, w, d), kind);
          if (!placed && (kind === 'row' || kind === 'flat')) {
            // squeeze a narrower building into the plot, as old towns do
            const w2 = w * 0.55, d2 = d * 0.85, off2 = st.w / 2 + set + d2 / 2;
            const mx2 = x + ux * w2 / 2, my2 = y + uy * w2 / 2;
            placed = tryPlace(rectAt(mx2 + side * -uy * off2, my2 + side * ux * off2, ux, uy, w2, d2), kind);
            if (placed) { t += w2 + gap; continue; }
          }
          if (placed) {
            if (kind === 'house' && h32(seedK, n++, 5) < 0.3) {
              // garage or shed beside the house
              const gx = px + ux * (w / 2 + 0.003), gy = py + uy * (w / 2 + 0.003);
              tryPlace(rectAt(gx, gy, ux, uy, 0.0035, 0.006), 'shed', 0.002);
            }
            if (kind === 'row' && h32(seedK, n++, 6) < 0.45) {
              // back building in the yard
              const bo = off + d / 2 + 0.006;
              tryPlace(rectAt(mx + side * -uy * bo, my + side * ux * bo, ux, uy, w * 0.7, 0.006), 'shed', 0.001);
            }
          }
          t += w + gap;
        }
      }
    }
  }
  // dense parts: fill the yards and backs of plots, as old town centres are packed
  for (let gy = C.Y0 + 0.008; gy < C.Y1; gy += 0.014) {
    for (let gx = C.X0 + 0.008 + ((Math.round(gy * 1000) % 2) * 0.007); gx < C.X1; gx += 0.014) {
      const dens = T.density(gx, gy);
      if (dens < T.style.rows * 0.95 || !T.inMask(gx, gy)) continue;
      // face the nearest street; only the backs of plots on it, not the middle of a block
      let best = null, bd = 0.035;
      all.near(gx, gy, 0.035, (s) => { if (s.street?.river) return; const d = segDist(gx, gy, s); if (d.d < bd) { bd = d.d; best = s; } });
      if (!best || bd < 0.018) continue;
      const L = Math.hypot(best.bx - best.ax, best.by - best.ay) || 1;
      const ux = (best.bx - best.ax) / L, uy = (best.by - best.ay) / L;
      const r1 = h32(seedK, Math.round(gx * 2000), Math.round(gy * 2000), 31), r2 = h32(seedK, Math.round(gx * 2000), Math.round(gy * 2000), 32);
      if (r1 < 0.12) continue; // the odd yard stays open
      tryPlace(rectAt(gx, gy, ux, uy, (0.007 + 0.008 * r2) * T.style.plot, (0.006 + 0.006 * r1) * T.style.plot), r2 < 0.7 ? 'row' : 'shed', 0.002);
    }
  }
  // footpaths: short links between dead-end streets and nearby streets
  const paths = [];
  for (const st of C.streets) {
    if (st.joined) continue;
    const q = st.pts, ex = q[q.length - 2], ey = q[q.length - 1];
    let best = null, bd = 0.09;
    all.near(ex, ey, 0.09, (s) => { if (s.street === st || s.street?.river) return; const d = segDist(ex, ey, s); if (d.d < bd && d.d > 0.02) { bd = d.d; best = d; } });
    if (best && h32(strHash(st.name), 3) < 0.6) paths.push([ex, ey, best.qx, best.qy]);
  }
  // roundabouts where main streets meet
  const rounds = [];
  for (const s of C.mains) {
    if (!s.street || s.street.regional) continue;
    const x = s.bx, y = s.by;
    if (x < C.X0 || x > C.X1 || y < C.Y0 || y > C.Y1) continue;
    let meet = 0;
    T.art.near(x, y, 0.02, (o) => { if (o.street !== s.street && segDist(x, y, o).d < 0.004) meet++; });
    if (meet >= 2 && h32(Math.round(x * 1000), Math.round(y * 1000), 9) < 0.5 && T.density(x, y) < 0.6) rounds.push({ x, y, r: 0.012 + 0.008 * h32(Math.round(x * 1000), 3) });
  }
  // a short street with no house on it (a stub left where the plots along it were taken by
  // others or by open land) is left out, with the footpaths that lead to it
  const near = (st, x, y, r) => { const q = st.pts; for (let i = 2; i < q.length; i += 2) if (segDist(x, y, { ax: q[i - 2], ay: q[i - 1], bx: q[i], by: q[i + 1] }).d < r) return true; return false; };
  const stubs = new Set();
  for (const st of C.streets) {
    let L = 0; for (let i = 2; i < st.pts.length; i += 2) L += Math.hypot(st.pts[i] - st.pts[i - 2], st.pts[i + 1] - st.pts[i - 1]);
    if (L < 0.25 && !buildings.some((b) => near(st, b.x, b.y, st.w / 2 + 0.035))) stubs.add(st);
  }
  const paths2 = stubs.size ? paths.filter(([ax, ay, bx, by]) => ![...stubs].some((st) => near(st, ax, ay, st.w) || near(st, bx, by, st.w))) : paths;
  C.detail = { areas, buildings, paths: paths2, rounds, stubs };
  return C.detail;
}

function parkPaths(poly, x, y, seed) {
  const out = [];
  const n = 2 + Math.floor(h32(seed, 21) * 3);
  for (let k = 0; k < n; k++) {
    const e = poly[Math.floor(h32(seed, 22, k) * poly.length)];
    const mx = (e[0] + x) / 2 + (h32(seed, 23, k) - 0.5) * 0.04, my = (e[1] + y) / 2 + (h32(seed, 24, k) - 0.5) * 0.04;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push((1 - t) * (1 - t) * e[0] + 2 * (1 - t) * t * mx + t * t * x, (1 - t) * (1 - t) * e[1] + 2 * (1 - t) * t * my + t * t * y);
    }
    out.push(pts);
  }
  return out;
}

export { CH };
