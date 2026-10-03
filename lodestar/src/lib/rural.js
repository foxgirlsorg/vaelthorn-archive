// The countryside at close zoom: farmsteads along country roads and the few houses of
// each hamlet. Positions come from hashes of road segments, so every tile agrees.
import { h32 } from './town.js';

function inRingList(rings, x, y) {
  for (const r of rings) {
    const p = r.p;
    if (x < r.b[0] || x > r.b[2] || y < r.b[1] || y > r.b[3]) continue;
    let ins = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
      const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    if (ins) return true;
  }
  return false;
}
function rect(x, y, ux, uy, w, d) {
  const nx = -uy, ny = ux, hw = w / 2, hd = d / 2;
  return [[x - ux * hw - nx * hd, y - uy * hw - ny * hd], [x + ux * hw - nx * hd, y + uy * hw - ny * hd], [x + ux * hw + nx * hd, y + uy * hw + ny * hd], [x - ux * hw + nx * hd, y - uy * hw + ny * hd]];
}

// farmsteads and hamlet houses touching the box
export function ruralIn(world, x0, y0, x1, y1) {
  const M = 0.2;
  const urban = world.urbanIndex.query(x0 - M, y0 - M, x1 + M, y1 + M);
  const lakes = world.lakesIndex.query(x0 - M, y0 - M, x1 + M, y1 + M);
  const out = { farms: [], tracks: [] };
  for (const r of world.roadsIndex.query(x0 - M, y0 - M, x1 + M, y1 + M)) {
    if (r.c >= 3) continue; // farms sit on country roads, not on motorways or national routes
    const p = r.p;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 0.05) continue;
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      const key = Math.round(ax * 100) * 7919 + Math.round(ay * 100);
      const n = Math.floor(L / 0.35);
      for (let k = 0; k <= n; k++) {
        if (h32(key, k, 1) > 0.45) continue;
        const t = (k + h32(key, k, 2)) * 0.35;
        if (t > L) break;
        const side = h32(key, k, 3) < 0.5 ? -1 : 1;
        const back = 0.03 + 0.07 * h32(key, k, 4);
        const rx = ax + ux * t, ry = ay + uy * t;
        const fx = rx - uy * back * side, fy = ry + ux * back * side;
        if (fx < x0 - M || fx > x1 + M || fy < y0 - M || fy > y1 + M) continue;
        if (inRingList(urban, fx, fy) || inRingList(lakes, fx, fy) || !world.isLoaded(fx, fy)) continue;
        // farmhouse, then barns turned to the yard
        const a = Math.atan2(uy, ux) + (h32(key, k, 5) - 0.5) * 0.5;
        const vx = Math.cos(a), vy = Math.sin(a);
        const bld = [rect(fx, fy, vx, vy, 0.012 + 0.004 * h32(key, k, 6), 0.009)];
        const nb = 1 + Math.floor(h32(key, k, 7) * 3);
        for (let q = 0; q < nb; q++) {
          const ox = (q % 2 ? 1 : -1) * (0.02 + 0.006 * q), oy = 0.016 + 0.008 * Math.floor(q / 2);
          const cx = fx + vx * ox - vy * oy * side, cy = fy + vy * ox + vx * oy * side;
          bld.push(rect(cx, cy, vx, vy, 0.02 + 0.015 * h32(key, k, 10 + q), 0.011 + 0.006 * h32(key, k, 20 + q)));
        }
        out.farms.push(bld);
        // the farm track bends a little on its way to the yard
        const bend = (h32(key, k, 8) - 0.5) * back * 0.5;
        out.tracks.push([rx, ry, (rx + fx) / 2 + ux * bend, (ry + fy) / 2 + uy * bend, fx, fy]);
      }
    }
  }
  // hamlets: a handful of houses round the hamlet's point
  for (const pl of world.places) {
    if (pl.k !== 'hamlet' || pl.x < x0 - M || pl.x > x1 + M || pl.y < y0 - M || pl.y > y1 + M) continue;
    const key = Math.round(pl.x * 100) * 31 + Math.round(pl.y * 100);
    const n = 3 + Math.floor(h32(key, 1) * 6);
    for (let k = 0; k < n; k++) {
      const a = h32(key, k, 2) * Math.PI * 2, d = 0.02 + 0.06 * h32(key, k, 3);
      const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
      const b = h32(key, k, 4) * Math.PI;
      out.farms.push([rect(x, y, Math.cos(b), Math.sin(b), 0.01 + 0.005 * h32(key, k, 5), 0.008)]);
    }
  }
  return out;
}
