// What a building must not stand on: the country's roads, the towns' streets, rivers, lakes, ponds
// and the sea, at the width they are drawn close in. Used by overlaps.mjs.
import { riverMinAcc } from '../../src/lib/style.js';

const REAL = { 4: 0.015, 3: 0.0115, 2: 0.0095, 1: 0.0075, 0.5: 0.006 }; // as render.js draws them close in
const G = 0.05; // km per grid cell

// render.js smooth(): the line as drawn close in
function smooth(f) {
  let p = f.p;
  for (let it = 0; it < 2; it++) {
    if (p.length < 6) break;
    const o = [p[0], p[1]];
    for (let i = 0; i < p.length - 2; i += 2) o.push(0.75 * p[i] + 0.25 * p[i + 2], 0.75 * p[i + 1] + 0.25 * p[i + 3], 0.25 * p[i] + 0.75 * p[i + 2], 0.25 * p[i + 1] + 0.75 * p[i + 3]);
    o.push(p[p.length - 2], p[p.length - 1]);
    p = o;
  }
  return p;
}

// squared distance from point p to segment ab
function d2PS(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px, ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}
function cross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) !== o(ax, ay, bx, by, dx, dy) && o(cx, cy, dx, dy, ax, ay) !== o(cx, cy, dx, dy, bx, by);
}
export function inPoly(x, y, p) { // flat ring
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// how far a polygon (a building's 4 corners, or a car park's) is from segment ab: 0 if they touch
function quadSeg(q, ax, ay, bx, by) {
  let best = Infinity;
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length];
    if (cross(x1, y1, x2, y2, ax, ay, bx, by)) return 0;
    best = Math.min(best, d2PS(x1, y1, ax, ay, bx, by), d2PS(ax, ay, x1, y1, x2, y2), d2PS(bx, by, x1, y1, x2, y2));
  }
  if (inPoly(ax, ay, q.flat())) return 0;
  return Math.sqrt(best);
}

// lines: [{ p: flat array, h: half width in km }]; areas: flat rings a building may not touch
export function makeClash(lines, areas, sea, G = 0.05) {
  const grid = new Map();
  const add = (k, v) => { let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(v); };
  for (const L of lines) for (let i = 0; i + 3 < L.p.length; i += 2) {
    const ax = L.p[i], ay = L.p[i + 1], bx = L.p[i + 2], by = L.p[i + 3], r = L.h, seg = [ax, ay, bx, by, r, L.kind];
    for (let gy = Math.floor((Math.min(ay, by) - r) / G); gy <= Math.floor((Math.max(ay, by) + r) / G); gy++)
      for (let gx = Math.floor((Math.min(ax, bx) - r) / G); gx <= Math.floor((Math.max(ax, bx) + r) / G); gx++) add(gx * 100003 + gy, seg);
  }
  const agrid = new Map();
  for (const A of areas) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < A.p.length; i += 2) { x0 = Math.min(x0, A.p[i]); y0 = Math.min(y0, A.p[i + 1]); x1 = Math.max(x1, A.p[i]); y1 = Math.max(y1, A.p[i + 1]); }
    for (let gy = Math.floor(y0 / 1); gy <= Math.floor(y1 / 1); gy++) for (let gx = Math.floor(x0 / 1); gx <= Math.floor(x1 / 1); gx++) {
      const k = gx * 100003 + gy; let l = agrid.get(k); if (!l) agrid.set(k, (l = [])); l.push(A);
    }
  }
  // what the building q stands on, or null: a line it reaches into, a corner in water, or out at sea
  return (q) => {
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    const seen = new Set();
    for (let gy = Math.floor(Math.min(...ys) / G); gy <= Math.floor(Math.max(...ys) / G); gy++)
      for (let gx = Math.floor(Math.min(...xs) / G); gx <= Math.floor(Math.max(...xs) / G); gx++)
        for (const s of grid.get(gx * 100003 + gy) || []) {
          if (seen.has(s)) continue; seen.add(s);
          if (quadSeg(q, s[0], s[1], s[2], s[3]) < s[4]) return s[5];
        }
    // a corner or the middle in water
    const pts = [...q, [q.reduce((a, p) => a + p[0], 0) / q.length, q.reduce((a, p) => a + p[1], 0) / q.length]];
    for (const [x, y] of pts) {
      for (const A of agrid.get(Math.floor(x) * 100003 + Math.floor(y)) || []) if (inPoly(x, y, A.p)) return A.kind;
      if (sea && sea(x, y)) return 'sea';
    }
    return null;
  };
}

// the world's lines and water, as drawn close in
export function worldLines(world) {
  const lines = [], areas = [];
  for (const r of world.roads) if (!r.deleted) lines.push({ p: smooth(r), h: REAL[r.c] / 2, kind: 'road' });
  const minAcc = riverMinAcc(13);
  for (const r of world.rivers) {
    if (r.a1 < minAcc) continue;
    const ra = (r.a0 + r.a1 * 2) / 3;
    lines.push({ p: smooth(r), h: Math.max(0.014, Math.min(0.32, 0.00028 * Math.sqrt(ra))) / 2 + 0.002, kind: 'river' }); // as drawn (render.js), and 2 m of bank
  }
  for (const l of world.lakes) areas.push({ p: l.p, kind: 'lake' });
  // the sea: outside every land ring (even-odd, as the land is drawn)
  const landIdx = world.landIndex;
  const sea = (x, y) => {
    let n = 0;
    for (const f of landIdx.query(x, y, x, y)) if (inPoly(x, y, f.p)) n++;
    return n % 2 === 0;
  };
  return { lines, areas, sea };
}
