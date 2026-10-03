// Geometry helpers. All coordinates are kilometres: x east, y south.

export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return { d: Math.sqrt(qx * qx + qy * qy), t };
}

// Distance from point to polyline, with arc-length position of the closest point.
export function distPolyline(px, py, pts, cum) {
  let best = Infinity, s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const r = distSeg(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best) {
      best = r.d;
      s = cum[i] + r.t * (cum[i + 1] - cum[i]);
    }
  }
  return { d: best, s };
}

export function cumLength(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Midpoint displacement: makes a hand-drawn line irregular at every scale.
export function fractalize(pts, rand, rough = 0.18, minLen = 2, closed = false) {
  let cur = pts.map((p) => [p[0], p[1]]);
  for (let pass = 0; pass < 12; pass++) {
    const out = [];
    let changed = false;
    const n = closed ? cur.length : cur.length - 1;
    for (let i = 0; i < n; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      out.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len > minLen) {
        const off = (rand() - 0.5) * 2 * rough * len;
        out.push([(a[0] + b[0]) / 2 - (dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off]);
        changed = true;
      }
    }
    if (!closed) out.push(cur[cur.length - 1]);
    cur = out;
    if (!changed) break;
  }
  return cur;
}

export function chaikin(pts, iter = 2, closed = false) {
  let cur = pts;
  for (let k = 0; k < iter; k++) {
    if (cur.length < 3) return cur;
    const out = closed ? [] : [cur[0]];
    const n = closed ? cur.length : cur.length - 1;
    for (let i = 0; i < n; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (!closed) out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]).d;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol && mi > 0) {
      keep[mi] = 1;
      stack.push([a, mi], [mi, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function simplifyRing(ring, tol) {
  if (ring.length < 8) return ring;
  // split at the point farthest from the first so both halves are open lines
  let far = 0, fd = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = simplify(ring.slice(0, far + 1), tol);
  const b = simplify(ring.slice(far).concat([ring[0]]), tol);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

export function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

// Marching squares on a scalar grid (w*h, value at cell centres). Returns closed
// rings around regions where value >= iso. Grid is padded so every ring closes.
// cell size and origin convert grid to km.
export function contours(field, w, h, iso, cell = 1, ox = 0, oy = 0) {
  const W = w + 2, H = h + 2;
  const v = (i, j) => {
    i -= 1; j -= 1;
    if (i < 0 || j < 0 || i >= w || j >= h) return iso - 1e-3 - 1;
    return field[j * w + i];
  };
  const segs = new Map(); // key start -> [endKey, pts]
  const pos = new Map();
  const edgeKey = (i, j, dir) => (j * W + i) * 2 + dir; // dir 0: horizontal edge (i,j)-(i+1,j); 1: vertical (i,j)-(i,j+1)
  const edgePt = (i, j, dir) => {
    const a = v(i, j), b = dir === 0 ? v(i + 1, j) : v(i, j + 1);
    let t = (iso - a) / (b - a);
    if (!isFinite(t)) t = 0.5;
    t = Math.max(0, Math.min(1, t));
    const gx = i + (dir === 0 ? t : 0), gy = j + (dir === 1 ? t : 0);
    return [ox + (gx - 1 + 0.5) * cell, oy + (gy - 1 + 0.5) * cell];
  };
  const next = new Map();
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = v(i, j) >= iso, b = v(i + 1, j) >= iso, c = v(i + 1, j + 1) >= iso, d = v(i, j + 1) >= iso;
      const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T = edgeKey(i, j, 0), R = edgeKey(i + 1, j, 1), B = edgeKey(i, j + 1, 0), L = edgeKey(i, j, 1);
      const pts = { [T]: [i, j, 0], [R]: [i + 1, j, 1], [B]: [i, j + 1, 0], [L]: [i, j, 1] };
      // segments oriented so the inside is on the right
      let list;
      switch (code) {
        case 1: list = [[B, L]]; break;
        case 2: list = [[R, B]]; break;
        case 3: list = [[R, L]]; break;
        case 4: list = [[T, R]]; break;
        case 5: list = [[T, L], [B, R]]; break;
        case 6: list = [[T, B]]; break;
        case 7: list = [[T, L]]; break;
        case 8: list = [[L, T]]; break;
        case 9: list = [[B, T]]; break;
        case 10: list = [[L, B], [R, T]]; break;
        case 11: list = [[R, T]]; break;
        case 12: list = [[L, R]]; break;
        case 13: list = [[B, R]]; break;
        case 14: list = [[L, B]]; break;
      }
      for (const [s, e] of list) {
        next.set(s, e);
        if (!pos.has(s)) pos.set(s, edgePt(...pts[s]));
        if (!pos.has(e)) pos.set(e, edgePt(...pts[e]));
      }
    }
  }
  const rings = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring = [];
    let k = start;
    while (k !== undefined && !seen.has(k)) {
      seen.add(k);
      ring.push(pos.get(k));
      k = next.get(k);
    }
    if (ring.length > 2) rings.push(ring);
  }
  return rings;
}

export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    const n = k.length;
    if (n) {
      let i = 0;
      while (true) {
        let l = 2 * i + 1, r = l + 1, m = i;
        let mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  peekKey() { return this.k[0]; }
}
