// The map in 3D: MapLibre with the map's own tiles (drawTile: roads, fields, rivers and the names
// of all that lies on the ground) draped over the height model at ×5, its buildings standing, and
// the names of its places and points (towns, villages, landmarks, peaks, businesses) upright. Opened and closed by the 3D button; it
// starts where the flat map is and gives its place back to it when it closes.
//
// MapLibre works in Web Mercator. The map's km are laid out linearly in its square: the square
// is WORLD km across and the map's (0, 0) is at O km, a tile corner from MapLibre zoom 7 up,
// so a MapLibre tile is exactly one of the map's tiles (tile zoom = map zoom + TZ) and the
// map's zoom z is MapLibre zoom z + ZOOM. Near the equator the projection is as good as flat.
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// (in a build, Vite makes MapLibre's worker a file of its own, where MapLibre would not look for it;
// npm run dev serves MapLibre as it is, its worker next to it: vite.config.js optimizeDeps)
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { drawLabel, drawPoi } from './render.js';

if (import.meta.env.PROD) maplibregl.setWorkerUrl(workerUrl);

const WORLD = 65536, O = 32256, TZ = 8, ZOOM = 7;
const HEIGHT = 5; // the relief: heights × 5
const KM_M = 40075016.686 / WORLD; // metres of MapLibre's earth per km of the map
const CUT = 1500; // m: how far the blocks that did not load lie below the sea
const CLEAR = 60; // m (of MapLibre's earth): the least height of the camera over the ground
const EXAG = (HEIGHT * KM_M) / 1000; // MapLibre's terrain exaggeration for heights × HEIGHT
// buildings stand from the map's street scale (render.js BUILD_Z), as tall as real ones
const HOUSES_Z = 8.5 + ZOOM;
const UPHILL = 4; // m: the least a building's walls stand over the highest ground under it
const STOREYS = { house: 2, row: 2.5, flat: 5, shed: 1.3, industrial: 3, church: 5, school: 3, shop: 2.5, compound: 3 };
const ROOF = { house: '#e2dfda', row: '#dddad6', flat: '#d8d8da', shed: '#e2ded6', industrial: '#d4d6dc', church: '#d8cec2', school: '#ded7ca', shop: '#ddd7de', compound: '#c9bdb6' };
const NONE = { type: 'FeatureCollection', features: [] };

const toLngLat = (x, y) => new maplibregl.MercatorCoordinate((O + x) / WORLD, (O + y) / WORLD).toLngLat();
const toKm = (ll) => { const m = maplibregl.MercatorCoordinate.fromLngLat(ll); return { x: m.x * WORLD - O, y: m.y * WORLD - O }; };

// the height model, sea floor left out (the sea is flat). The model is cut off square where the
// blocks that did not load begin: there the ground drops CUT m, and the map there is clear, so
// the cut faces and what lies below them are not drawn at all (the background shows)
function heightField(world, h) {
  const { w: GW, h: GH, cell, data } = h;
  const at = (gx, gy) => Math.max(0, data[Math.min(GH - 1, Math.max(0, gy)) * GW + Math.min(GW - 1, Math.max(0, gx))]);
  // elevation (m) at a point in km: Catmull-Rom between the samples (sample i is at (i + 0.5) km)
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const land = (x, y) => {
    const u = x / cell - 0.5, v = y / cell - 0.5;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const row = (jj) => cr(at(i - 1, jj), at(i, jj), at(i + 1, jj), at(i + 2, jj), fu);
    return Math.max(0, cr(row(j - 1), row(j), row(j + 1), row(j + 2), fv));
  };
  // (ledge: how far out from the block that loaded the drop is, for the tile asking: a few cells
  // of MapLibre's mesh, which is coarser than the heights. Out there the map is clear, so the drop
  // is never seen, nor a cut face stretched from the map's edge)
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  const elev = (x, y, ledge = 0) => {
    if (world.isLoaded(x, y)) return land(x, y);
    if (ledge) for (const f of [0.25, 0.5, 1]) for (const [dx, dy] of DIRS)
      if (world.isLoaded(x + dx * ledge * f, y + dy * ledge * f)) return land(x + dx * ledge * f, y + dy * ledge * f);
    return -CUT;
  };
  // (the shading needs only the slope: straight between the samples is enough, and cheaper)
  const flat = (x, y) => {
    const u = x / cell - 0.5, v = y / cell - 0.5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv;
  };
  return { elev, land, flat };
}

// the slopes, shaded into a tile (light from the north-west): MapLibre's own hillshade would
// shade the cut faces too
const SN = 32, shadeImg = new ImageData(SN, SN), shadeCanvas = document.createElement('canvas');
shadeCanvas.width = shadeCanvas.height = SN;
function shadeTile(ctx, ground, x0, y0, k) {
  const step = k / SN, d = Math.max(step, 0.3), q = shadeImg.data;
  for (let j = 0; j < SN; j++) for (let i = 0; i < SN; i++) {
    const x = x0 + (i + 0.5) * step, y = y0 + (j + 0.5) * step;
    const gx = ((ground(x + d, y) - ground(x - d, y)) / (2000 * d)) * HEIGHT, gy = ((ground(x, y + d) - ground(x, y - d)) / (2000 * d)) * HEIGHT;
    const lit = (0.5 * gx + 0.5 * gy + 0.7071) / Math.sqrt(gx * gx + gy * gy + 1) / 0.7071; // 1 on the flat
    const v = 255 * Math.max(0.6, Math.min(1, 1 - (1 - lit) * 0.5)), o = (j * SN + i) * 4;
    q[o] = q[o + 1] = q[o + 2] = v; q[o + 3] = 255;
  }
  shadeCanvas.getContext('2d').putImageData(shadeImg, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(shadeCanvas, 0, 0, 256, 256);
  ctx.restore();
}

// tiles are drawn one at a time, a frame apart, so the page never stalls
const jobs = [];
export const stats = { jobs: 0, ms: 0, max: 0 }; // (the tiles' work, to measure it)
let running = false;
function enqueue(fn, signal, tag) {
  return new Promise((resolve, reject) => {
    jobs.push({ fn, signal, resolve, reject, tag });
    if (!running) { running = true; requestAnimationFrame(runJobs); }
  });
}
async function runJobs() {
  const t0 = performance.now();
  while (jobs.length && performance.now() - t0 < 8) {
    const j = jobs.shift();
    if (j.signal?.aborted) { j.reject(new DOMException('aborted', 'AbortError')); continue; }
    const t = performance.now();
    try { j.resolve(await j.fn()); } catch (e) { j.reject(e); }
    const e = performance.now() - t;
    stats.jobs++; stats.ms += e; if (e > stats.max) { stats.max = e; stats.slowest = j.tag; }
  }
  if (jobs.length) requestAnimationFrame(runJobs);
  else running = false;
}
const tileXYZ = (url) => url.split('://')[1].split('?')[0].split('/').map(Number);

export class Map3D {
  // view: the flat map (MapView): its tiles, labels, layers and click handling
  constructor(el, view, height) {
    this.view = view;
    this.version = 0;
    this.tiles = new Map(); // MapLibre tile key: what drawTile handed back for it
    const { elev, flat } = heightField(view.world, height);
    this.elev = elev;
    const world = view.world, B = world.block;
    // (the tiles' pixels: sharp tiles only on a sharp screen with the machine to draw them)
    const R = (devicePixelRatio || 1) >= 2 && (navigator.hardwareConcurrency || 2) >= 8 ? 2 : 1, canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256 * R;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    const dem = new ImageData(256, 256);

    maplibregl.addProtocol('lodestar', async ({ url }, abort) => {
      const [zt, x, y] = tileXYZ(url), z = zt - TZ, k = WORLD / 2 ** zt;
      const tx = x - O / k, ty = y - O / k;
      await view.prepTile(tx, ty, z);
      if (abort.signal.aborted) throw new DOMException('aborted', 'AbortError');
      return { data: await enqueue(() => {
        ctx.setTransform(R, 0, 0, R, 0, 0);
        // the texts and buildings are kept, to stand up over the tile (drawTexts, the houses)
        const out = { z, labels: [], pois: [], builds: [] };
        const x0 = x * k - O, y0 = y * k - O, s = 256 / k;
        if (world.isLoaded(x0 + k / 2, y0 + k / 2) || k > B || [[0, 0], [k, 0], [0, k], [k, k]].some(([a, b]) => world.isLoaded(x0 + a * 0.999, y0 + b * 0.999))) {
          view.drawTileTo(ctx, tx, ty, z, out);
          shadeTile(ctx, flat, x0, y0, k);
        }
        // the blocks that did not load: clear (the cut)
        for (let by = Math.floor(y0 / B); by * B < y0 + k; by++) for (let bx = Math.floor(x0 / B); bx * B < x0 + k; bx++)
          if (!world.isLoaded(bx * B + 1, by * B + 1)) ctx.clearRect((bx * B - x0) * s - 0.5, (by * B - y0) * s - 0.5, B * s + 1, B * s + 1);
        const key = `${zt}/${x}/${y}`;
        this.tiles.delete(key); this.tiles.set(key, out);
        if (this.tiles.size > 3000) this.tiles.delete(this.tiles.keys().next().value);
        if (out.builds.length) this.housesDirty();
        return createImageBitmap(canvas);
      }, abort.signal, url) };
    });
    // whether any, and whether all, of the blocks a box touches loaded
    const blocksIn = (x0, y0, x1, y1) => {
      let some = false, all = true;
      for (let by = Math.floor(y0 / B); by * B < y1; by++) for (let bx = Math.floor(x0 / B); bx * B < x1; bx++) {
        if (world.isLoaded(bx * B + 1, by * B + 1)) some = true; else all = false;
      }
      return [some, all];
    };
    // (a tile that is all cut: the same pixels each time, a bitmap of its own each time, as MapLibre
    // hands it to its worker)
    const cutImg = new ImageData(256, 256);
    for (let o = 0, v = 32768 - CUT; o < cutImg.data.length; o += 4) { cutImg.data[o] = v >> 8; cutImg.data[o + 1] = v & 255; cutImg.data[o + 3] = 255; }
    // the heights as Terrarium tiles: (R * 256 + G + B / 256) - 32768 m
    maplibregl.addProtocol('lodestar-dem', async ({ url }, abort) => {
      const [zt, x, y] = tileXYZ(url), k = WORLD / 2 ** zt, x0 = x * k - O, y0 = y * k - O, px = k / 256, ledge = Math.max(px * 2, k / 32);
      // (by whole blocks first: none loaded near the tile, it is all cut; all loaded, no edge to look for)
      const [some, all] = blocksIn(x0 - ledge, y0 - ledge, x0 + k + ledge, y0 + k + ledge);
      if (!some) return { data: await createImageBitmap(cutImg, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) };
      return { data: await enqueue(() => {
        const d = dem.data, near = all ? 0 : ledge;
        for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
          const v = elev(x0 + (i + 0.5) * px, y0 + (j + 0.5) * px, near) + 32768, o = (j * 256 + i) * 4;
          d[o] = v >> 8; d[o + 1] = v & 255; d[o + 2] = Math.round((v % 1) * 256) & 255; d[o + 3] = 255;
        }
        return createImageBitmap(dem, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      }, abort.signal, url) };
    });

    const map = (this.map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        sources: {
          map: { type: 'raster', tiles: ['lodestar://{z}/{x}/{y}'], tileSize: 256, minzoom: 7, maxzoom: 20 },
          dem: { type: 'raster-dem', tiles: ['lodestar-dem://{z}/{x}/{y}'], tileSize: 256, minzoom: 7, maxzoom: 10, encoding: 'terrarium' },
          houses: { type: 'geojson', data: NONE },
        },
        layers: [
          // (no background: where the map is clear, nothing is drawn)
          { id: 'map', type: 'raster', source: 'map', paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
          { id: 'houses', type: 'fill-extrusion', source: 'houses', minzoom: HOUSES_Z - 0.5,
            paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-vertical-gradient': true,
              'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], HOUSES_Z - 0.5, 0, HOUSES_Z, 1] } },
        ],
        terrain: { source: 'dem', exaggeration: (HEIGHT * KM_M) / 1000 },
        sky: { 'sky-color': '#bcd3ea', 'horizon-color': '#e5e3de', 'fog-color': '#e5e3de', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.7, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0 },
      },
      center: [0, 0], zoom: 8,
      minZoom: -1 + ZOOM, maxZoom: 12.99 + ZOOM,
      // never level with the ground, nor under it; and the more it sees of the distance, the more
      // tiles it draws
      maxPitch: 60,
      pixelRatio: Math.min(1.5, devicePixelRatio || 1),
      renderWorldCopies: false,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      fadeDuration: 0,
    }));
    // never under the ground, nor in it, nor down by the cut-off blocks: MapLibre only lifts the
    // camera to the surface; this keeps it CLEAR metres above it and above the sea's level, by zooming out (back and up along its own line of sight)
    const low = (tr) => { const g = map.queryTerrainElevation(tr.getCameraLngLat()); return g != null && tr.getCameraAltitude() < Math.max(g, 0) + CLEAR; };
    const lifted = (tr) => {
      if (!low(tr)) return null;
      let t = tr, z = tr.zoom;
      for (let i = 0; i < 40 && low(t); i++) { z -= 0.05; t = tr.clone(); t.setZoom(z); }
      return z;
    };
    let cam = null; // (the camera as last moved: MapLibre does not give its height otherwise)
    map.setTransformCameraUpdate((tr) => {
      cam = tr;
      const z = lifted(tr);
      return z == null ? {} : { zoom: z };
    });
    // (and again once finer heights have come in under a camera that has stopped)
    map.on('idle', () => {
      const z = cam && lifted(cam);
      if (z != null) map.jumpTo({ zoom: z });
    });
    // a click on a standing text picks what it names; elsewhere, what is on the ground there
    map.on('click', (e) => {
      if (!view.editClick) for (let i = this.hits.length - 1; i >= 0; i--) {
        const [b, t] = this.hits[i];
        if (e.point.x >= b[0] && e.point.x <= b[2] && e.point.y >= b[1] && e.point.y <= b[3]) { view.onSelect(t); return; }
      }
      const p = toKm(e.lngLat); view.clickAt(p.x, p.y, this.zoom, e.originalEvent);
    });
    // the texts: a canvas over the map, drawn with every frame
    this.hits = [];
    const tc = (this.textCanvas = document.createElement('canvas'));
    tc.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    map.getCanvasContainer().appendChild(tc);
    map.on('render', () => this.drawTexts());
    map.on('resize', () => this.sizeTexts());
    this.sizeTexts();
    this.housesTimer = 0;
    map.on('moveend', () => this.housesDirty());
    // the flat map's bounds hold the centre (not the whole view: tilted, it sees past them)
    const W = view.world.w, Hh = view.world.h;
    map.on('move', () => {
      el.dataset.zoom = this.zoom;
      const c = toKm(map.getCenter()), x = Math.max(-150, Math.min(W + 150, c.x)), y = Math.max(-150, Math.min(Hh + 150, c.y));
      if (x !== c.x || y !== c.y) map.setCenter(toLngLat(x, y));
    });
    map.on('moveend', () => { this.declutter(); this.onMove && this.onMove(); });
    this.markers = [];
    this.pin = null;
    this.dots = [];
  }

  // ---------------------------------------------------------------- texts
  sizeTexts() {
    const c = this.map.getCanvas(), tc = this.textCanvas, dpr = Math.min(2, devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    tc.width = Math.round(w * dpr); tc.height = Math.round(h * dpr);
    tc.style.width = w + 'px'; tc.style.height = h + 'px';
    this.textCtx = tc.getContext('2d');
    this.textCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.textSize = [w, h];
  }
  // the tiles on show now, and what each handed back
  shown() {
    const tm = this.map.style?.tileManagers?.map, out = [];
    out.key = '';
    if (!tm) return out;
    for (const id of tm.getRenderableIds()) {
      const c = tm.getTileByID(id)?.tileID?.canonical, key = c && `${c.z}/${c.x}/${c.y}`;
      const d = key && this.tiles.get(key);
      if (d) { out.push(d); out.key += key + ' '; }
    }
    out.key += this.version;
    return out;
  }
  // The names of places and points stand upright over the ground and face the camera: the most
  // important first, each where it has room, none hidden behind a hill
  drawTexts() {
    const ctx = this.textCtx, [W, H] = this.textSize, map = this.map;
    ctx.clearRect(0, 0, W, H);
    this.hits = [];
    // what may be drawn, in order: made again only when other tiles are on show
    const shown = this.shown();
    if (!this.cands || this.candsKey !== shown.key) { this.cands = this.candidates(shown); this.candsKey = shown.key; }
    this.drawTextsOn(ctx, W, H, map, this.cands);
  }
  // the names of the tiles on show, once each, the most important first
  candidates(shown) {
    const cands = [], seen = new Set();
    for (const d of shown) {
      const s = 2 ** d.z;
      for (const L of d.labels) {
        const key = L.kind + L.text;
        if (seen.has(key)) continue;
        seen.add(key);
        cands.push({ pri: L.pri, x: L.X / s, y: L.Y / s, L, z: d.z, box: [L.box[0] - L.X, L.box[1] - L.Y, L.box[2] - L.X, L.box[3] - L.Y], target: L.target });
      }
      for (const [it, z] of d.pois) {
        const key = 'poi' + it.q.id;
        if (seen.has(key)) continue;
        seen.add(key);
        cands.push({ pri: 500 + (it.tw ? 0 : 40), x: it.q.x, y: it.q.y, it, z, box: [it.box[0] - it.X + 2, it.box[1] - it.Y + 2, it.box[2] - it.X - 2, it.box[3] - it.Y - 2], target: { type: 'poi', poi: it.q } });
      }
    }
    cands.sort((a, b) => a.pri - b.pri);
    for (const c of cands) c.ll = toLngLat(c.x, c.y);
    return cands;
  }
  drawTextsOn(ctx, W, H, map, cands) {
    // the camera, to hide what a hill stands in front of
    const tr = map._camera?.transform, pitch = map.getPitch();
    let cam = null;
    if (tr && pitch > 25) { const k = toKm(tr.getCameraLngLat()); cam = { x: k.x, y: k.y, a: tr.getCameraAltitude() }; }
    const hidden = (x, y) => {
      if (!cam) return false;
      const a1 = this.elev(x, y) * EXAG + 8;
      for (let i = 1; i < 16; i++) {
        const t = i / 16, px = cam.x + (x - cam.x) * t, py = cam.y + (y - cam.y) * t;
        if (this.elev(px, py) * EXAG > cam.a + (a1 - cam.a) * t) return true;
      }
      return false;
    };
    // (placed boxes in a grid of 64 px cells)
    const grid = new Map(), G = 64;
    const fits = (b) => {
      for (let gy = Math.floor(b[1] / G); gy <= Math.floor(b[3] / G); gy++) for (let gx = Math.floor(b[0] / G); gx <= Math.floor(b[2] / G); gx++) {
        const cell = grid.get(gx + ',' + gy);
        if (cell) for (const o of cell) if (!(o[2] < b[0] || o[0] > b[2] || o[3] < b[1] || o[1] > b[3])) return false;
      }
      return true;
    };
    const take = (b) => {
      for (let gy = Math.floor(b[1] / G); gy <= Math.floor(b[3] / G); gy++) for (let gx = Math.floor(b[0] / G); gx <= Math.floor(b[2] / G); gx++) {
        const k = gx + ',' + gy; let cell = grid.get(k); if (!cell) grid.set(k, (cell = [])); cell.push(b);
      }
    };
    // the angle on the screen of a direction on the ground, turned to read left to right
    const screenAngle = (c, P, a) => {
      if (!a) return 0;
      const d = 30 / 2 ** c.z, Q = map.project(toLngLat(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d));
      let ang = Math.atan2(Q.y - P.y, Q.x - P.x);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      return ang;
    };
    let n = 0;
    for (const c of cands) {
      if (n > 400) break;
      const P = map.project(c.ll);
      if (P.x < -60 || P.y < -30 || P.x > W + 60 || P.y > H + 30) continue;
      const b = [P.x + c.box[0], P.y + c.box[1], P.x + c.box[2], P.y + c.box[3]];
      if (!fits(b) || hidden(c.x, c.y)) continue;
      take(b); n++;
      if (c.L) {
        const L = c.L.angle ? { ...c.L, angle: screenAngle(c, P, c.L.angle) } : c.L;
        drawLabel(ctx, L, c.L.X - P.x, c.L.Y - P.y, c.z);
      } else drawPoi(ctx, c.it, P.x, P.y, c.z);
      if (c.target) this.hits.push([b, c.target]);
    }
  }

  // ---------------------------------------------------------------- houses
  // the buildings of the tiles on show, standing, once the map has stopped
  housesDirty() {
    clearTimeout(this.housesTimer);
    this.housesTimer = setTimeout(() => this.buildHouses(), 250);
  }
  buildHouses() {
    const map = this.map, src = map.getSource('houses');
    if (!src) return;
    if (map.getZoom() < HOUSES_Z - 0.5) { if (this.housesOn) { src.setData(NONE); this.housesOn = false; } return; }
    const shown = this.shown();
    if (this.housesOn && this.housesKey === shown.key) return;
    this.housesKey = shown.key;
    const seen = new Set(), features = [], m = KM_M / 1000;
    for (const d of shown) for (const b of d.builds) {
      const q = b.r, key = q[0][0].toFixed(4) + ',' + q[0][1].toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);
      // storeys of 3 m, a little more or less from one building to the next
      const j = Math.abs(Math.sin(q[0][0] * 12.9898 + q[0][1] * 78.233) * 43758.5453) % 1;
      const st = (STOREYS[b.kind] || 2) * (0.8 + j * 0.5);
      // On a slope: MapLibre stands a building on the ground at its middle (the mean of its corners)
      // and its walls go 10 m below that. Its roof is raised so that its walls stand at least
      // UPHILL m clear of the highest ground under it; on the low side they are that much taller
      let gx = 0, gy = 0, top = -Infinity;
      for (const p of q) { gx += p[0] / q.length; gy += p[1] / q.length; top = Math.max(top, this.elev(p[0], p[1])); }
      const mid = this.elev(gx, gy), h = Math.max(st * 3 * m, (top - mid) * EXAG + UPHILL * m);
      const ring = q.map((p) => { const ll = toLngLat(p[0], p[1]); return [ll.lng, ll.lat]; });
      ring.push(ring[0]);
      features.push({ type: 'Feature', properties: { h, c: ROOF[b.kind] || ROOF.house }, geometry: { type: 'Polygon', coordinates: [ring] } });
    }
    src.setData({ type: 'FeatureCollection', features });
    this.housesOn = true;
  }

  // where the flat map's zoom would be
  get zoom() { return Math.round(this.map.getZoom() - ZOOM); }
  center() { return toKm(this.map.getCenter()); }
  toKm(e) {
    const r = this.map.getContainer().getBoundingClientRect();
    const ll = this.map.unproject([e.clientX - r.left, e.clientY - r.top]);
    return ll ? toKm(ll) : null;
  }
  // straight to a view, keeping the turn and tilt of the camera
  jump(x, y, z, pitch) { this.map.jumpTo({ center: toLngLat(x, y), zoom: z + ZOOM, ...(pitch !== undefined ? { pitch, bearing: 0 } : {}) }); }
  setView(x, y, z, animate) {
    if (animate) this.map.flyTo({ center: toLngLat(x, y), zoom: z + ZOOM, duration: 900 });
    else this.jump(x, y, z);
  }
  tilt(pitch) { this.map.easeTo({ pitch, duration: 700 }); }
  zoomBy(d) { this.map.zoomTo(this.map.getZoom() + d, { duration: 250 }); }
  resize() { this.map.resize(); }
  // the tiles again (a layer was switched)
  refresh() { this.tiles.clear(); this.map.getSource('map').setTiles([`lodestar://{z}/{x}/{y}?v=${++this.version}`]); }

  // the flat map's markers, on the ground
  setSites(sites, html, onClick) {
    for (const m of this.markers) m.remove();
    this.markers = sites.map((s) => {
      // (a MapLibre marker is placed absolutely: the pin and its label go inside it, as in Leaflet)
      const el = document.createElement('div');
      el.style.width = el.style.height = '22px';
      el.innerHTML = `<div class="ls-list">${html(s)}</div>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(s); });
      const [px, py] = s.pin || [s.x, s.y];
      const m = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, 0] }).setLngLat(toLngLat(px, py)).addTo(this.map);
      m.site = s; m.px = px; m.py = py;
      return m;
    });
    this.declutter();
  }
  declutter() {
    const boxes = [];
    for (const m of this.markers) {
      const p = this.map.project(m.getLngLat()), box = [p.x + 11, p.y - 9, p.x + 15 + m.site.name.length * 6.2, p.y + 9];
      const hit = boxes.some((o) => !(o[2] < box[0] || o[0] > box[2] || o[3] < box[1] || o[1] > box[3]));
      m.getElement().firstChild.classList.toggle('nolabel', hit);
      if (!hit) boxes.push(box, [p.x - 11, p.y - 11, p.x + 11, p.y + 11]);
    }
  }
  setPin(p, html) {
    if (this.pin) { this.pin.remove(); this.pin = null; }
    if (!p) return;
    const el = document.createElement('div');
    el.className = 'ls-pin';
    el.innerHTML = html;
    el.style.pointerEvents = 'none';
    this.pin = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(toLngLat(p.x, p.y)).addTo(this.map);
  }
  setDots(items, onClick) {
    for (const m of this.dots) m.remove();
    this.dots = items.map((it) => {
      const el = document.createElement('div');
      el.className = 'ls-dot ls-dot-' + it.cat;
      el.title = it.name;
      el.innerHTML = '<span></span>';
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(it); });
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(toLngLat(it.x, it.y)).addTo(this.map);
    });
  }
}
