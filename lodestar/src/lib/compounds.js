// Footprints of the TPF sites: a fenced yard and buildings shaped by what the site was.
import { h32, strHash } from './town.js';

const CACHE = new Map();
const SIZE = { // yard width, depth (km)
  Headquarters: [0.16, 0.11], Records: [0.12, 0.09], Signals: [0.07, 0.07], 'Laboratory (Project SCION)': [0.28, 0.2],
  'Transit depot': [0.26, 0.07], Barracks: [0.2, 0.15], Detention: [0.12, 0.09], Garrison: [0.32, 0.22], 'Historic site': [0.06, 0.05],
  'Field station': [0.09, 0.07], Training: [0.36, 0.26],
};

function rect(x, y, ux, uy, w, d) {
  const nx = -uy, ny = ux, hw = w / 2, hd = d / 2;
  return [[x - ux * hw - nx * hd, y - uy * hw - ny * hd], [x + ux * hw - nx * hd, y + uy * hw - ny * hd], [x + ux * hw + nx * hd, y + uy * hw + ny * hd], [x - ux * hw + nx * hd, y - uy * hw + ny * hd]];
}

export function compoundOf(site) {
  const key = site.id || site.name;
  let c = CACHE.get(key);
  if (c) return c;
  const seed = strHash(key);
  const [W, D] = SIZE[site.type] || [0.1, 0.08];
  const a = h32(seed, 1) * Math.PI;
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const P = (u, v) => [site.x + ux * u + nx * v, site.y + uy * u + ny * v];
  const R = (u, v, w, d) => rect(site.x + ux * u + nx * v, site.y + uy * u + ny * v, ux, uy, w, d);
  const yard = [P(-W / 2, -D / 2), P(W / 2, -D / 2), P(W / 2, D / 2), P(-W / 2, D / 2)];
  const b = [];
  switch (site.type) {
    case 'Laboratory (Project SCION)':
      if (site.id === 'site41') {
        // the old sanatorium: a long main block, two ward wings, a chapel and the boiler house
        b.push(R(0, -0.03, 0.17, 0.022), R(-0.075, 0.015, 0.02, 0.07), R(0.075, 0.015, 0.02, 0.07), R(0, 0.06, 0.03, 0.018), R(0.11, -0.07, 0.016, 0.012));
      } else {
        b.push(R(-0.05, -0.03, 0.12, 0.03), R(0.06, 0.02, 0.05, 0.08), R(-0.06, 0.05, 0.06, 0.03), R(0.1, -0.07, 0.02, 0.02));
      }
      break;
    case 'Headquarters':
      b.push(R(0, 0, 0.11, 0.06), R(0, 0, 0.05, 0.025)); // a block round an inner court
      break;
    case 'Transit depot':
      b.push(R(-0.04, -0.012, 0.15, 0.018), R(0.09, 0.012, 0.03, 0.02), R(-0.1, 0.015, 0.025, 0.02));
      break;
    case 'Barracks':
    case 'Garrison':
      for (let k = 0; k < 4; k++) b.push(R(-W / 2 + 0.03 + k * (W - 0.06) / 3, -D / 2 + 0.025, 0.05, 0.016));
      b.push(R(0, D / 2 - 0.03, W * 0.5, 0.02), R(W / 2 - 0.03, 0, 0.025, 0.05));
      break;
    case 'Training':
      b.push(R(-W / 2 + 0.04, -D / 2 + 0.03, 0.05, 0.02), R(-W / 2 + 0.1, -D / 2 + 0.03, 0.04, 0.02));
      break;
    case 'Signals':
      b.push(R(-0.012, 0.01, 0.025, 0.015), R(0.018, -0.015, 0.008, 0.008));
      break;
    case 'Historic site':
      b.push(R(0, 0, 0.03, 0.022), R(0.018, -0.014, 0.01, 0.01));
      break;
    default:
      b.push(R(0, -D / 4, W * 0.6, 0.022), R(-W / 4, D / 4, W * 0.3, 0.018), R(W / 3, D / 5, 0.02, 0.02));
  }
  c = { yard, buildings: b, x: site.x, y: site.y, r: Math.hypot(W, D) / 2, ruin: site.type === 'Historic site' };
  CACHE.set(key, c);
  return c;
}

// the track from a compound's gate to the nearest road or street: it leaves the yard on the
// side facing the road, bends gently, and joins the first road or street it meets
function cross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t > 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}
function trackOf(world, site, c, streets = []) {
  if (c.track !== undefined && !streets.length) return c.track;
  // every road and street piece within 10 km, as [ax, ay, bx, by, motorway]
  const segs = [...streets];
  for (const r of world.roadsIndex.query(site.x - 10, site.y - 10, site.x + 10, site.y + 10)) {
    const p = r.p;
    for (let i = 2; i < p.length; i += 2) segs.push([p[i - 2], p[i - 1], p[i], p[i + 1], r.c >= 4]);
  }
  let best = null, bd = 10;
  for (const [ax, ay, bx, by, motorway] of segs) {
    if (motorway) continue; // a track never joins a motorway
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((site.x - ax) * dx + (site.y - ay) * dy) / l2));
    const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(qx - site.x, qy - site.y);
    if (d < bd) { bd = d; best = [qx, qy]; }
  }
  if (!best || bd <= c.r) { c.track = null; return null; }
  // the gate: where the line to the road leaves the yard
  let gx = site.x, gy = site.y;
  const Y = c.yard;
  for (let i = 0; i < Y.length; i++) {
    const [px, py] = Y[i], [qx, qy] = Y[(i + 1) % Y.length];
    const t = cross(site.x, site.y, best[0], best[1], px, py, qx, qy);
    if (t !== null) { gx = site.x + (best[0] - site.x) * t; gy = site.y + (best[1] - site.y) * t; }
  }
  // a gentle bend and a little wobble, never a ruler line
  const seed = strHash(site.id || site.name);
  const L = Math.hypot(best[0] - gx, best[1] - gy), ux = (best[0] - gx) / L, uy = (best[1] - gy) / L;
  // long tracks wind more: a bend of up to 400 m and a wander of up to 120 m
  const bend = (h32(seed, 61) < 0.5 ? -1 : 1) * Math.min(0.4, L * (0.06 + 0.06 * h32(seed, 62)));
  const amp = Math.min(0.12, L * 0.05), p1 = h32(seed, 63) * 6.3, p2 = h32(seed, 64) * 6.3;
  const w1 = 0.8 + 0.6 * h32(seed, 65), w2 = 0.45 + 0.25 * h32(seed, 66); // wavelengths of the wander, km
  const n = Math.max(6, Math.ceil(L / 0.02));
  const pts = [gx, gy];
  for (let k = 1; k <= n; k++) {
    // one long bend plus a slow wander, both fading out at the gate and at the road
    const t = k / n, fade = Math.sin(Math.PI * t);
    const off = k === n ? 0 : bend * fade + amp * fade * (0.7 * Math.sin((2 * Math.PI * t * L) / w1 + p1) + 0.3 * Math.sin((2 * Math.PI * t * L) / w2 + p2));
    const x = gx + ux * L * t - uy * off, y = gy + uy * L * t + ux * off;
    // join the first road or street on the way instead of crossing it
    const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
    let tc = null;
    for (const [ax, ay, bx, by, motorway] of segs) { if (motorway) continue; const tt = cross(lx, ly, x, y, ax, ay, bx, by); if (tt !== null && (tc === null || tt < tc)) tc = tt; } // a motorway it passes under
    if (tc !== null) { pts.push(lx + (x - lx) * tc, ly + (y - ly) * tc); break; }
    pts.push(x, y);
  }
  c.track = pts;
  return pts;
}

// a site inside a city is an ordinary building on an ordinary street: no fence, no yard,
// nothing that stands out; only sites in the country and in small towns get a compound
const URBAN = new Map();
function inCity(world, x, y) {
  const key = x + ',' + y;
  if (URBAN.has(key)) return URBAN.get(key);
  let ins = false;
  for (const u of world.urban) {
    if (!u.place || u.place.pop < 20000) continue;
    for (const r of u.rings) {
      if (x < r.b[0] || x > r.b[2] || y < r.b[1] || y > r.b[3]) continue;
      const q = r.p;
      for (let i = 0, k = q.length - 2; i < q.length; k = i, i += 2) {
        if ((q[i + 1] > y) !== (q[k + 1] > y) && x < ((q[k] - q[i]) * (y - q[i + 1])) / (q[k + 1] - q[i + 1]) + q[i]) ins = !ins;
      }
    }
    if (ins) break;
  }
  URBAN.set(key, ins);
  return ins;
}

// streetsNear(site): optional town streets near a site, as [ax, ay, bx, by], for the track
export function compoundsIn(world, x0, y0, x1, y1, streetsNear = null) {
  const out = [];
  for (const s of world.sites) {
    if (!s.tpf) continue;
    if (inCity(world, s.x, s.y)) continue;
    if (s.x < x0 - 4 || s.x > x1 + 4 || s.y < y0 - 4 || s.y > y1 + 4) continue;
    const c = compoundOf(s);
    trackOf(world, s, c, streetsNear ? streetsNear(s) : []);
    out.push(c);
  }
  return out;
}
