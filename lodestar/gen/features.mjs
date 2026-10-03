// Step 2: countries, loaded area, provinces, places, roads, rail, forests, urban areas.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { makeNoise, rng } from './lib/noise.mjs';
import { fractalize, chaikin, contours, simplify, simplifyRing, MinHeap, ringArea, pointInPoly } from './lib/geom.mjs';
import { makeNamer, reserveNames } from './lib/names.mjs';
import { WORLD, OUTLINE, SEPARATORS, COUNTRIES, SEAS, RANGES } from './design.mjs';
const FAR_ = 4000;
import { TS } from './lib/townscale.mjs';
import { CANON_PLACES, PROVINCES, FACILITIES, LANDMARKS, DISTRICTS } from './canon.mjs';

const OUT = new URL('./out/', import.meta.url);
const { w: W, h: H } = WORLD;
const N = W * H;
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const nz = makeNoise('esteloria-features');
const rand = rng('esteloria-features');
const read = (f, T) => { const b = fs.readFileSync(new URL(f, OUT)); return new T(b.buffer, b.byteOffset, b.byteLength / T.BYTES_PER_ELEMENT); };
const elev = read('elev.f32', Float32Array);
const land = read('land.u8', Uint8Array);
const lake = read('lake.u8', Uint8Array);
const acc = read('acc.f32', Float32Array);
const terrain = JSON.parse(fs.readFileSync(new URL('terrain.json', OUT)));
const idx = (x, y) => Math.max(0, Math.min(H - 1, y | 0)) * W + Math.max(0, Math.min(W - 1, x | 0));

// ---------------------------------------------------------------- countries
// The drawn outline only fixes a band. Inside the band Esteloria and its neighbours
// grow toward each other over the terrain; crossing a river or a ridge is costly, so
// the fronts meet on rivers and watersheds, the way real borders settle.
const outline = chaikin(OUTLINE, 1);
const estRing = [...outline, [outline.at(-1)[0], H + 600], [-FAR_, H + 600], [-FAR_, outline[0][1]]];
const separators = Object.fromEntries(Object.entries(SEPARATORS).map(([k, v]) => [k, fractalize(chaikin(v, 2), rng('sep-' + k), 0.14, 1.2)]));
const CID = ['est', 'nor', 'var', 'mir', 'alc', 'bre'];
const country = new Uint8Array(N).fill(255); // index into CID, 255 = sea
const inside = new Uint8Array(N);
function scanFill(ring, arr, val) {
  for (let y = 0; y < H; y++) {
    const yy = y + 0.5, xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > yy) !== (yj > yy)) xs.push(xi + ((yy - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, c) => a - c);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) arr[y * W + x] = val;
    }
  }
}
scanFill(estRing, inside, 1);
// unsigned distance to the outline (4 km grid, bilinear)
const BAND = 110;
const DS = 4, DW = Math.ceil(W / DS) + 1, DH = Math.ceil(H / DS) + 1;
const dOut = new Float32Array(DW * DH).fill(1e9);
for (let k = 0; k < outline.length - 1; k++) {
  const [ax, ay] = outline[k], [bx, by] = outline[k + 1];
  const R = BAND + 16;
  const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / DS)), x1 = Math.min(DW - 1, Math.ceil((Math.max(ax, bx) + R) / DS));
  const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R) / DS)), y1 = Math.min(DH - 1, Math.ceil((Math.max(ay, by) + R) / DS));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let tt = l2 ? ((i * DS - ax) * dx + (j * DS - ay) * dy) / l2 : 0;
    tt = Math.max(0, Math.min(1, tt));
    const d = Math.hypot(ax + tt * dx - i * DS, ay + tt * dy - j * DS);
    if (d < dOut[j * DW + i]) dOut[j * DW + i] = d;
  }
}
const distOutline = (x, y) => {
  const gx = Math.min(DW - 1.001, x / DS), gy = Math.min(DH - 1.001, y / DS), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j;
  return dOut[j * DW + i] * (1 - fx) * (1 - fy) + dOut[j * DW + i + 1] * fx * (1 - fy) + dOut[(j + 1) * DW + i] * (1 - fx) * fy + dOut[(j + 1) * DW + i + 1] * fx * fy;
};
// neighbour sectors: flood outward from each seed over land outside the outline, walled by separators
const wall = new Uint8Array(N);
for (const line of Object.values(separators)) {
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, ay] = line[k], [bx, by] = line[k + 1];
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4);
    for (let s = 0; s <= n; s++) {
      const x = Math.floor(ax + ((bx - ax) * s) / n), y = Math.floor(ay + ((by - ay) * s) / n);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) wall[(y + dy) * W + x + dx] = 1;
    }
  }
}
const sector = new Uint8Array(N).fill(255);
{
  const q = [];
  COUNTRIES.forEach((c) => {
    if (!c.seed) return;
    const i = idx(c.seed[0], c.seed[1]);
    sector[i] = CID.indexOf(c.id); q.push(i);
  });
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (sector[n] === 255 && !inside[n] && !wall[n]) { sector[n] = sector[c]; q.push(n); }
    }
  }
  // the band inside the outline belongs to the nearest neighbour sector, for seeding the contest
  const q2 = [];
  for (let i = 0; i < N; i++) if (sector[i] !== 255) q2.push(i);
  for (let h = 0; h < q2.length; h++) {
    const c = q2[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (sector[n] === 255) { sector[n] = sector[c]; q2.push(n); }
    }
  }
}
// the contest: Dijkstra from both sides of the band at once
{
  const cost = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  const bn = makeNoise('border-cost');
  const bh = makeNoise('border-head');
  let nSeeds = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i]) continue;
    const d = distOutline(x + 0.5, y + 0.5);
    if (d < BAND) continue;
    country[i] = inside[i] ? 0 : sector[i];
    // seed only the cells on the band's edge
    // each side gets a head start that varies along the border, so the line wanders
    if (d < BAND + 4) {
      const head = (bh.fbm(x / 170 + (inside[i] ? 0 : 40), y / 170, 4) * 0.5 + 0.5) * 230;
      cost[i] = head; heap.push(head, i); nSeeds++;
    }
  }
  while (heap.size) {
    const key = heap.peekKey(), c = heap.pop();
    if (key > cost[c]) continue;
    const cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!land[n] || country[n] !== 255 && cost[n] === Infinity) continue;
      const de = Math.abs(elev[n] - elev[c]);
      const river = acc[n] > 2500 && acc[c] <= 2500 ? 120 : 0; // stepping onto a big river
      const ridge = Math.max(0, elev[n] - elev[c]) * 0.06 + (elev[n] > 1200 ? 1.5 : 0);
      const step = 1 + de * 0.02 + river + ridge + (bn.fbm(nx / 40, ny / 40, 3) * 0.5 + 0.5) * 2.2;
      const nc = cost[c] + step;
      if (nc < cost[n]) { cost[n] = nc; country[n] = country[c]; heap.push(nc, n); }
    }
  }
  let fb = 0;
  for (let i = 0; i < N; i++) if (land[i] && country[i] === 255) { fb++; country[i] = inside[i] ? 0 : sector[i]; }
  log(`border contest: seeds ${nSeeds}, fallback ${fb}`);
}
log('countries');

// ---------------------------------------------------------------- loaded area (block = one z3 tile = 32 km)
const B = 32, BW = Math.ceil(W / B), BH = Math.ceil(H / B);
const estBlock = new Uint8Array(BW * BH);
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (country[y * W + x] === 0) estBlock[((y / B) | 0) * BW + ((x / B) | 0)] = 1;
const bdist = new Int32Array(BW * BH).fill(1e9);
{
  const q = [];
  for (let i = 0; i < BW * BH; i++) if (estBlock[i]) { bdist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % BW, cy = (c / BW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= BW || ny >= BH) continue;
      const n = ny * BW + nx;
      if (bdist[n] > bdist[c] + 1) { bdist[n] = bdist[c] + 1; q.push(n); }
    }
  }
}
const loaded = new Uint8Array(BW * BH);
const lr = rng('loaded-tiles');
for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
  const i = by * BW + bx, d = bdist[i];
  if (d === 0) { loaded[i] = 1; continue; }
  // how far the tiles reach into each neighbour varies from place to place
  const reach = 1 + Math.floor((nz.fbm(bx / 7, by / 7, 3) * 0.5 + 0.5) * 4.6);
  const r = lr();
  if (d <= reach) loaded[i] = r < 0.06 && d > 1 ? 0 : 1;
  else if (d === reach + 1 && r < 0.3) loaded[i] = 1;
}
// drop isolated stray tiles that touch nothing loaded
for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
  const i = by * BW + bx;
  if (!loaded[i] || bdist[i] === 0) continue;
  let nb = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = bx + dx, ny = by + dy;
    if (nx >= 0 && ny >= 0 && nx < BW && ny < BH && loaded[ny * BW + nx]) nb++;
  }
  if (!nb) loaded[i] = 0;
}
const isLoaded = (x, y) => { const bx = (x / B) | 0, by = (y / B) | 0; return bx >= 0 && by >= 0 && bx < BW && by < BH && loaded[by * BW + bx] === 1; };
log(`loaded blocks: ${loaded.reduce((a, c) => a + c, 0)} of ${BW * BH}`);

// ---------------------------------------------------------------- coarse helpers (2 km)
const G = 2, GW = Math.ceil(W / G), GH = Math.ceil(H / G), GN = GW * GH;
const gElev = new Float32Array(GN), gLand = new Uint8Array(GN), gCountry = new Uint8Array(GN), gAcc = new Float32Array(GN), gLake = new Uint8Array(GN);
for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
  const g = gy * GW + gx;
  let e = 0, n = 0, l = 0, lk = 0, a = 0, cc = new Map();
  for (let dy = 0; dy < G; dy++) for (let dx = 0; dx < G; dx++) {
    const x = gx * G + dx, y = gy * G + dy;
    if (x >= W || y >= H) continue;
    const i = y * W + x;
    e += elev[i]; n++; l += land[i]; lk += lake[i]; a = Math.max(a, acc[i]);
    cc.set(country[i], (cc.get(country[i]) || 0) + 1);
  }
  gElev[g] = e / n; gLand[g] = l * 2 > n ? 1 : 0; gLake[g] = lk * 2 > n ? 1 : 0; gAcc[g] = a;
  gCountry[g] = [...cc.entries()].sort((p, q) => q[1] - p[1])[0][0];
}
const gSlope = new Float32Array(GN);
for (let gy = 1; gy < GH - 1; gy++) for (let gx = 1; gx < GW - 1; gx++) {
  const g = gy * GW + gx;
  const sx = (gElev[g + 1] - gElev[g - 1]) / (2 * G * 1000), sy = (gElev[g + GW] - gElev[g - GW]) / (2 * G * 1000);
  gSlope[g] = Math.hypot(sx, sy);
}
function bfsDist(seed) { // multi-source distance in km on the 2 km grid
  const d = new Float32Array(GN).fill(1e9), q = [];
  for (let g = 0; g < GN; g++) if (seed(g)) { d[g] = 0; q.push(g); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (d[n] > d[c] + G) { d[n] = d[c] + G; q.push(n); }
    }
  }
  return d;
}
const dRiver = bfsDist((g) => gLand[g] && gAcc[g] > 1500);
const dSea = bfsDist((g) => !gLand[g] && !gLake[g]);
log('coarse grids');

export const ctx = { W, H, N, elev, land, lake, acc, country, CID, outline, separators, B, BW, BH, loaded, isLoaded, bdist,
  G, GW, GH, GN, gElev, gLand, gCountry, gAcc, gLake, gSlope, dRiver, dSea, idx, terrain, log, nz, rand };

// ---------------------------------------------------------------- places
const namer = makeNamer('esteloria-names');
reserveNames(namer, CANON_PLACES.map((p) => p.name));
const places = [];
const hash = new Map();
const HS = 20;
const hkey = (x, y) => `${(x / HS) | 0},${(y / HS) | 0}`;
function nearest(x, y, r) {
  let best = null, bd = r;
  for (let gy = Math.floor((y - r) / HS); gy <= Math.floor((y + r) / HS); gy++) for (let gx = Math.floor((x - r) / HS); gx <= Math.floor((x + r) / HS); gx++) {
    for (const p of hash.get(`${gx},${gy}`) || []) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p; }
    }
  }
  return best;
}
function addPlace(p) {
  p.id = p.id || 'p' + places.length;
  places.push(p);
  const k = hkey(p.x, p.y);
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(p);
  return p;
}
// snap a canon town to the nearest big river cell (or shore) near its design spot
function snap(p) {
  if (!p.snap) return [p.at[0], p.at[1]];
  let best = null, bd = Infinity;
  const R = p.snapR || 30;
  for (let y = p.at[1] - R; y <= p.at[1] + R; y++) for (let x = p.at[0] - R; x <= p.at[0] + R; x++) {
    const i = idx(x, y);
    const ok = p.snap === 'river' ? land[i] && acc[i] > (p.minAcc || 4000) : p.snap === 'coast' ? land[i] && !land[idx(x + 2, y)] + !land[idx(x - 2, y)] + !land[idx(x, y + 2)] + !land[idx(x, y - 2)] > 0 : land[i];
    if (!ok) continue;
    const d = Math.hypot(x - p.at[0], y - p.at[1]);
    if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; }
  }
  return best || [p.at[0], p.at[1]];
}
for (const c of CANON_PLACES) {
  const [x, y] = snap(c);
  addPlace({ ...c, x, y, at: undefined, country: 'est', canon: true });
}
// suitability on the 2 km grid
const suit = new Float32Array(GN);
for (let g = 0; g < GN; g++) {
  if (!gLand[g] || gLake[g]) continue;
  const gx = g % GW, gy = (g / GW) | 0;
  const x = gx * G + 1, y = gy * G + 1;
  if (!isLoaded(x, y)) continue;
  const e = gElev[g];
  if (e > 1900) continue;
  let s = Math.exp(-e / 650) * Math.max(0, 1 - gSlope[g] * 18);
  s *= 1 + 0.55 * Math.exp(-dRiver[g] / 4) + 0.6 * Math.exp(-dSea[g] / 6);
  s *= 0.55 + 0.45 * (nz.fbm(x / 160, y / 160, 3) * 0.5 + 0.5) * 2;
  if (gCountry[g] === 0) s *= 1 + 0.8 * Math.exp(-Math.hypot(x - 1000, y - 935) / 600);
  if (y < 380) s *= 0.6; // the cold north is thinly settled
  suit[g] = s;
}
function poisson(n, minD, kind, popFn, pred = () => true) {
  const cand = [];
  // weighted random order (key = u^(1/w)): good land fills first, but not only good land
  for (let g = 0; g < GN; g++) if (suit[g] > 0) cand.push([Math.pow(rand(), 1 / (suit[g] * (kind === 'city' ? 6 : 2))), g]);
  cand.sort((a, c) => c[0] - a[0]);
  let made = 0;
  for (const [, g] of cand) {
    if (made >= n) break;
    const x = (g % GW) * G + 1 + (rand() - 0.5) * 1.6, y = ((g / GW) | 0) * G + 1 + (rand() - 0.5) * 1.6;
    if (!pred(x, y, g)) continue;
    const cty = CID[gCountry[g]];
    const md = minD * (cty === 'est' ? 1 : 1.25);
    if (nearest(x, y, md)) continue;
    const coastal = dSea[g] < 5;
    addPlace({ kind, x, y, pop: popFn(), country: cty, name: namer(COUNTRIES.find((c) => c.id === cty)?.lang || 'est', { coastal }), coastal });
    made++;
  }
  return made;
}
const zipf = (lo, hi, a = 1.4) => () => Math.round(lo + (hi - lo) * Math.pow(rand(), a * 2.2));
log(`cities ${poisson(30, 95, 'city', zipf(60000, 420000))}`);
log(`towns ${poisson(560, 30, 'town', zipf(4000, 45000))}`);
// as close as real farmland: a village every 2.5 to 4 km of the map (5 to 8 here, before halving)
log(`villages ${poisson(15000, 5, 'village', zipf(150, 2500))}`);
log(`hamlets ${poisson(9000, 3, 'hamlet', zipf(20, 140), (x, y, g) => gElev[g] < 1500)}`);
// ---------------------------------------------------------------- canon border details
// (no pockets bent round border villages: on the map they read as loops cut off the border)
{
  // the Ireyn is the border for a short stretch where it leaves Esteloria: the "old crossing"
  // of the 2013 escape, where the far bank is Varsenne (Rec. 378241, Attachment A)
  {
    const VAR = CID.indexOf('var');
    const yr = (x) => { let by = -1, ba = 0; for (let y = 1050; y < 1130; y++) { const k = y * W + x; if (land[k] && acc[k] > ba) { ba = acc[k]; by = y; } } return ba > 4000 ? by : -1; };
    let xc = -1;
    for (let x = 1960; x < 2100; x++) { const y = yr(x); if (y > 0 && country[y * W + x] !== 0) { xc = x; break; } }
    if (xc > 0) {
      const xa = xc - 14, xb = xc + 12;
      for (let x = xa; x <= xb; x++) {
        const y0 = yr(x);
        if (y0 < 0) continue;
        const hw = 10 * Math.sin((Math.PI * (x - xa)) / (xb - xa));
        for (let y = Math.floor(y0 - hw); y <= Math.ceil(y0 + hw); y++) {
          const k = y * W + x;
          if (land[k]) country[k] = y <= y0 ? 0 : VAR;
        }
      }
      log(`Ireyn border stretch at x ${xa}-${xb}`);
    }
  }
  // the coarse grid follows the fine one
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const cc = new Map();
    for (let dy = 0; dy < G; dy++) for (let dx = 0; dx < G; dx++) {
      const x = gx * G + dx, y = gy * G + dy;
      if (x >= W || y >= H) continue;
      const c = country[y * W + x];
      cc.set(c, (cc.get(c) || 0) + 1);
    }
    gCountry[gy * GW + gx] = [...cc.entries()].sort((a, c) => c[1] - a[1])[0][0];
  }
  for (const p of places) if (!p.canon) p.country = CID[country[idx(p.x, p.y)]] || p.country;
}

// ---------------------------------------------------------------- provinces (cost-grown regions on the 2 km grid)
const prov = new Int16Array(GN).fill(-1);
{
  const cost = new Float64Array(GN).fill(Infinity);
  const heap = new MinHeap();
  PROVINCES.forEach((p, k) => {
    const g = ((p.at[1] / G) | 0) * GW + ((p.at[0] / G) | 0);
    cost[g] = 0; prov[g] = k; heap.push(0, g);
  });
  while (heap.size) {
    const key = heap.peekKey();
    const c = heap.pop();
    if (key > cost[c]) continue;
    const cx = c % GW, cy = (c / GW) | 0, k = prov[c];
    const wgt = PROVINCES[k].weight || 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      if (gCountry[n] !== 0 || !gLand[n]) continue;
      // boundaries settle on ridges and big rivers, as real ones do
      const step = wgt * (1 + gSlope[n] * 60 + (gAcc[n] > 6000 ? 25 : 0) + Math.max(0, gElev[n] - 1400) / 300);
      const nc = cost[c] + step;
      if (nc < cost[n]) { cost[n] = nc; prov[n] = k; heap.push(nc, n); }
    }
  }
}
export const provinceAt = (x, y) => (x < 0 || y < 0 || x >= GW * G || y >= GH * G ? -1 : prov[((y / G) | 0) * GW + ((x / G) | 0)]);
// boundary lines of the n regions on the prov grid: each region's outline (rings), and the lines
// between two regions, each once (borders): not the coast, and not the national border, which
// is a country border already
function provinceLines(n) {
  const rings = [];
  for (let k = 0; k < n; k++) {
    const f = new Float32Array(GN);
    for (let g = 0; g < GN; g++) f[g] = prov[g] === k ? 1 : 0;
    rings.push(contours(f, GW, GH, 0.5, G, 0, 0).map((r) => simplify(chaikin(r, 2, true), 0.6)));
  }
  const borders = [];
  rings.forEach((rs, k) => {
    for (const r of rs) {
      let run = [];
      const flush = () => { if (run.length >= 2) borders.push(run); run = []; };
      for (let i = 0; i < r.length; i++) {
        const [x, y] = r[i], [px, py] = r[(i - 1 + r.length) % r.length], [nx, ny] = r[(i + 1) % r.length];
        const l = Math.hypot(nx - px, ny - py) || 1, ux = (nx - px) / l, uy = (ny - py) / l;
        const a = provinceAt(x - uy * 1.8, y + ux * 1.8), b = provinceAt(x + uy * 1.8, y - ux * 1.8);
        const other = a === k ? b : b === k ? a : -1;
        if (other > k) run.push([x, y]); else flush();
      }
      flush();
    }
  });
  return { rings, borders };
}
let { rings: provinceRings, borders: provBorders } = provinceLines(PROVINCES.length);
log(`provinces, ${provBorders.length} lines between them`);
Object.assign(ctx, { prov, provinceRings, provinceAt });

// provinces and countries on every place
for (const p of places) {
  const g = ((p.y / G) | 0) * GW + ((p.x / G) | 0);
  if (p.country === 'est' && prov[g] >= 0) p.province = PROVINCES[prov[g]].name;
}
Object.assign(ctx, { places, nearest, addPlace, namer });
log(`places: ${places.length}`);

export { places };
fs.writeFileSync(new URL('stage_places.json', OUT), JSON.stringify({ places: places.length }));

// ---------------------------------------------------------------- routing (A* on the 2 km grid)
const roadCls = new Uint8Array(GN); // best road class on each cell
const railOn = new Uint8Array(GN);
const roadEdges = new Map(); // key a*GN+b (a<b) -> {c, ref}
const railEdges = new Map();
const ekey = (a, c) => (a < c ? a * GN + c : c * GN + a);
const stamp = new Int32Array(GN);
const gcost = new Float64Array(GN);
const came = new Int32Array(GN);
let curStamp = 0;
const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
let avoidMotorway = false; // Route 9 keeps its own road beside the motorways
function stepCost(n, mode, cls) {
  if (!gLand[n] || gLake[n]) return Infinity;
  const s = gSlope[n];
  let c;
  if (mode === 'rail') {
    c = 1 + 90 * s + 9000 * s * s + (gElev[n] > 1500 ? 6 : 0);
    if (railOn[n]) c *= 0.3;
  } else {
    c = 1 + 30 * s + 1400 * s * s + (gElev[n] > 1900 ? 5 : 0);
    if (roadCls[n] >= cls) c *= 0.38; else if (roadCls[n]) c *= 0.7;
    if (cls >= 4 && gCountry[n] !== 0) c *= 3; // motorways are Esteloria's to build
    if (avoidMotorway && roadCls[n] >= 4) c += 8;
  }
  // a river cell costs extra every step, so roads cross rivers at bridges instead of running along them
  if (gAcc[n] > 2500) c += mode === 'rail' ? 14 : 9;
  if (mode !== 'rail' && cls >= 4 && coreCost[n]) c += coreCost[n]; // motorways keep out of town centres
  return c;
}
// built-up radius (km) from population: about 2,000 people per km² in a village, 2,800 in
// a town of 10,000, 3,400 at 100,000 and 4,200 for the capital, as in European cities
const urbanDensity = (pop) => (pop >= 1000 ? 2200 + 600 * Math.log10(pop / 1000) : 2000);
const urbanR = (pop) => Math.sqrt(pop / urbanDensity(pop) / 2.23);
// cost for a motorway to pass through a big town's centre (bypasses form round it)
const coreCost = new Float32Array(GN);
for (const p of places) {
  if (p.pop < 40000) continue;
  const r = 0.7 * urbanR(p.pop); // km
  const g0x = (p.x / G) | 0, g0y = (p.y / G) | 0, R = Math.ceil(r / G);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy) * G;
    if (d > r) continue;
    const g = (g0y + dy) * GW + g0x + dx;
    if (g >= 0 && g < GN) coreCost[g] = Math.max(coreCost[g], 30 * (1 - d / r) + 6);
  }
}
function borderCost(a, n) { return gCountry[a] !== gCountry[n] ? 40 : 0; }
// A* between two cells, or Dijkstra to the nearest cell satisfying `goal`
function route(src, dst, mode, cls, goal = null, maxCost = Infinity) {
  curStamp++;
  const heap = new MinHeap();
  const tx = dst % GW, ty = (dst / GW) | 0;
  const h = (g) => (goal ? 0 : Math.hypot((g % GW) - tx, ((g / GW) | 0) - ty) * 0.38);
  stamp[src] = curStamp; gcost[src] = 0; came[src] = -1;
  heap.push(h(src), src);
  while (heap.size) {
    const c = heap.pop();
    if (goal ? goal(c) && c !== src : c === dst) {
      const path = [];
      for (let k = c; k !== -1; k = came[k]) path.push(k);
      return path.reverse();
    }
    const gc = gcost[c];
    if (gc > maxCost) return null;
    const cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy, dl] of D8) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx;
      const sc = stepCost(n, mode, cls);
      if (sc === Infinity) continue;
      const ng = gc + sc * dl + borderCost(c, n);
      if (stamp[n] !== curStamp || ng < gcost[n]) {
        stamp[n] = curStamp; gcost[n] = ng; came[n] = c;
        heap.push(ng + h(n), n);
      }
    }
  }
  return null;
}
const cellOf = (p) => ((p.y / G) | 0) * GW + ((p.x / G) | 0);
function lay(path, cls, ref) {
  if (!path) return;
  for (let k = 0; k < path.length; k++) {
    const a = path[k];
    if (roadCls[a] < cls) roadCls[a] = cls;
    if (k) {
      const key = ekey(path[k - 1], a), e = roadEdges.get(key);
      if (!e) roadEdges.set(key, { c: cls, ref });
      else {
        if (cls > e.c) { e.c = cls; e.ref = ref; }
        // the lowest number wins on a shared road, except Route 9, which keeps its own
        else if (cls === e.c && ref && e.ref !== 9 && (ref === 9 || !e.ref || ref < e.ref)) e.ref = ref;
      }
    }
  }
}
function layRail(path, disused = false) {
  if (!path) return;
  for (let k = 0; k < path.length; k++) {
    railOn[path[k]] = 1;
    if (k) {
      const key = ekey(path[k - 1], path[k]);
      if (!railEdges.has(key)) railEdges.set(key, { disused });
    }
  }
}
const byName = Object.fromEntries(places.filter((p) => p.canon).map((p) => [p.name, p]));
const loadedPlace = (p) => isLoaded(p.x, p.y);
const big = places.filter((p) => (p.kind === 'capital' || p.kind === 'city') && loadedPlace(p));
const estBig = big.filter((p) => p.country === 'est');
// one border town per neighbour, the largest near Esteloria, for international links
const gateways = {};
for (const c of ['nor', 'var', 'mir', 'alc', 'bre']) {
  const cand = places.filter((p) => p.country === c && loadedPlace(p) && (p.kind === 'town' || p.kind === 'city'));
  cand.sort((a, q) => q.pop - a.pop);
  gateways[c] = cand.slice(0, 2);
}
let r9a = null, r9b = null; // Route 9 is laid after the motorways (below)
// motorways end at junctions on the edge of big towns, not in their centres
const junctions = new Map(); // place -> [{g, ang}]
const coreR = (p) => (p.pop >= 40000 ? 0.8 * urbanR(p.pop) : 0);
function junctionCell(p, q) {
  const r = coreR(p);
  if (!r) return cellOf(p);
  const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  let x = p.x + ((q.x - p.x) / d) * r * 1.1, y = p.y + ((q.y - p.y) / d) * r * 1.1;
  const g = cellOf({ x, y });
  if (!junctions.has(p)) junctions.set(p, []);
  const list = junctions.get(p);
  const ang = Math.atan2(y - p.y, x - p.x);
  if (!list.some((j) => j.g === g)) {
    list.push({ g, ang });
    lay(route(cellOf(p), g, 'road', 3), 3, 0); // the route into the centre
  }
  return g;
}
function motorway(a, b, ref) {
  lay(route(junctionCell(a, b), junctionCell(b, a), 'road', 4), 4, ref);
}
// motorways: minimum spanning tree over the big cities plus links abroad
{
  // the motorway tree joins the canon cities and every big city, so the network is one piece
  const nodes = estBig.filter((p) => p.canon || p.pop >= 90000);
  nodes.sort((a, q) => (q.kind === 'capital') - (a.kind === 'capital'));
  const inTree = new Set([0]);
  const edges = [];
  while (inTree.size < nodes.length) {
    let best = null;
    for (const i of inTree) for (let j = 0; j < nodes.length; j++) {
      if (inTree.has(j)) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) * (nodes[j].pop > 200000 ? 0.8 : 1);
      if (!best || d < best[0]) best = [d, i, j];
    }
    inTree.add(best[2]);
    edges.push([best[1], best[2]]);
  }
  // a few extra links so the network has loops, as real ones do
  const extra = [['Aurenhal', 'Halveth'], ['Aurenhal', 'Merrowgate'], ['Merrowgate', 'Corvenne'], ['Aurenhal', 'Ostrey'], ['Aurenhal', 'Duncarrow']];
  let ref = 1;
  for (const [a, c] of extra) motorway(byName[a], byName[c], ref++);
  for (const [i, j] of edges) motorway(nodes[i], nodes[j], ref++);
  for (const c of Object.keys(gateways)) {
    const gw = gateways[c][0];
    if (!gw) continue;
    // links abroad hop through towns toward the capital until they meet the network
    const cap = byName['Aurenhal'];
    const hubs = places.filter((p) => p.country === 'est' && (p.kind === 'city' || (p.kind === 'town' && p.pop >= 15000)));
    let cur = gw, hops = 0;
    while (hops++ < 8) {
      const dCap = Math.hypot(cur.x - cap.x, cur.y - cap.y);
      const next = hubs
        .filter((p) => p !== cur && Math.hypot(p.x - cap.x, p.y - cap.y) < dCap - 25 && Math.hypot(p.x - cur.x, p.y - cur.y) < 170)
        .sort((a, q) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(q.x - cur.x, q.y - cur.y))[0];
      const onNet = roadCls[cellOf(cur)] >= 4 && cur !== gw;
      if (onNet || !next) break;
      motorway(cur, next, ref);
      cur = next;
    }
    if (roadCls[cellOf(cur)] < 4) lay(route(cellOf(cur), cellOf(cur), 'road', 4, (k) => roadCls[k] >= 4 && gCountry[k] === 0), 4, ref);
    ref++;
  }
  // join each big town's junctions with a partial ring motorway round its centre
  for (const [p, list] of junctions) {
    if (list.length < 2) continue;
    list.sort((u, v) => u.ang - v.ang);
    let gapAt = 0, gap = -1;
    for (let k = 0; k < list.length; k++) {
      const d = ((list[(k + 1) % list.length].ang - list[k].ang) + Math.PI * 2) % (Math.PI * 2);
      if (d > gap) { gap = d; gapAt = k; }
    }
    // leave out the widest gap: rings are rarely complete
    for (let k = 0; k < list.length - 1; k++) {
      const u = list[(gapAt + 1 + k) % list.length], v = list[(gapAt + 2 + k) % list.length];
      lay(route(u.g, v.g, 'road', 4), 4, ref);
    }
    ref++;
  }
  log(`motorways: ${ref - 1} links`);
}
// Route 9: Ostrey - Tollen - the Varsenne border, on its own road beside the motorways
avoidMotorway = true;
const tollen = byName['Tollen'], ostrey = byName['Ostrey'];
const varGate = places.filter((p) => p.country === 'var' && loadedPlace(p) && p.kind !== 'hamlet')
  .sort((a, q) => Math.hypot(a.x - tollen.x - 140, a.y - tollen.y - 30) - Math.hypot(q.x - tollen.x - 140, q.y - tollen.y - 30))[0];
r9a = route(cellOf(ostrey), cellOf(tollen), 'road', 3);
lay(r9a, 3, 9);
r9b = route(cellOf(tollen), cellOf(varGate), 'road', 3);
lay(r9b, 3, 9);
avoidMotorway = false;
log('route 9');
// primary routes: Gabriel graph over cities and larger towns
{
  const nodes = places.filter((p) => (p.kind === 'city' || p.kind === 'capital' || (p.kind === 'town' && p.pop > 7000)) && loadedPlace(p));
  const pairs = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], c = nodes[j];
    const d = Math.hypot(a.x - c.x, a.y - c.y);
    if (d > 170) continue;
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2, r = d / 2;
    let blocked = false;
    for (const o of nodes) {
      if (o === a || o === c) continue;
      if (Math.hypot(o.x - mx, o.y - my) < r) { blocked = true; break; }
    }
    if (!blocked) pairs.push([d, a, c]);
  }
  pairs.sort((p, q) => (q[1].pop + q[2].pop) / q[0] - (p[1].pop + p[2].pop) / p[0]);
  let ref = 1;
  for (const [, a, c] of pairs) {
    if (ref === 9) ref++;
    const cross = a.country !== c.country;
    if (cross && (a.country !== 'est' && c.country !== 'est')) continue;
    lay(route(cellOf(a), cellOf(c), 'road', 3), 3, ref++);
  }
  log(`primary routes: ${ref - 1}`);
}
// secondary roads: every town to its two nearest neighbours
{
  const towns = places.filter((p) => (p.kind === 'town' || p.kind === 'city') && loadedPlace(p));
  for (const t of towns) {
    const near = towns.filter((o) => o !== t).map((o) => [Math.hypot(o.x - t.x, o.y - t.y), o]).sort((p, q) => p[0] - q[0]).slice(0, 2);
    for (const [d, o] of near) if (d < 90) lay(route(cellOf(t), cellOf(o), 'road', 2), 2, 0);
  }
  log('secondary roads');
}
// villages and hamlets join the nearest road
{
  let n = 0;
  for (const p of places) {
    if (!(p.kind === 'village' || p.kind === 'hamlet') || !loadedPlace(p)) continue;
    const s = cellOf(p);
    if (roadCls[s]) continue;
    const path = route(s, s, 'road', 1, (c) => roadCls[c] > 0, 60);
    if (path) { lay(path, p.kind === 'village' ? 1 : 0.5, 0); n++; }
  }
  log(`village links: ${n}`);
}
// lanes: every settlement to its nearest neighbours, as the lanes of real farmland run from
// village to village (a Gabriel graph, so lanes do not run past a nearer village)
{
  const nodes = places.filter((p) => p.kind !== 'city' && p.kind !== 'capital' && loadedPlace(p));
  const LH = 16, grid = new Map();
  for (const p of nodes) { const k = `${Math.floor(p.x / LH)},${Math.floor(p.y / LH)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const around = (x, y) => { const out = []; for (let gy = Math.floor(y / LH) - 1; gy <= Math.floor(y / LH) + 1; gy++) for (let gx = Math.floor(x / LH) - 1; gx <= Math.floor(x / LH) + 1; gx++) out.push(...(grid.get(`${gx},${gy}`) || [])); return out; };
  const seen = new Set();
  let n = 0;
  for (const a of nodes) {
    const near = around(a.x, a.y).filter((c) => c !== a).map((c) => [Math.hypot(c.x - a.x, c.y - a.y), c]).filter(([d]) => d < 15).sort((p, q) => p[0] - q[0]).slice(0, 4);
    for (const [d, c] of near) {
      const key = a.id < c.id ? a.id + '|' + c.id : c.id + '|' + a.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      if (around(mx, my).some((o) => o !== a && o !== c && Math.hypot(o.x - mx, o.y - my) < d / 2)) continue;
      const cls = a.kind === 'hamlet' || c.kind === 'hamlet' ? 0.5 : 1;
      const path = route(cellOf(a), cellOf(c), 'road', cls, null, d * 12);
      if (path) { lay(path, cls, 0); n++; }
    }
  }
  log(`lanes: ${n}`);
}
// rail: main lines between the big cities, links abroad, the closed Blackmere branch
const railLines = [['Aurenhal', 'Merrowgate'], ['Merrowgate', 'Corvenne'], ['Aurenhal', 'Halveth'], ['Halveth', 'Stenhollow'], ['Aurenhal', 'Ostrey'], ['Ostrey', 'Tollen'], ['Aurenhal', 'Duncarrow']];
for (const [a, c] of railLines) layRail(route(cellOf(byName[a]), cellOf(byName[c]), 'rail', 0));
for (const p of estBig) {
  if (p.canon || p.pop < 90000) continue;
  const path = route(cellOf(p), cellOf(p), 'rail', 0, (c) => railOn[c] === 1, 400);
  layRail(path);
}
for (const c of Object.keys(gateways)) {
  const gw = gateways[c][0];
  if (!gw) continue;
  layRail(route(cellOf(gw), cellOf(gw), 'rail', 0, (k) => railOn[k] === 1 && gCountry[k] === 0, 600));
}
layRail(route(cellOf(byName['Stenhollow']), cellOf(byName['Blackmere']), 'rail', 0), true);
log(`rail edges: ${railEdges.size}`);

// ---------------------------------------------------------------- edges -> smooth polylines
function chains(edges, attr) {
  const adj = new Map();
  for (const [key, e] of edges) {
    const a = Math.floor(key / GN), c = key % GN;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(c)) adj.set(c, []);
    adj.get(a).push([c, key]); adj.get(c).push([a, key]);
  }
  const used = new Set();
  const isNode = (v) => {
    const l = adj.get(v);
    if (l.length !== 2) return true;
    return attr(edges.get(l[0][1])) !== attr(edges.get(l[1][1]));
  };
  const out = [];
  const walk = (start, first) => {
    const cells = [start];
    let prev = start, [cur, key] = first;
    used.add(key);
    const a0 = attr(edges.get(key)), e0 = edges.get(key);
    while (true) {
      cells.push(cur);
      if (isNode(cur)) break;
      const next = adj.get(cur).find(([v, k]) => !used.has(k));
      if (!next) break;
      used.add(next[1]); prev = cur; [cur] = next;
    }
    out.push({ cells, e: e0, a: a0 });
  };
  for (const [v, l] of adj) if (isNode(v)) for (const nb of l) if (!used.has(nb[1])) walk(v, nb);
  for (const [v, l] of adj) for (const nb of l) if (!used.has(nb[1])) walk(v, nb); // loops
  return out;
}
const jn = makeNoise('road-jitter');
// a road passes through the place in its cell (the largest one), not the cell's centre
const cellPlace = new Map();
for (const p of places) { const g = cellOf(p); const o = cellPlace.get(g); if (!o || p.pop > o.pop) cellPlace.set(g, p); }
// minor roads (cls) wander between the cells like real lanes; main roads keep their line
function cellsToLine(cells, cls = 9, snap = true) {
  const lane = cls <= 1, amp = lane ? 0.75 : 0.55;
  const at = (c, k) => {
    const pl = snap && cellPlace.get(c);
    if (pl) return [pl.x, pl.y];
    const x = (c % GW) * G + 1, y = ((c / GW) | 0) * G + 1;
    if (k === 0 || k === cells.length - 1) return [x, y];
    return [x + jn.n(x * 0.7, y * 0.7) * amp, y + jn.n(x * 0.7 + 9, y * 0.7) * amp];
  };
  const pts = [];
  cells.forEach((c, k) => {
    const q = at(c, k);
    if (lane && k) {
      // a bend between two cells, off the straight line between them
      const [px, py] = pts[pts.length - 1], mx = (px + q[0]) / 2, my = (py + q[1]) / 2;
      const dx = q[0] - px, dy = q[1] - py, l = Math.hypot(dx, dy) || 1, b = jn.n(mx * 0.9 + 31, my * 0.9) * 0.45 * l;
      pts.push([mx - (dy / l) * b, my + (dx / l) * b]);
    }
    pts.push(q);
  });
  return simplify(chaikin(pts, 3), lane ? 0.03 : 0.05);
}
const roads = chains(roadEdges, (e) => `${e.c}|${e.ref}`).map((ch) => ({ c: ch.e.c, ref: ch.e.ref, pts: cellsToLine(ch.cells, ch.e.c) }));
const rails = chains(railEdges, (e) => (e.disused ? 1 : 0)).map((ch) => ({ disused: ch.e.disused, pts: cellsToLine(ch.cells, 9, false) }));
log(`road lines ${roads.length}, rail lines ${rails.length}`);
// stations on the rail lines
for (const p of places) {
  if (p.pop < 2500 && !p.canon) continue;
  const g = cellOf(p);
  let on = false;
  for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) if (railOn[g + dy * GW + dx]) on = true;
  if (on) p.station = true;
}
// canon landmarks that depend on routing: the Route 9 bridge and the border crossing
const r9path = (r9a || []).concat(r9b || []);
Object.assign(ctx, { roads, rails, roadCls, railOn, r9path, route, cellOf });

// ---------------------------------------------------------------- rivers: main stems traced from the mouths
const dirArr = read('dir.i32', Int32Array);
const RT = 150;
const kids = new Map();
for (let i = 0; i < N; i++) {
  if (!land[i] || acc[i] < RT || dirArr[i] < 0) continue;
  const d = dirArr[i];
  if (!kids.has(d)) kids.set(d, []);
  kids.get(d).push(i);
}
let riverOut = [];
{
  const mouths = [];
  for (let i = 0; i < N; i++) if (land[i] && acc[i] >= RT && (dirArr[i] < 0 || acc[dirArr[i]] < RT || !land[dirArr[i]])) mouths.push(i);
  const stack = mouths.map((m) => [m, -1]);
  while (stack.length) {
    const [start, joinCell] = stack.pop();
    const cells = joinCell >= 0 ? [joinCell, start] : [start];
    let c = start;
    while (true) {
      const ks = kids.get(c);
      if (!ks || !ks.length) break;
      ks.sort((a, q) => acc[q] - acc[a]);
      for (let k = 1; k < ks.length; k++) stack.push([ks[k], c]);
      c = ks[0];
      cells.push(c);
    }
    cells.reverse(); // source -> mouth
    if (cells.length < 3) continue;
    // extend mouths into the sea so they meet the coast
    const last = cells[cells.length - 1];
    const pts = cells.map((k) => [k % W + 0.5, ((k / W) | 0) + 0.5]);
    if (dirArr[last] === -2) {
      const lx = last % W, ly = (last / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = lx + dx, ny = ly + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !land[ny * W + nx]) { pts.push([nx + 0.5 + dx * 0.6, ny + 0.5 + dy * 0.6]); break; }
      }
    }
    // The cells run in the grid's eight directions, with steps and right angles that water does
    // not take. Each point becomes the weighted mean of its neighbours (the ends stay), which turns
    // steps into slants and corners into bends; then a gentle meander across the flow, rounded off.
    const n = pts.length;
    const sm = pts.map(([x, y], k) => {
      if (k === 0 || k === n - 1) return [x, y];
      let sx = 0, sy = 0, sw = 0;
      for (let j = -3; j <= 3; j++) { const q = pts[Math.max(0, Math.min(n - 1, k + j))], wgt = 4 - Math.abs(j); sx += q[0] * wgt; sy += q[1] * wgt; sw += wgt; }
      return [sx / sw, sy / sw];
    });
    const mea = sm.map(([x, y], k) => {
      if (k === 0 || k === n - 1) return [x, y];
      const [ax, ay] = sm[k - 1], [bx, by] = sm[k + 1], l = Math.hypot(bx - ax, by - ay) || 1;
      const off = jn.n(x * 0.35, y * 0.35) * 0.4 * Math.min(1, k / 3, (n - 1 - k) / 3); // (none at the ends)
      return [x - ((by - ay) / l) * off, y + ((bx - ax) / l) * off];
    });
    const line = simplify(chaikin(mea, 3), 0.04);
    // a tributary's last cell is the junction on the bigger river; measure before it
    const a0 = acc[cells[0]], a1 = acc[cells[cells.length - (joinCell >= 0 ? 2 : 1)]];
    riverOut.push({ pts: line, a0, a1, len: line.length, cells, joins: joinCell >= 0 });
  }
}
// a tributary ends where it meets its river: that river's line moved when it was smoothed, so the
// tributary's last point goes onto it
{
  const owner = new Map(); // cell -> the river it is inside of (not just the end of)
  for (const r of riverOut) for (let k = 0; k < r.cells.length - 1; k++) owner.set(r.cells[k], r);
  let joined = 0;
  for (const r of riverOut) {
    if (!r.joins) continue;
    const main = owner.get(r.cells[r.cells.length - 1]);
    if (!main || main === r) continue;
    const [x, y] = r.pts[r.pts.length - 1];
    let best = null, bd = Infinity;
    for (let i = 1; i < main.pts.length; i++) {
      const [ax, ay] = main.pts[i - 1], [bx, by] = main.pts[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)), qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(qx - x, qy - y);
      if (d < bd) { bd = d; best = [qx, qy]; }
    }
    if (best) { r.pts[r.pts.length - 1] = best; joined++; }
  }
  log(`tributaries joined to their rivers: ${joined}`);
}
// names: canon rivers by matching the design paths, then the other big stems
{
  const canon = terrain.canon;
  const meanDist = (r, path) => {
    let s = 0, n = 0;
    for (let k = 0; k < r.pts.length; k += 6) {
      const [x, y] = r.pts[k];
      let bd = Infinity;
      for (let j = 0; j < path.length - 1; j++) {
        const dx = path[j + 1][0] - path[j][0], dy = path[j + 1][1] - path[j][1], l2 = dx * dx + dy * dy;
        const tt = Math.max(0, Math.min(1, ((x - path[j][0]) * dx + (y - path[j][1]) * dy) / l2));
        bd = Math.min(bd, Math.hypot(path[j][0] + tt * dx - x, path[j][1] + tt * dy - y));
      }
      s += bd; n++;
    }
    return s / n;
  };
  const NAMES = { halve: 'Halve', auren: 'Auren', ireyn: 'Ireyn' };
  // label every vertex of a big stem with the canon river it follows (if any), then cut
  // the stem where the label changes, so e.g. the Auren and the lower Halve are separate
  const paths = Object.entries(canon);
  const nearCanon = (x, y) => {
    let best = null, bd = 9;
    for (const [id, path] of paths) {
      for (let j = 0; j < path.length - 1; j++) {
        const ax = path[j][0], ay = path[j][1], bx = path[j + 1][0], by = path[j + 1][1];
        if (x < Math.min(ax, bx) - bd || x > Math.max(ax, bx) + bd || y < Math.min(ay, by) - bd || y > Math.max(ay, by) + bd) continue;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + tt * dx - x, ay + tt * dy - y);
        if (d < bd) { bd = d; best = id; }
      }
    }
    return best;
  };
  const pieces = [];
  for (const r of riverOut) {
    if (r.a1 < 3000) { pieces.push(r); continue; }
    const raw = r.pts.map(([x, y]) => nearCanon(x, y));
    // majority over a window, so a brief wander does not cut the river
    const lab = raw.map((_, i) => {
      const cnt = new Map();
      for (let k = Math.max(0, i - 12); k <= Math.min(raw.length - 1, i + 12); k++) cnt.set(raw[k], (cnt.get(raw[k]) || 0) + 1);
      return [...cnt.entries()].sort((a, q) => q[1] - a[1])[0][0];
    });
    let start = 0;
    const accAt = (i) => acc[r.cells[Math.min(r.cells.length - 1, Math.round((i / (r.pts.length - 1)) * (r.cells.length - 1)))]];
    for (let i = 1; i <= r.pts.length; i++) {
      if (i < r.pts.length && lab[i] === lab[start]) continue;
      const pts = r.pts.slice(start, Math.min(r.pts.length, i + 1));
      if (pts.length >= 2) pieces.push({ pts, a0: accAt(start), a1: accAt(Math.min(r.pts.length - 1, i)), cells: r.cells, name: lab[start] ? NAMES[lab[start]] : undefined });
      start = i;
    }
  }
  riverOut = pieces;
  // the Ireyn is the big river that comes down from the north and turns east at Tollen:
  // the stem that ends on the lower Ireyn takes the name, and the small streams left in the
  // old valley lose it
  {
    // of the big stems that end on the lower Ireyn, the one that ends furthest west (at the bend)
    const lower = riverOut.filter((r) => r.name === 'Ireyn' && r.a1 > 200000);
    const end = (r) => r.pts[r.pts.length - 1];
    const onLower = ([x, y]) => lower.some((r) => r.pts.some(([px, py]) => Math.hypot(px - x, py - y) < 4));
    const upper = riverOut.filter((r) => !r.name && r.a1 > 100000 && onLower(end(r))).sort((a, q) => end(a)[0] - end(q)[0])[0];
    if (upper) {
      upper.name = 'Ireyn';
      for (const r of riverOut) if (r.name === 'Ireyn' && r !== upper && r.a1 < 100000) r.name = undefined;
      log(`upper Ireyn from ${upper.pts[0].map((v) => v.toFixed(0))}`);
    }
  }
  const rn = makeNamer('river-names');
  for (const r of riverOut.slice().sort((a, q) => q.a1 - a.a1)) {
    if (r.name || r.a1 < 9000) continue;
    const mid = r.pts[(r.pts.length / 2) | 0];
    const cty = CID[country[idx(mid[0], mid[1])]] || 'est';
    const lang = COUNTRIES.find((c) => c.id === cty)?.lang || 'est';
    r.name = rn(lang, { allowTwo: false });
  }
}
log(`rivers: ${riverOut.length}, named ${riverOut.filter((r) => r.name).length}`);
// a side river ends on the river it joins: smoothing moves the bigger river's line a little,
// so carry each end on to the nearest point of a bigger river within 2 km
{
  const CELL = 1, grid = new Map();
  riverOut.forEach((r, ri) => r.pts.forEach(([x, y], k) => {
    const key = ((x / CELL) | 0) * 100000 + ((y / CELL) | 0);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(ri, k);
  }));
  let joined = 0;
  const starts = new Set(riverOut.map((r) => Math.round(r.pts[0][0] * 20) + ',' + Math.round(r.pts[0][1] * 20)));
  riverOut.forEach((r, ri) => {
    const [ex, ey] = r.pts[r.pts.length - 1];
    if (starts.has(Math.round(ex * 20) + ',' + Math.round(ey * 20))) return; // it goes on under another name
    let best = null, bd = 2;
    for (let gy = ((ey / CELL) | 0) - 2; gy <= ((ey / CELL) | 0) + 2; gy++) for (let gx = ((ex / CELL) | 0) - 2; gx <= ((ex / CELL) | 0) + 2; gx++) {
      const l = grid.get(gx * 100000 + gy);
      if (!l) continue;
      for (let i = 0; i < l.length; i += 2) {
        const o = riverOut[l[i]], k = l[i + 1];
        if (l[i] === ri || o.a1 < r.a1 * 1.2 || k === 0) continue;
        const [ax, ay] = o.pts[k - 1], [bx, by] = o.pts[k], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-12;
        const t = Math.max(0, Math.min(1, ((ex - ax) * dx + (ey - ay) * dy) / l2));
        const d = Math.hypot(ax + t * dx - ex, ay + t * dy - ey);
        if (d < bd) { bd = d; best = [ax + t * dx, ay + t * dy]; }
      }
    }
    if (best && bd > 0.01) { r.pts.push(best); joined++; }
  });
  log(`side rivers carried on to their main river: ${joined}`);
}

// ---------------------------------------------------------------- lakes with names
const lakeRings = terrain.lakeRings.filter((r) => Math.abs(ringArea(r)) > 0.6).map((r) => simplifyRing(chaikin(r, 2, true), 0.08));
const lakes = lakeRings.map((ring) => {
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  return { ring, x: cx / ring.length, y: cy / ring.length, area: Math.abs(ringArea(ring)) };
});
{
  const ln = makeNamer('lake-names');
  const bm = byName['Blackmere'];
  let black = lakes.filter((l) => Math.hypot(l.x - bm.x, l.y - bm.y) < 14).sort((a, q) => q.area - a.area)[0];
  if (!black) {
    // the Black Mere: a small moorland lake beside the hamlet
    const ring = [];
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2, r = 1.2 + 0.35 * jn.n(Math.cos(a) * 2, Math.sin(a) * 2);
      ring.push([bm.x - 2.2 + Math.cos(a) * r * 1.4, bm.y + 1.6 + Math.sin(a) * r]);
    }
    black = { ring, x: bm.x - 2.2, y: bm.y + 1.6, area: 6 };
    lakes.push(black);
  }
  black.name = 'Black Mere';
  for (const l of lakes.sort((a, q) => q.area - a.area)) {
    if (l.name || l.area < 12) continue;
    const cty = CID[country[idx(l.x, l.y)]] || 'est';
    const lang = COUNTRIES.find((c) => c.id === cty)?.lang || 'est';
    const base = ln(lang, { allowTwo: false });
    const r = rand();
    l.name = lang !== 'est' ? (lang === 'nor' ? base + 'vatnet' : lang === 'var' ? 'Lac de ' + base : lang === 'mir' ? 'Jezero ' + base : lang === 'alc' ? 'Lago ' + base : base + 'see') : r < 0.45 ? 'Lake ' + base : r < 0.75 ? base + ' Water' : base + ' Mere';
  }
}
log(`lakes: ${lakes.length}, named ${lakes.filter((l) => l.name).length}`);

// ---------------------------------------------------------------- peaks
const peaks = [];
{
  const pn = makeNamer('peak-names');
  const cand = [];
  for (let y = 4; y < H - 4; y += 3) for (let x = 4; x < W - 4; x += 3) {
    const i = y * W + x;
    if (!land[i] || elev[i] < 1500 || !isLoaded(x, y)) continue;
    let top = true;
    for (let dy = -6; dy <= 6 && top; dy += 2) for (let dx = -6; dx <= 6 && top; dx += 2) if (elev[idx(x + dx, y + dy)] > elev[i]) top = false;
    if (top) cand.push([elev[i], x + 0.5, y + 0.5]);
  }
  cand.sort((a, q) => q[0] - a[0]);
  for (const [e, x, y] of cand) {
    if (peaks.some((p) => Math.hypot(p.x - x, p.y - y) < 28)) continue;
    const cty = CID[country[idx(x, y)]] || 'est';
    const lang = COUNTRIES.find((c) => c.id === cty)?.lang || 'est';
    const base = pn(lang, { allowTwo: false });
    const name = lang === 'est' ? (rand() < 0.5 ? 'Mount ' + base : base + (rand() < 0.5 ? ' Pike' : ' Fell')) : lang === 'nor' ? base + 'tind' : lang === 'var' ? 'Mont ' + base : lang === 'mir' ? 'Vrh ' + base : lang === 'alc' ? 'Pico ' + base : base + 'horn';
    peaks.push({ name, x, y, ele: Math.round(e), country: cty });
    if (peaks.length >= 70) break;
  }
}
log(`peaks: ${peaks.length}`);

// ---------------------------------------------------------------- forests, glaciers, parks
const fnz = makeNoise('forest');
const forestF = new Float32Array(N);
{
  const dTown = new Float32Array(GN).fill(60);
  for (const p of places) {
    if (p.pop < 800) continue;
    const r = Math.min(40, 4 + Math.sqrt(p.pop) / 25);
    const g0x = (p.x / G) | 0, g0y = (p.y / G) | 0, R = Math.ceil(r / G);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const gx = g0x + dx, gy = g0y + dy;
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      const d = Math.hypot(dx, dy) * G / r * 60;
      const g = gy * GW + gx;
      if (d < dTown[g]) dTown[g] = d;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!land[i] || lake[i]) { forestF[i] = -1; continue; }
    const e = elev[i];
    const tree = 1950 - Math.max(0, 600 - y) * 0.6; // lower tree line in the cold north
    let f = fnz.fbm(x / 80, y / 80, 4) * 0.75 + fnz.fbm(x / 20, y / 20, 2) * 0.16;
    f += (y < 520 ? 0.25 : 0) + (x < 700 && y < 900 ? 0.18 : 0); // north and Lumiria: deep pine
    f += e > 500 ? Math.min(0.3, (e - 500) / 1500) : 0;
    f -= e > tree ? 2 : 0;
    f -= y > 1450 ? 0.25 : 0; // the dry south
    const g = ((y / G) | 0) * GW + ((x / G) | 0);
    f -= Math.max(0, (60 - dTown[g]) / 60) * 0.55;
    f -= roadCls[g] >= 3 ? 0.08 : 0;
    forestF[i] = f;
  }
}
const forestRings = contours(forestF, W, H, 0.12).filter((r) => Math.abs(ringArea(r)) > 9).map((r) => simplifyRing(chaikin(r, 1, true), 0.18));
const glacierF = new Float32Array(N);
for (let i = 0; i < N; i++) glacierF[i] = land[i] ? elev[i] + fnz.fbm((i % W) / 6, ((i / W) | 0) / 6, 2) * 150 : 0;
const glacierRings = contours(glacierF, W, H, 2650).filter((r) => Math.abs(ringArea(r)) > 1).map((r) => simplifyRing(chaikin(r, 1, true), 0.12));
log(`forest rings ${forestRings.length}, glaciers ${glacierRings.length}`);
// national parks round the high ground in Esteloria
const PARKS = [
  { name: 'Kesten National Park', at: [1460, 520], r: 75 },
  { name: 'Grey Fells National Park', at: [960, 230], r: 55 },
  { name: 'Lumiria Forest National Park', at: [470, 600], r: 60 },
  { name: 'Varsenne Heights Reserve', at: [1960, 680], r: 45 },
  { name: 'Carrow Ridge Nature Reserve', at: [1100, 1340], r: 30 },
];
const parks = PARKS.map((p) => {
  const R = Math.ceil(p.r * 1.6), S2 = 2;
  const w = Math.ceil((2 * R) / S2), h = w, f = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = p.at[0] - R + i * S2, y = p.at[1] - R + j * S2;
    const d = Math.hypot(x - p.at[0], y - p.at[1]) / p.r;
    const k = idx(x, y);
    f[j * w + i] = country[k] === 0 && land[k] ? 1 - d + fnz.fbm(x / 30, y / 30, 3) * 0.45 + Math.min(0.3, elev[k] / 4000) : -1;
  }
  const rings = contours(f, w, h, 0.2, S2, p.at[0] - R, p.at[1] - R).filter((r) => Math.abs(ringArea(r)) > 20).map((r) => simplifyRing(chaikin(r, 2, true), 0.25));
  return { name: p.name, rings, x: p.at[0], y: p.at[1] };
});

// ---------------------------------------------------------------- built-up areas
// The drawn town is larger than urbanR (which the roads above were routed with, and which
// stays as it is): about 3.9 times as wide for villages and small towns, 2.6 times for the
// capital. The town inside is drawn TS (lib/townscale.mjs) times its size, so a bigger
// footprint here goes with a bigger TS, not with more houses.
const builtScale = (pop) => 1.875 * Math.max(1.4, Math.min(2.1, 2.1 - 0.22 * Math.log10(Math.max(1, pop / 2000))));
const MAP_K = 0.5;
const builtR = (pop) => (urbanR(pop) * builtScale(pop)) / MAP_K;
// the nearest sea or lake shore within `max` km of a place, on the 1 km raster
function nearestShore(p, max) {
  let best = null, bd = max;
  const M = Math.ceil(max);
  for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) {
    const x = p.x + dx, y = p.y + dy, d = Math.hypot(dx, dy);
    if (d >= bd) continue;
    const k = idx(x, y);
    if (!land[k] || lake[k]) { bd = d; best = [Math.floor(x) + 0.5, Math.floor(y) + 0.5]; }
  }
  return best;
}
const segD = (x, y, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
  return Math.hypot(x - ax - t * vx, y - ay - t * vy);
};
// the nearest point on any road, for towns the road network passes by
const roadBoxes = roads.map((rd) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of rd.pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; });
function nearestRoad(p, max) {
  let best = null, bd = max;
  roads.forEach((rd, i) => {
    const b = roadBoxes[i];
    if (p.x < b[0] - bd || p.x > b[2] + bd || p.y < b[1] - bd || p.y > b[3] + bd) return;
    for (let k = 1; k < rd.pts.length; k++) {
      const [ax, ay] = rd.pts[k - 1], [bx, by] = rd.pts[k];
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / l2));
      const qx = ax + t * vx, qy = ay + t * vy, d = Math.hypot(p.x - qx, p.y - qy);
      if (d < bd) { bd = d; best = [qx, qy]; }
    }
  });
  return best;
}
const urban = [];
// ground already built on, at 0.5 km: places are laid out largest first, and a village that a
// city has grown over is a neighbourhood of the city (its name stays), not a second town on top
const CLR = 0.5, CW = Math.ceil(W / CLR), CHh = Math.ceil(H / CLR);
const claimed = new Uint8Array(CW * CHh);
const isClaimed = (x, y) => { const i = Math.floor(x / CLR), j = Math.floor(y / CLR); return i >= 0 && j >= 0 && i < CW && j < CHh && claimed[j * CW + i] === 1; };
function claim(rings) {
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const [, y] of r) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let j = Math.max(0, Math.floor(y0 / CLR)); j <= Math.min(CHh - 1, Math.ceil(y1 / CLR)); j++) {
    const yy = (j + 0.5) * CLR, xs = [];
    for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [xi, yi] = r[i], [xk, yk] = r[k];
      if ((yi > yy) !== (yk > yy)) xs.push(xi + ((yy - yi) * (xk - xi)) / (yk - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] / CLR - 0.5)); i <= Math.min(CW - 1, Math.floor(xs[k + 1] / CLR - 0.5)); i++) claimed[j * CW + i] = 1;
  }
}
for (const p of [...places].sort((a, b) => b.pop - a.pop)) {
  if (p.kind === 'hamlet' || !isLoaded(p.x, p.y)) continue; // every village has houses; hamlets are farms (extras)
  if (isClaimed(p.x, p.y)) continue;
  const r = builtR(p.pop);
  const S2 = (r * MAP_K > 6 ? 0.25 : 0.12) / MAP_K;
  // a town near the water grows down to it: a quarter along the way and a waterfront
  const shore = nearestShore(p, Math.max(2.5 / MAP_K, r * 1.4));
  // a town the roads pass by grows out along its approach road to meet them
  const road = nearestRoad(p, r * 4 + 3 / MAP_K);
  const dRoad = road ? Math.hypot(road[0] - p.x, road[1] - p.y) : 0;
  const R = Math.max(r * 1.7, shore ? Math.hypot(shore[0] - p.x, shore[1] - p.y) + r * 0.6 : 0, dRoad + r * 0.4);
  const w = Math.ceil((2 * R) / S2), h = w;
  const f = new Float32Array(w * h);
  const un = makeNoise('urban-' + p.id);
  // distance (km) to the roads through the window: houses line the roads out of town
  const RB = Math.max(0.5 / MAP_K, r * 0.25); // how far the ribbon reaches either side
  const dr = new Float32Array(w * h).fill(Infinity);
  const x0w = p.x - R, y0w = p.y - R;
  roads.forEach((rd, ri) => {
    const b = roadBoxes[ri];
    if (b[2] < x0w - RB || b[0] > x0w + 2 * R + RB || b[3] < y0w - RB || b[1] > y0w + 2 * R + RB) return;
    for (let k = 1; k < rd.pts.length; k++) {
      const [ax, ay] = rd.pts[k - 1], [bx, by] = rd.pts[k];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - RB - x0w) / S2)), i1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + RB - x0w) / S2));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - RB - y0w) / S2)), j1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + RB - y0w) / S2));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = segD(x0w + i * S2, y0w + j * S2, ax, ay, bx, by);
        if (d < dr[j * w + i]) dr[j * w + i] = d;
      }
    }
  });
  // a village is a few houses round a crossroads and along its lanes; a town has a body
  const vil = p.pop < 3000;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = p.x - R + i * S2, y = p.y - R + j * S2;
    const k = idx(x, y);
    if (!land[k] || lake[k] || isClaimed(x, y)) { f[j * w + i] = -1; continue; }
    const d = Math.hypot(x - p.x, y - p.y) / r;
    // sprawl follows the roads out of town
    const along = (vil ? 0.75 : 0.3) * Math.max(0, 1 - dr[j * w + i] / RB);
    let core = 1 - d * (vil ? 1.5 : 1);
    if (shore) {
      const dw = Math.min(segD(x, y, p.x, p.y, shore[0], shore[1]) / (r * 0.55), Math.hypot(x - shore[0], y - shore[1]) / (r * 0.7));
      core = Math.max(core, 1 - dw - 0.1);
    }
    if (road && dRoad > r * 0.5) {
      // a ribbon along the approach, reaching a little past the road
      const ex = road[0] + ((road[0] - p.x) / dRoad) * (0.15 / MAP_K), ey = road[1] + ((road[1] - p.y) / dRoad) * (0.15 / MAP_K);
      core = Math.max(core, 1 - segD(x, y, p.x, p.y, ex, ey) / Math.max(0.25 / MAP_K, r * 0.35) - 0.05);
    }
    f[j * w + i] = core + un.fbm(x / (r * 0.45 + 0.3 / MAP_K), y / (r * 0.45 + 0.3 / MAP_K), 3) * 0.42 + along - Math.max(0, elev[k] - elev[idx(p.x, p.y)]) / 400;
  }
  const rings = contours(f, w, h, 0.18, S2, p.x - R, p.y - R).filter((rr) => Math.abs(ringArea(rr)) > S2 * S2 * 6).map((rr) => simplifyRing(chaikin(rr, 1, true), S2 * 0.4));
  if (rings.length) { urban.push({ id: p.id, big: p.pop >= 3000, rings }); claim(rings); }
}
log(`urban areas: ${urban.length}`);

// ---------------------------------------------------------------- the City of Aurenhal
// The capital within its own limits is a province of its own, inside the capital district
// (as a capital city often is). The limits take in about the city's built-up area.
const REGIONS = [...PROVINCES, { name: 'City of Aurenhal', desc: 'The capital within its city limits, governed as a province of its own.', city: true }];
{
  const CITY = PROVINCES.length, cap = places.find((p) => p.kind === 'capital');
  const u = urban.find((q) => q.id === cap.id);
  const area = u.rings.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
  const R = Math.sqrt(area / Math.PI) * 1.05;
  const cn = makeNoise('city-limits');
  let n = 0;
  for (let g = 0; g < GN; g++) {
    if (prov[g] < 0) continue;
    const x = (g % GW) * G + 1, y = ((g / GW) | 0) * G + 1;
    const d = Math.hypot(x - cap.x, y - cap.y);
    if (d < R * (1 + cn.fbm(x / (R * 0.6), y / (R * 0.6), 3) * 0.3)) { prov[g] = CITY; n++; }
  }
  ({ rings: provinceRings, borders: provBorders } = provinceLines(REGIONS.length));
  ctx.provinceRings = provinceRings;
  log(`City of Aurenhal: ${(n * G * G * MAP_K * MAP_K).toFixed(0)} km² on the map, ${provBorders.length} province lines`);
}

// ---------------------------------------------------------------- sites: TPF facilities and landmarks
const provRank = (prov, rank) => places.filter((p) => p.province === prov && (p.kind === 'city' || p.kind === 'town') && !p.canon).sort((a, q) => q.pop - a.pop)[rank];
function resolveNear(near) {
  if (typeof near === 'string') return places.find((p) => p.name === near);
  return provRank(near.province, near.rank) || provRank(near.province, 0);
}
const sites = [];
for (const f of FACILITIES) {
  const base = resolveNear(f.near);
  if (!base) { console.warn('no base for', f.id); continue; }
  let x, y;
  if (f.at) {
    // a fixed spot; `forest` moves it to the deepest forest close by
    [x, y] = f.at;
    if (f.forest) {
      let best = -1e9;
      for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) {
        const k = idx(f.at[0] + dx, f.at[1] + dy);
        const v = forestF[k] - Math.hypot(dx, dy) * 0.004;
        if (land[k] && !lake[k] && v > best) { best = v; x = f.at[0] + dx + 0.5; y = f.at[1] + dy + 0.5; }
      }
    }
  } else {
    x = base.x + f.off[0]; y = base.y + f.off[1];
    if (!land[idx(x, y)] || lake[idx(x, y)]) { x = base.x + f.off[0] * 0.4; y = base.y + f.off[1] * 0.4; }
  }
  const name = typeof f.near === 'string' ? f.name : f.name.replace(/^(Westmarch|Lumiria|Kestmark|Ardmere|Midmarch|Southern Reach|Lower Halve|Eastern|Corvenne Coast|Duncarrow|Dales)\b/, (m) => m);
  sites.push({ ...f, near: undefined, off: undefined, name, x, y, town: base.name, province: base.province, tpf: true });
}
// Route 9 bridge: where Route 9 crosses the Ireyn; border crossing: where it leaves Esteloria
const r9 = r9path.map((g) => [(g % GW) * G + 1, ((g / GW) | 0) * G + 1]);
const ireyn = riverOut.find((r) => r.name === 'Ireyn');
for (const l of LANDMARKS) {
  let x, y;
  if (l.border === 'east') {
    for (let k = 1; k < r9.length; k++) if (country[idx(r9[k][0], r9[k][1])] !== 0 && country[idx(r9[k - 1][0], r9[k - 1][1])] === 0) { [x, y] = r9[k - 1]; break; }
    if (x === undefined) continue;
  } else if (l.name === 'Route 9 Bridge' && ireyn) {
    // where the drawn Route 9 crosses the drawn Ireyn, the crossing nearest Tollen
    let bd = Infinity;
    for (const rd of roads) {
      if (rd.c !== 3 || rd.ref !== 9) continue;
      for (const rv of riverOut) {
        if (rv.name !== 'Ireyn') continue;
        for (let i = 1; i < rd.pts.length; i++) for (let j = 1; j < rv.pts.length; j++) {
          const [ax, ay] = rd.pts[i - 1], [bx, by] = rd.pts[i], [cx, cy] = rv.pts[j - 1], [dx, dy] = rv.pts[j];
          const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
          if (Math.abs(den) < 1e-12) continue;
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den, u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const px = ax + t * (bx - ax), py = ay + t * (by - ay), d = Math.hypot(px - tollen.x, py - tollen.y);
          if (d < bd) { bd = d; x = px; y = py; }
        }
      }
    }
  } else {
    const base = resolveNear(l.near);
    if (!base) continue;
    x = base.x + l.off[0]; y = base.y + l.off[1];
    if (l.snapRiver) {
      let bd = Infinity, bx = x, by = y;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const k = idx(x + dx, y + dy);
        if (land[k] && acc[k] > 8000) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; bx = Math.floor(x + dx) + 0.5; by = Math.floor(y + dy) + 0.5; } }
      }
      x = bx; y = by;
    }
  }
  const town = places.filter((p) => p.kind !== 'hamlet').sort((a, q) => Math.hypot(a.x - x, a.y - y) - Math.hypot(q.x - x, q.y - y))[0];
  sites.push({ ...l, near: undefined, off: undefined, x, y, town: town?.name, province: town?.province });
}
log(`sites: ${sites.length}`);

// ---------------------------------------------------------------- borders and province labels
// border lines from the country grid (sea counts as the nearest country so coasts are not borders)
const cFill = new Uint8Array(N);
{
  const q = [];
  for (let i = 0; i < N; i++) { cFill[i] = country[i]; if (country[i] !== 255) q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (cFill[n] === 255) { cFill[n] = cFill[c]; q.push(n); }
    }
  }
}
const borderLines = [];
{
  // walk cell edges between different countries, then chain them
  const segs = new Map();
  const addSeg = (a, c) => { const k = a + ',' + c; segs.set(a, (segs.get(a) || []).concat([c])); segs.set(c, (segs.get(c) || []).concat([a])); };
  const vid = (x, y) => y * (W + 1) + x;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x + 1 < W && cFill[i] !== cFill[i + 1]) addSeg(vid(x + 1, y), vid(x + 1, y + 1));
    if (y + 1 < H && cFill[i] !== cFill[i + W]) addSeg(vid(x, y + 1), vid(x + 1, y + 1));
  }
  const seen = new Set();
  const ekey2 = (a, c) => (a < c ? a + '-' + c : c + '-' + a);
  for (const [v, nb] of segs) {
    if (nb.length === 2) continue;
    for (const n0 of nb) {
      if (seen.has(ekey2(v, n0))) continue;
      const line = [v];
      let prev = v, cur = n0;
      seen.add(ekey2(v, n0));
      while (true) {
        line.push(cur);
        const l = segs.get(cur);
        if (l.length !== 2) break;
        const nxt = l[0] === prev ? l[1] : l[0];
        if (seen.has(ekey2(cur, nxt))) break;
        seen.add(ekey2(cur, nxt)); prev = cur; cur = nxt;
      }
      borderLines.push(line);
    }
  }
  for (const [v, nb] of segs) for (const n0 of nb) {
    if (seen.has(ekey2(v, n0))) continue;
    const line = [v]; let prev = v, cur = n0; seen.add(ekey2(v, n0));
    while (true) { line.push(cur); const l = segs.get(cur); const nxt = l[0] === prev ? l[1] : l[0]; if (seen.has(ekey2(cur, nxt))) break; seen.add(ekey2(cur, nxt)); prev = cur; cur = nxt; }
    borderLines.push(line);
  }
}
// smooth: the grid's steps and small wiggles are taken out first, then the line is rounded; a
// small closed loop (a speck of one country inside another) is left out
const lineLen = (l) => l.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);
const borders = borderLines
  .map((l) => l.map((v) => [v % (W + 1), Math.floor(v / (W + 1))]))
  .filter((l) => !(l.length > 2 && l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1] && lineLen(l) < 40))
  .map((l) => simplify(chaikin(simplify(l, 1.4), 3), 0.08)).filter((l) => l.length > 1);
log(`border lines: ${borders.length}`);
// province label spot: the cell deepest inside each province
const provLabels = REGIONS.map((p, k) => {
  const d = new Float32Array(GN).fill(0), q = [];
  for (let g = 0; g < GN; g++) {
    if (prov[g] !== k) continue;
    const gx = g % GW, gy = (g / GW) | 0;
    let edge = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (gy + dy) * GW + gx + dx; if (prov[n] !== k) edge = true; }
    if (edge) { d[g] = 1; q.push(g); }
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (cy + dy) * GW + cx + dx; if (prov[n] === k && d[n] === 0) { d[n] = d[c] + 1; q.push(n); } }
  }
  let best = 0;
  for (let g = 0; g < GN; g++) if (d[g] > d[best]) best = g;
  return { name: p.name, desc: p.desc, city: p.city, x: (best % GW) * G + 1, y: ((best / GW) | 0) * G + 1, rings: provinceRings[k] };
});

// neighbours: label at the loaded cell of that country farthest from any edge of it
function countryLabelSpot(c) {
  if (c.id === 'est') return c.label;
  const k = CID.indexOf(c.id);
  const d = new Float32Array(GN).fill(0), q = [];
  const inC = (g) => gCountry[g] === k && gLand[g] && isLoaded((g % GW) * G + 1, ((g / GW) | 0) * G + 1);
  for (let g = 0; g < GN; g++) {
    if (!inC(g)) continue;
    const gx = g % GW, gy = (g / GW) | 0;
    let edge = gx === 0 || gy === 0 || gx === GW - 1 || gy === GH - 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!edge && !inC((gy + dy) * GW + gx + dx)) edge = true;
    if (edge) { d[g] = 1; q.push(g); }
  }
  for (let h = 0; h < q.length; h++) {
    const g0 = q[h], cx = g0 % GW, cy = (g0 / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = (cy + dy) * GW + cx + dx; if (n >= 0 && n < GN && inC(n) && d[n] === 0) { d[n] = d[g0] + 1; q.push(n); } }
  }
  let best = -1;
  for (let g = 0; g < GN; g++) if (d[g] > (best < 0 ? 0 : d[best])) best = g;
  return best < 0 ? c.label : [(best % GW) * G + 1, ((best / GW) | 0) * G + 1];
}

// ---------------------------------------------------------------- export
const Q = 100; // 1/Q km = 10 m precision
// the world is generated at twice its size and written at half (MAP_K): the country is half as
// wide while towns, which are made at 1 / MAP_K of their size, keep theirs
const k2 = (v) => +(v * MAP_K).toFixed(2);
const enc = (pts) => { const o = []; let px = 0, py = 0; for (const [x, y] of pts) { const X = Math.round(x * MAP_K * Q), Y = Math.round(y * MAP_K * Q); o.push(X - px, Y - py); px = X; py = Y; } return o; };
const lod = (pts, ring = false) => { const lo = ring ? simplifyRing(pts, 1.2) : simplify(pts, 1.2); return lo.length < pts.length * 0.8 ? enc(lo) : null; };
const bbox = (pts) => { let a = Infinity, b2 = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of pts) { if (x < a) a = x; if (y < b2) b2 = y; if (x > c) c = x; if (y > d) d = y; } return [Math.floor(a * MAP_K), Math.floor(b2 * MAP_K), Math.ceil(c * MAP_K), Math.ceil(d * MAP_K)]; };
const coastRings = terrain.coastRings.filter((r) => Math.abs(ringArea(r)) > 0.5).map((r) => simplifyRing(chaikin(r, 2, true), 0.06));
const world = {
  v: 1, q: Q, w: W * MAP_K, h: H * MAP_K, block: B * MAP_K, bw: BW, bh: BH,
  loaded: Buffer.from(loaded).toString('base64'),
  countries: COUNTRIES.map((c) => { const at = countryLabelSpot(c); return { id: c.id, name: c.name, x: k2(at[0]), y: k2(at[1]) }; }),
  seas: SEAS.map((s) => ({ ...s, label: [k2(s.label[0]), k2(s.label[1])] })),
  land: coastRings.map((r) => ({ b: bbox(r), p: enc(r), lo: lod(r, true) })),
  lakes: lakes.map((l) => ({ b: bbox(l.ring), p: enc(l.ring), lo: lod(l.ring, true), name: l.name, x: k2(l.x), y: k2(l.y), area: Math.round(l.area * MAP_K * MAP_K) })),
  rivers: riverOut.filter((r) => isLoaded(...r.pts[(r.pts.length / 2) | 0]) || r.a1 > 5000).map((r) => ({ b: bbox(r.pts), p: enc(r.pts), lo: lod(r.pts), a0: Math.round(r.a0), a1: Math.round(r.a1), name: r.name })),
  forests: forestRings.map((r) => ({ b: bbox(r), p: enc(r), lo: lod(r, true) })),
  glaciers: glacierRings.map((r) => ({ b: bbox(r), p: enc(r) })),
  parks: parks.map((p) => ({ name: p.name, x: k2(p.x), y: k2(p.y), rings: p.rings.map((r) => ({ b: bbox(r), p: enc(r) })) })),
  urban: urban.map((u) => ({ id: u.id, big: u.big, rings: u.rings.map((r) => ({ b: bbox(r), p: enc(r) })) })),
  roads: roads.map((r) => ({ c: r.c, ref: r.ref || undefined, b: bbox(r.pts), p: enc(r.pts), lo: r.c >= 3 ? lod(r.pts) : undefined })),
  rails: rails.map((r) => ({ d: r.disused ? 1 : undefined, b: bbox(r.pts), p: enc(r.pts) })),
  borders: borders.map((l) => ({ b: bbox(l), p: enc(l), lo: lod(l) })),
  provinces: provLabels.map((p) => ({ name: p.name, desc: p.desc, city: p.city || undefined, x: k2(p.x), y: k2(p.y), rings: p.rings.map((r) => ({ b: bbox(r), p: enc(r) })) })),
  provBorders: provBorders.map((l) => ({ b: bbox(l), p: enc(l) })),
  ranges: RANGES.map((r) => ({ name: r.name, pts: r.pts.map(([x, y]) => [k2(x), k2(y)]) })),
  peaks: peaks.map((pk) => ({ ...pk, x: k2(pk.x), y: k2(pk.y) })),
  places: places.filter((p) => isLoaded(p.x, p.y)).map((p) => ({ id: p.id, n: p.name, k: p.kind, x: k2(p.x), y: k2(p.y), pop: p.pop, c: p.country, pr: p.province, st: p.station ? 1 : undefined, canon: p.canon ? 1 : undefined, d: p.desc })),
  sites: sites.map((s) => ({ ...s, x: k2(s.x), y: k2(s.y) })),
  districts: DISTRICTS.map((d) => { const c = places.find((p) => p.name === d.city); return { ...d, x: +(c.x * MAP_K + d.off[0] * TS).toFixed(2), y: +(c.y * MAP_K + d.off[1] * TS).toFixed(2) }; }),
};
const PUB = new URL('../public/data/', import.meta.url);
fs.mkdirSync(PUB, { recursive: true });
fs.writeFileSync(new URL('world.json', PUB), JSON.stringify(world));
log(`world.json ${(fs.statSync(new URL('world.json', PUB)).size / 1e6).toFixed(1)} MB`);
// height map for the 3D page: 2 km grid (1 km once halved), metres as int16
const hm = new Int16Array(GN);
for (let g = 0; g < GN; g++) hm[g] = Math.round(gLand[g] ? Math.max(0, gElev[g]) : -40);
fs.writeFileSync(new URL('height.bin', PUB), Buffer.from(hm.buffer));
fs.writeFileSync(new URL('height.json', PUB), JSON.stringify({ w: GW, h: GH, cell: G * MAP_K }));

// ---------------------------------------------------------------- preview of this stage
const PS = 3, PW = Math.floor(W / PS), PH = Math.floor(H / PS);
const png = new PNG({ width: PW, height: PH });
const COL = [[246, 243, 236], [228, 232, 222], [232, 226, 222], [226, 228, 236], [236, 230, 218], [224, 234, 232]];
for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
  const X = x * PS, Y = y * PS, i = Y * W + X, o = (y * PW + x) * 4;
  let c;
  if (!isLoaded(X, Y)) c = [224, 222, 218];
  else if (!land[i] || lake[i]) c = [170, 211, 223];
  else c = COL[country[i]] || [255, 0, 255];
  if (land[i] && acc[i] > 2500 && isLoaded(X, Y)) c = [170, 211, 223];
  png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255;
}
const dot = (x, y, r, col) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const px = Math.round(x / PS) + dx, py = Math.round(y / PS) + dy;
    if (px < 0 || py < 0 || px >= PW || py >= PH) continue;
    const o = (py * PW + px) * 4;
    png.data[o] = col[0]; png.data[o + 1] = col[1]; png.data[o + 2] = col[2];
  }
};
for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
  const i = y * W + x;
  if (land[i] && land[i + 1] && country[i] !== country[i + 1] || land[i] && land[i + W] && country[i] !== country[i + W]) dot(x, y, 0, [120, 90, 150]);
}
for (const rings of provinceRings) for (const r of rings) for (const p of r) dot(p[0], p[1], 0, [190, 180, 200]);
for (const r of roads) { if (r.c < 2) continue; for (let k = 1; k < r.pts.length; k++) { const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k]; const n = Math.ceil(Math.hypot(bx - ax, by - ay) / PS); for (let s = 0; s <= n; s++) dot(ax + (bx - ax) * s / n, ay + (by - ay) * s / n, r.c >= 4 ? 1 : 0, r.c >= 4 ? [230, 150, 40] : r.c === 3 ? [240, 200, 90] : [180, 180, 180]); } }
for (const r of rails) for (let k = 1; k < r.pts.length; k++) { const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k]; const n = Math.ceil(Math.hypot(bx - ax, by - ay) / PS); for (let s = 0; s <= n; s += 2) dot(ax + (bx - ax) * s / n, ay + (by - ay) * s / n, 0, r.disused ? [200, 120, 120] : [60, 60, 60]); }
for (const p of places) {
  if (!isLoaded(p.x, p.y)) continue;
  const r = p.kind === 'capital' ? 3 : p.kind === 'city' ? 2 : p.kind === 'town' ? 1 : 0;
  dot(p.x, p.y, r, p.canon ? [200, 40, 40] : [90, 90, 90]);
}
fs.writeFileSync(new URL('preview_places.png', OUT), PNG.sync.write(png));
log('preview');
