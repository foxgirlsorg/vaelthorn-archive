// Step 1: height map, coastline, drainage, lakes, rivers.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { makeNoise, rng } from './lib/noise.mjs';
import { distSeg, cumLength, distPolyline, pointInPoly, fractalize, chaikin, contours, MinHeap } from './lib/geom.mjs';
import { WORLD, COAST, RANGES, RIVERS, S } from './design.mjs';

const OUT = new URL('./out/', import.meta.url);
const { w: W, h: H } = WORLD;
const N = W * H;
const nz = makeNoise('esteloria-terrain');
const nz2 = makeNoise('esteloria-detail');
const rand = rng('esteloria-lines');
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

// ---------------------------------------------------------------- coast
const coast = fractalize(COAST, rand, 0.14, 6);
const seaPoly = coast.concat([[-300, H + 400], [-300, 1150]]);
function coastSD(x, y) {
  let d = Infinity;
  for (let i = 0; i < coast.length - 1; i++) {
    const r = distSeg(x, y, coast[i][0], coast[i][1], coast[i + 1][0], coast[i + 1][1]).d;
    if (r < d) d = r;
  }
  return pointInPoly(x, y, seaPoly) ? -d : d;
}
// coarse SD grid (4 km), bilinear lookups; the fine detail comes from noise
const CS = 4, CW = Math.ceil(W / CS) + 2, CH = Math.ceil(H / CS) + 2;
const sdGrid = new Float32Array(CW * CH);
for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) sdGrid[j * CW + i] = coastSD(i * CS, j * CS);
function sdAt(x, y) {
  const gx = Math.max(0, Math.min(CW - 1.001, x / CS)), gy = Math.max(0, Math.min(CH - 1.001, y / CS));
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
  const a = sdGrid[j * CW + i], b = sdGrid[j * CW + i + 1], c = sdGrid[(j + 1) * CW + i], d = sdGrid[(j + 1) * CW + i + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
log('coast SD');

const landV = new Float32Array(N); // > 0 land
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    const wx = px + 52 * nz.fbm(px / 380, py / 380, 4) + 14 * nz.fbm(px / 90 + 5, py / 90, 3);
    const wy = py + 52 * nz.fbm(px / 380 + 11, py / 380 - 3, 4) + 14 * nz.fbm(px / 90 - 7, py / 90 + 2, 3);
    const rug = 1.25; // coast roughness
    let v = sdAt(wx, wy);
    v += rug * (11 * nz2.fbm(px / 30, py / 30, 5) + 3.5 * nz2.fbm(px / 6, py / 6, 3));
    // skerries and islands off the rugged coast
    if (v < 0 && v > -45) v += Math.max(0, nz2.ridged(px / 26, py / 26, 3) - 0.82) * 260 * rug * smooth(-45, -8, v);
    landV[y * W + x] = v;
  }
}
log('land field');

// distance field to a polyline within radius R: per cell distance and arc position
function distField(pts, R) {
  const cum = cumLength(pts);
  const d = new Float32Array(N).fill(Infinity), s = new Float32Array(N);
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - R)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const r = distSeg(x + 0.5, y + 0.5, ax, ay, bx, by);
      const i = y * W + x;
      if (r.d < d[i]) { d[i] = r.d; s[i] = cum[k] + r.t * (cum[k + 1] - cum[k]); }
    }
  }
  return { d, s, cum };
}

// ---------------------------------------------------------------- elevation
const ranges = RANGES.map((r) => { const pts = fractalize(r.pts, rand, 0.1, 8); return { ...r, pts, df: distField(pts, r.w * 2.5) }; });
log('range fields');
const elev = new Float32Array(N);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x, px = x + 0.5, py = y + 0.5;
    const lv = landV[i];
    if (lv <= 0) { elev[i] = -10 + lv * 6; continue; }
    const inland = Math.min(1, lv / 160);
    let e = 4 + 170 * Math.pow(inland, 0.8);
    e += (nz.fbm(px / 140, py / 140, 4) * 0.5 + 0.5) * 260 * Math.sqrt(inland);
    for (let k = 0; k < ranges.length; k++) {
      const r = ranges[k];
      const d = r.df.d[i];
      if (d > r.w * 2.5) continue;
      const dw = d + 0.45 * r.w * nz2.fbm(px / 160 + k, py / 160, 3);
      const along = 0.55 + 0.45 * (nz.fbm(r.df.s[i] / 120 + k * 3.1, 0.5, 3) * 0.5 + 0.5) * 1.6;
      const m = dw < 0 ? along : Math.exp(-(dw * dw) / (r.w * r.w)) * along;
      e += m * r.h * (0.35 + 0.65 * nz.ridged(px / 90 + k * 17, py / 90, 6)) * Math.min(1, inland * 2);
    }
    e += nz2.fbm(px / 14, py / 14, 4) * 22 * (0.4 + inland);
    const db = Math.hypot(px - 1000, py - 950);
    e -= 120 * Math.exp(-(db * db) / (430 * 430));
    elev[i] = Math.max(1 + lv * 0.2, e);
  }
}
log('elevation');

// ---------------------------------------------------------------- canon valleys
const rivers = {};
for (const r of RIVERS) {
  let pts = fractalize(r.pts, rand, 0.11, 3);
  pts = chaikin(pts, 2);
  rivers[r.id] = { ...r, pts, cum: cumLength(pts), df: distField(pts, 60) };
}
for (const r of RIVERS) {
  const rv = rivers[r.id];
  const L = rv.cum[rv.cum.length - 1];
  let mouthBed = 0;
  if (r.into) {
    const host = rivers[r.into];
    const end = rv.pts[rv.pts.length - 1];
    const s = distPolyline(end[0], end[1], host.pts, host.cum).s;
    mouthBed = host.bedAt(s);
  }
  rv.bedAt = (s) => mouthBed + (r.src - mouthBed) * Math.pow(1 - s / L, 1.3);
  const R = 60;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of rv.pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  for (let y = Math.max(0, Math.floor(miny - R)); y < Math.min(H, maxy + R); y++) {
    for (let x = Math.max(0, Math.floor(minx - R)); x < Math.min(W, maxx + R); x++) {
      const i = y * W + x;
      if (landV[i] <= 0) continue;
      const d = rv.df.d[i], s = rv.df.s[i];
      if (d > R) continue;
      const wall = Math.max(0, d - 1.5);
      const target = rv.bedAt(s) + wall * 1.8 + wall * wall * 0.08 + (nz.fbm(x / 22, y / 22, 3) * 0.5 + 0.5) * wall * 3 + nz2.fbm(x / 6, y / 6, 2) * 1.5;
      if (elev[i] > target) elev[i] = target;
    }
  }
}
log('valleys carved');

// ---------------------------------------------------------------- drainage (priority flood)
const land = new Uint8Array(N);
for (let i = 0; i < N; i++) land[i] = landV[i] > 0 ? 1 : 0;
const filled = new Float64Array(N);
const dir = new Int32Array(N).fill(-1);
const order = new Int32Array(N);
let nOrder = 0;
const done = new Uint8Array(N);
const heap = new MinHeap();
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i]) { done[i] = 1; continue; }
    let edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    for (let k = 0; k < 8 && !edge; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (!land[ny * W + nx]) edge = true;
    }
    if (edge) { filled[i] = elev[i]; done[i] = 1; heap.push(elev[i], i); dir[i] = -2; }
  }
}
while (heap.size) {
  const c = heap.pop();
  order[nOrder++] = c;
  const cx = c % W, cy = (c / W) | 0;
  for (let k = 0; k < 8; k++) {
    const nx = cx + DX[k], ny = cy + DY[k];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const n = ny * W + nx;
    if (done[n]) continue;
    done[n] = 1;
    // across a flat, a hair of slope down to where it drains: by a slightly uneven distance (diagonal
    // steps longer, and a slow noise), so the flat falls towards its outlet along wandering lines,
    // not in the grid's straight eight-way wave (which rivers would follow as straight runs)
    filled[n] = Math.max(elev[n], filled[c] + 1e-4 * (k < 4 ? 1 : Math.SQRT2) * (0.4 + (nz2.fbm(nx / 9, ny / 9, 2) * 0.5 + 0.5)));
    dir[n] = c;
    heap.push(filled[n], n);
  }
}
log('priority flood');

// lakes: filled basins deeper than a threshold, and big enough
const lake = new Uint8Array(N);
const basins = [];
{
  const cand = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (land[i] && filled[i] - elev[i] > 2.5) cand[i] = 1;
  const seen = new Uint8Array(N);
  const stack = [];
  for (let s = 0; s < N; s++) {
    if (!cand[s] || seen[s]) continue;
    const comp = [];
    stack.push(s); seen[s] = 1;
    let vol = 0;
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      vol += filled[c] - elev[c];
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (cand[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const c0 = comp[0];
    const cy = (c0 / W) | 0;
    // glacial north and the mountains keep more of their basins
    const wild = cy < 420 * S || elev[c0] > 700;
    basins.push({ comp, score: vol * (wild ? 3 : 1), wild });
  }
  basins.sort((a, b) => b.score - a.score);
  let wildKept = 0, tameKept = 0;
  for (const b of basins) {
    const ok = b.comp.length >= 4 && (b.wild ? wildKept++ < 70 : tameKept++ < 5);
    if (!ok) continue;
    // keep only the deepest part, so the shoreline is compact and the size plausible
    const maxArea = b.wild ? 900 : 260;
    let cells = b.comp;
    if (cells.length > maxArea) {
      cells = cells.slice().sort((p, q) => (filled[q] - elev[q]) - (filled[p] - elev[p])).slice(0, maxArea);
    }
    for (const c of cells) lake[c] = 1;
  }
  // everything else is filled: noise hollows become river flats, as erosion would leave them
  for (let i = 0; i < N; i++) if (land[i] && !lake[i]) elev[i] = Math.max(elev[i], filled[i] - (filled[i] - elev[i] > 0 ? 0.05 : 0));
}
log('lakes');

// ---------------------------------------------------------------- flow directions
// The flood above gives each cell to the neighbour it was reached from first. Across flats (filled
// hollows, valley floors) that is a wave spreading in the grid's eight directions, and rivers drawn
// on it run straight and turn at right angles where two waves meet. Water goes downhill instead:
// each cell drains to the lower neighbour (strictly lower in `filled`, so it still reaches the sea
// and nothing loops) that is most downhill on the land softened over a few cells, with a little
// variation for the meanders a flat floodplain gives.
{
  const G = Float32Array.from(filled);
  // a box blur of radius 3, twice (close to a Gaussian), along x and then along y
  const blur = (a, r) => {
    const t = new Float32Array(N);
    for (let y = 0; y < H; y++) { let s = 0, n = 0; const row = y * W;
      for (let x = -r; x < W; x++) { if (x + r < W) { s += a[row + x + r]; n++; } if (x - r - 1 >= 0) { s -= a[row + x - r - 1]; n--; } if (x >= 0) t[row + x] = s / n; } }
    for (let x = 0; x < W; x++) { let s = 0, n = 0;
      for (let y = -r; y < H; y++) { if (y + r < H) { s += t[(y + r) * W + x]; n++; } if (y - r - 1 >= 0) { s -= t[(y - r - 1) * W + x]; n--; } if (y >= 0) a[y * W + x] = s / n; } }
  };
  blur(G, 3); blur(G, 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) G[y * W + x] += nz2.fbm(x / 14, y / 14, 3) * 0.6;
  // A cell drains in one of only eight directions, so where the land falls at 30° every cell would
  // take 45° and the river run as one straight diagonal. As in Rho8: of the two directions either
  // side of the true downhill one, each is taken in proportion to how close it is, so the river
  // keeps the true direction on average (the line is smoothed when it is drawn).
  const RING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const hash = (i) => { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  let changed = 0;
  for (let c = 0; c < N; c++) {
    if (!land[c] || dir[c] < 0) continue;
    const cx = c % W, cy = (c / W) | 0;
    const gx = (G[cy * W + Math.max(0, cx - 2)] - G[cy * W + Math.min(W - 1, cx + 2)]), gy = (G[Math.max(0, cy - 2) * W + cx] - G[Math.min(H - 1, cy + 2) * W + cx]);
    if (gx * gx + gy * gy > 1e-12) {
      const a = (Math.atan2(gy, gx) / (Math.PI / 4) + 8) % 8, k1 = Math.floor(a) % 8, k2 = (k1 + 1) % 8;
      const [dx, dy] = RING[hash(c) < a - Math.floor(a) ? k2 : k1], nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && filled[ny * W + nx] < filled[c]) {
        const n = ny * W + nx;
        if (n !== dir[c]) { dir[c] = n; changed++; }
        continue;
      }
    }
    // (where that way is not lower: the lower neighbour most downhill)
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (filled[n] >= filled[c]) continue;
      const s = (G[c] - G[n]) / (k < 4 ? 1 : Math.SQRT2);
      if (s > bs) { bs = s; best = n; }
    }
    if (best >= 0 && best !== dir[c]) { dir[c] = best; changed++; }
  }
  log(`flow directions: ${changed} cells drain downhill instead of along the flood`);
}

// ---------------------------------------------------------------- accumulation
const acc = new Float32Array(N);
for (let k = 0; k < nOrder; k++) {
  const c = order[k];
  const x = c % W, y = (c / W) | 0;
  acc[c] = 1.25 - x / 3600 - y / 8500; // rain: wetter west and north
}
for (let k = nOrder - 1; k >= 0; k--) {
  const c = order[k];
  if (dir[c] >= 0) acc[dir[c]] += acc[c];
}
log('accumulation');

// ---------------------------------------------------------------- river lines
const T = 150; // km² catchment for the smallest drawn stream
const bigKids = new Uint8Array(N);
for (let i = 0; i < N; i++) if (land[i] && acc[i] >= T && dir[i] >= 0) bigKids[dir[i]]++;
const onRiver = new Int32Array(N).fill(-1);
const lines = [];
// process sources in descending accumulation so main stems are traced first
const sources = [];
for (let i = 0; i < N; i++) if (land[i] && acc[i] >= T && !bigKids[i]) sources.push(i);
for (const s of sources) {
  const cells = [];
  let c = s;
  while (c >= 0 && land[c] && onRiver[c] < 0) {
    onRiver[c] = lines.length;
    cells.push(c);
    if (dir[c] < 0) break;
    c = dir[c];
  }
  let endsOn = -1;
  if (c >= 0 && land[c] && onRiver[c] >= 0) { cells.push(c); endsOn = onRiver[c]; }
  else if (c >= 0 && dir[cells[cells.length - 1]] === -2) { /* reaches sea or map edge */ }
  lines.push({ cells, endsOn });
}
// convert cell chains to km polylines with per-vertex catchment
const riverLines = [];
for (const l of lines) {
  if (l.cells.length < 2) continue;
  const raw = l.cells.map((c) => [c % W + 0.5 + (nz2.n(c * 0.37, 1) * 0.25), ((c / W) | 0) + 0.5 + nz2.n(c * 0.37, 7) * 0.25]);
  const last = l.cells[l.cells.length - 1];
  // extend the last vertex into the sea so mouths meet the coast
  if (dir[last] === -2) {
    const lx = last % W, ly = (last / W) | 0;
    let best = null;
    for (let k = 0; k < 8; k++) {
      const nx = lx + DX[k], ny = ly + DY[k];
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !land[ny * W + nx]) { best = [nx + 0.5, ny + 0.5]; break; }
    }
    if (best) raw.push(best);
  }
  const pts = chaikin(raw, 3);
  const accs = l.cells.map((c) => acc[c]);
  riverLines.push({ pts, accStart: accs[0], accEnd: accs[accs.length - 1], cells: l.cells, endsOn: l.endsOn });
}
log(`rivers: ${riverLines.length} lines`);

// ---------------------------------------------------------------- contours
const coastRings = contours(landV, W, H, 0);
const lakeField = new Float32Array(N);
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  let s = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lake[(y + dy) * W + x + dx];
  lakeField[y * W + x] = s / 9;
}
const lakeRings = contours(lakeField, W, H, 0.45);
log(`contours: coast ${coastRings.length}, lakes ${lakeRings.length}`);

// ---------------------------------------------------------------- save
fs.writeFileSync(new URL('elev.f32', OUT), Buffer.from(elev.buffer));
fs.writeFileSync(new URL('land.u8', OUT), Buffer.from(land.buffer));
fs.writeFileSync(new URL('lake.u8', OUT), Buffer.from(lake.buffer));
fs.writeFileSync(new URL('acc.f32', OUT), Buffer.from(acc.buffer));
fs.writeFileSync(new URL('dir.i32', OUT), Buffer.from(dir.buffer));
fs.writeFileSync(new URL('terrain.json', OUT), JSON.stringify({
  coastRings, lakeRings,
  rivers: riverLines.map((r) => ({ pts: r.pts, a0: r.accStart, a1: r.accEnd, cells: r.cells, endsOn: r.endsOn })),
  canon: Object.fromEntries(Object.values(rivers).map((r) => [r.id, r.pts])),
}));

// preview (quarter resolution)
const PS = 3, PW = Math.floor(W / PS), PH = Math.floor(H / PS);
const png = new PNG({ width: PW, height: PH });
for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
  const i = y * PS * W + x * PS, o = (y * PW + x) * 4;
  let r, g, b;
  if (!land[i]) { r = 150; g = 190; b = 215; }
  else if (lake[i]) { r = 120; g = 170; b = 210; }
  else {
    const e = elev[i];
    const t = Math.min(1, e / 2200);
    r = 120 + 120 * t; g = 170 + 40 * t - 90 * t * t; b = 100 + 60 * t;
    // hillshade
    const ex = elev[i + 1] - elev[i - 1], ey = elev[i + W] - elev[i - W];
    const sh = Math.max(0.55, Math.min(1.25, 1 + (-ex + ey) * 0.004));
    r *= sh; g *= sh; b *= sh;
  }
  if (land[i] && acc[i] > 400) { r = 60; g = 120; b = 200; }
  png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
}
fs.writeFileSync(new URL('preview_terrain.png', OUT), PNG.sync.write(png));
log('saved');
