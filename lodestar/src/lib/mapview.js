// Leaflet wrapper: simple CRS in km (zoom z = 2^z px per km), canvas tile layer,
// shared list markers, selection pin, click hit-testing and URL hash sync.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { drawTile } from './render.js';
import { buildCandidates, placeLabels } from './labels.js';
import { poisNear, ensureArea, ensurePois, initPacks, CH, ensureRural, initExtras, ensureFields, initEdits, edits, checkEdits } from './packs.js';
import { applyRoadEdits } from './world.js';
import { LIST } from './sharedlist.js';

const toLL = (x, y) => L.latLng(-y, x);
const fromLL = (ll) => ({ x: ll.lng, y: -ll.lat });

const PIN = `<svg viewBox="0 0 28 38" width="28" height="38" aria-hidden="true"><path d="M14 37c-1-4.5-3.6-8-6.6-11.6C4.6 22.1 2 19 2 14a12 12 0 0 1 24 0c0 5-2.6 8.1-5.4 11.4C17.6 29 15 32.5 14 37z" fill="#ea4335" stroke="#b3261e" stroke-width="1.4"/><circle cx="14" cy="14" r="4.6" fill="#7a1712"/></svg>`;
// a shared list's marker: the list's colour with a flag, like a friend's saved place
const LISTPIN = (c) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="${c}" stroke="#fff" stroke-width="2"/><path d="M9 17.5V6.6h6.4l-.9 2.3.9 2.3H10.4v6.3z" fill="#fff"/></svg>`;

export class MapView {
  constructor(el, world, { onSelect, onMove, onMapClick }) {
    this.world = world;
    this.state = { terrain: false, borders: true, list: true, height: null };
    this.labelCache = new Map();
    this.cands = buildCandidates(world);
    this.onSelect = onSelect;
    const map = (this.map = L.map(el, {
      crs: L.CRS.Simple,
      minZoom: -1, // the country fills the screen; further out it is a patch in the middle
      maxZoom: 12,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 110,
      zoomControl: false,
      attributionControl: false,
      maxBounds: L.latLngBounds(toLL(-150, -150), toLL(world.w + 150, world.h + 150)),
      maxBoundsViscosity: 0.8,
      worldCopyJump: false,
      fadeAnimation: true,
      zoomAnimation: true,
      inertia: true,
    }));
    const self = this;
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const tile = document.createElement('canvas');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        tile.width = tile.height = 256 * dpr;
        tile.style.width = tile.style.height = '256px';
        const ctx = tile.getContext('2d');
        ctx.scale(dpr, dpr);
        const job = { tile, z: coords.z, run: () => { self.drawTileTo(ctx, coords.x, coords.y, coords.z); done(null, tile); } };
        tile._job = job;
        self.prepTile(coords.x, coords.y, coords.z).then(() => self.schedule(job));
        return tile;
      },
    });
    // tiles are drawn a few per frame (current zoom first), so a zoom or a fresh area
    // never blocks the page; a tile removed before its turn is skipped
    this.queue = [];
    this.pumping = false;
    this.pump = () => {
      const t0 = performance.now(), z = map.getZoom();
      while (this.queue.length && performance.now() - t0 < 8) {
        let i = this.queue.findIndex((j) => j.z === z);
        if (i < 0) i = 0;
        const [job] = this.queue.splice(i, 1);
        if (!job.dead) job.run();
      }
      if (this.queue.length) requestAnimationFrame(this.pump);
      else this.pumping = false;
    };
    // the packs and the editor's edits (public/data/edits.json), then the tiles again
    Promise.all([initPacks(), initEdits()]).then(() => { checkEdits(world.roads.length); applyRoadEdits(world, edits()); this.labelCache.clear(); this.ch = CH(); this.tiles.redraw(); }).catch(() => {});
    this.tiles = new Layer({ tileSize: 256, minZoom: -1, maxZoom: 12, updateWhenZooming: false, keepBuffer: 3, className: 'ls-tiles' }).addTo(map);
    this.tiles.on('tileunload', (e) => { if (e.tile._job) e.tile._job.dead = true; });
    this.markerLayer = L.layerGroup().addTo(map);
    this.extraLayer = L.layerGroup().addTo(map);
    this.addListMarkers();
    this.pin = null;

    this.editClick = null; // set by the map editor while it is open: it takes the clicks
    this.editSite = null; // (and the clicks on the TPF pins)
    this.onMapClick = onMapClick;
    map.on('click', (e) => { const p = fromLL(e.latlng); this.clickAt(p.x, p.y, map.getZoom(), e.originalEvent); });
    // also one step after the first view, when the markers are drawn
    map.on('zoomend moveend load viewreset', () => { this.declutterList(); setTimeout(() => this.declutterList(), 0); });
    map.on('moveend zoomend', () => {
      const c = fromLL(map.getCenter());
      onMove && onMove({ x: c.x, y: c.y, z: map.getZoom() });
      el.dataset.zoom = map.getZoom();
    });
    el.dataset.zoom = 0;
  }

  schedule(job) {
    this.queue.push(job);
    if (!this.pumping && !this.d3) { this.pumping = true; requestAnimationFrame(this.pump); }
  }
  // a tile's packs (fields and harbours from z4, towns from z5, compounds from z6, farms and
  // businesses from z8: style.js TZ), all pre-generated; then the tile itself
  prepTile(tx, ty, z) {
    if (z < 4) return Promise.resolve();
    const k = 256 / Math.pow(2, z), x0 = tx * k, y0 = ty * k;
    return Promise.all([ensureFields(x0, y0, x0 + k, y0 + k), z >= 5 ? ensureArea(x0 - 0.05, y0 - 0.05, x0 + k + 0.05, y0 + k + 0.05) : null, z >= 8 ? ensurePois(x0, y0, x0 + k, y0 + k) : null, z >= 8 ? ensureRural(x0, y0, x0 + k, y0 + k) : null, initExtras()])
      .catch(() => {});
  }
  // (out: the 3D map takes the tile's texts and buildings, render.js drawTile)
  drawTileTo(ctx, tx, ty, z, out) {
    drawTile(ctx, this.world, tx, ty, z, { ...this.state, ch: this.ch, labels: this.labelsAt(z, tx, ty), out });
  }
  // a click on the flat map or on the 3D one
  clickAt(x, y, z, ev) {
    if (this.editClick) { this.editClick({ x, y }, ev); return; }
    const hit = this.hitAt(x, y, z);
    if (hit) this.onSelect(hit);
    else this.onMapClick && this.onMapClick({ x, y });
  }

  // ---------------------------------------------------------------- 3D
  // the 3D map (map3d.js) over the flat one: it starts at this view, and the flat map follows
  // it (so search, the panels and links go on working) and takes over again where it ends
  async open3d(el) {
    if (this.d3) return;
    const c = this.center(), z = this.map.getZoom();
    if (!this.d3view) {
      const { Map3D } = await import('./map3d.js');
      this.d3view = new Map3D(el, this, this.state.height);
      this.d3view.onMove = () => { const c = this.d3view.center(); this.map.setView(toLL(c.x, c.y), this.d3view.zoom, { animate: false }); };
    }
    this.d3 = this.d3view;
    this.d3.resize();
    this.d3.jump(c.x, c.y, z, 0);
    this.d3.tilt(55);
    this.sync3d();
  }
  close3d() {
    if (!this.d3) return;
    const c = this.d3.center(), z = this.d3.zoom;
    this.d3 = null;
    this.map.setView(toLL(c.x, c.y), z, { animate: false });
    if (this.queue.length && !this.pumping) { this.pumping = true; requestAnimationFrame(this.pump); }
  }
  // the markers of the flat map, on the 3D one
  sync3d() {
    const d = this.d3;
    if (!d) return;
    d.setSites(this.state.list ? this.world.sites.filter((s) => s.tpf) : [], (s) => `<div class="ls-list-pin">${LISTPIN(LIST.color)}</div><div class="ls-list-label">${s.name}</div>`,
      (site) => { if (this.editSite) this.editSite(site); else this.onSelect({ type: 'site', id: 'site:' + site.id, data: site }); });
    d.setPin(this.pinAt, PIN);
    d.setDots(this.dotItems || [], (it) => this.onSelect(it));
  }

  setView(x, y, z, animate = false) {
    if (this.d3) return this.d3.setView(x, y, z, animate);
    if (animate) this.map.flyTo(toLL(x, y), z, { duration: 0.9 });
    else this.map.setView(toLL(x, y), z, { animate: false });
  }
  fitEsteloria() {
    const c = this.world.countries.find((c) => c.id === 'est');
    const size = this.map.getSize();
    const z = Math.max(-1, Math.min(2, Math.floor(Math.log2(Math.min(size.x / 875, size.y / 825)))));
    this.setView(c.x, c.y + 60, z);
  }
  get zoom() { return this.d3 ? this.d3.zoom : this.map.getZoom(); }
  center() { return this.d3 ? this.d3.center() : fromLL(this.map.getCenter()); }
  zoomBy(d) { if (this.d3) this.d3.zoomBy(d); else this.map.setZoom(this.map.getZoom() + d); }

  labels(z) {
    const key = `${z}|${this.state.list}`;
    let l = this.labelCache.get(key);
    if (!l) {
      l = placeLabels(this.world, this.cands, z, []);
      this.labelCache.set(key, l);
    }
    return l;
  }
  // close in, labels are placed per region of 8 x 8 tiles (with neighbours for overlap);
  // placing the whole world at once costs a few hundred ms from z5
  labelsAt(z, tx, ty) {
    if (z <= 4) return this.labels(z);
    const rx = Math.floor(tx / 8), ry = Math.floor(ty / 8);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(...this.regionLabels(z, rx + dx, ry + dy));
    return out;
  }
  regionLabels(z, rx, ry) {
    const key = `${z}|${rx}|${ry}|${this.state.list}`;
    let l = this.labelCache.get(key);
    if (!l) {
      const kmPer = 256 / Math.pow(2, z);
      const bbox = [rx * 8 * kmPer, ry * 8 * kmPer, (rx + 1) * 8 * kmPer, (ry + 1) * 8 * kmPer];
      l = placeLabels(this.world, this.cands, z, [], bbox);
      this.labelCache.set(key, l);
      if (this.labelCache.size > 400) this.labelCache.delete(this.labelCache.keys().next().value);
    }
    return l;
  }
  addListMarkers() {
    this.markerLayer.clearLayers();
    this.sync3d();
    if (!this.state.list) return;
    for (const site of this.world.sites) {
      if (!site.tpf) continue;
      const icon = L.divIcon({
        className: 'ls-list',
        html: `<div class="ls-list-pin">${LISTPIN(LIST.color)}</div><div class="ls-list-label">${site.name}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      // the pin sits on the site's building (set by the generator), else on the site itself
      const [px, py] = site.pin || [site.x, site.y];
      const m = L.marker(toLL(px, py), { icon, keyboard: true, title: site.name, riseOnHover: true });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); if (this.editSite) this.editSite(site); else this.onSelect({ type: 'site', id: 'site:' + site.id, data: site }); });
      m.site = site; m.px = px; m.py = py;
      m.addTo(this.markerLayer);
    }
    this.declutterList();
  }
  // the list's own labels: one wins where two would overlap (the owner's first pins first)
  declutterList() {
    const z = this.map.getZoom(), s = Math.pow(2, z), boxes = [];
    this.markerLayer.eachLayer((m) => {
      const el = m.getElement();
      if (!el || !m.site) return;
      const X = m.px * s, Y = m.py * s, box = [X + 11, Y - 9, X + 15 + m.site.name.length * 6.2, Y + 9];
      const hit = boxes.some((o) => !(o[2] < box[0] || o[0] > box[2] || o[3] < box[1] || o[1] > box[3]));
      el.classList.toggle('nolabel', hit);
      if (!hit) boxes.push(box, [X - 11, Y - 11, X + 11, Y + 11]);
    });
  }

  setLayer(name, on) {
    this.state[name] = on;
    if (name === 'list') { this.labelCache.clear(); this.addListMarkers(); }
    this.tiles.redraw();
    if (this.d3view) this.d3view.refresh();
  }
  setHeight(h) { this.state.height = h; if (this.state.terrain) this.tiles.redraw(); }

  showPin(x, y) {
    if (this.pin) this.pin.remove();
    const icon = L.divIcon({ className: 'ls-pin', html: PIN, iconSize: [28, 38], iconAnchor: [14, 37] });
    this.pin = L.marker(toLL(x, y), { icon, interactive: false, zIndexOffset: 1000 }).addTo(this.map);
    this.pinAt = { x, y };
    this.sync3d();
  }
  clearPin() { if (this.pin) { this.pin.remove(); this.pin = null; } this.pinAt = null; this.sync3d(); }

  // small dots for a category list
  showDots(items) {
    this.extraLayer.clearLayers();
    this.dotItems = items;
    this.sync3d();
    for (const it of items) {
      const icon = L.divIcon({ className: 'ls-dot ls-dot-' + it.cat, html: '<span></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
      const m = L.marker(toLL(it.x, it.y), { icon, title: it.name });
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.onSelect(it); });
      m.addTo(this.extraLayer);
    }
  }
  clearDots() { this.extraLayer.clearLayers(); this.dotItems = null; this.sync3d(); }

  // static render around a point, for the place panel and layer thumbnails
  async renderPreview(canvas, x, y, z, override = {}) {
    if (z >= 4) { const r = 0.6 * 256 / Math.pow(2, z); await Promise.all([ensureFields(x - r, y - r, x + r, y + r), ensureArea(x - r, y - r, x + r, y + r), ensurePois(x - r, y - r, x + r, y + r), ensureRural(x - r, y - r, x + r, y + r), initExtras()]).catch(() => {}); }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 400, h = canvas.clientHeight || 180;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.pow(2, z);
    const ox = x * s - w / 2, oy = y * s - h / 2;
    const state = { ...this.state, ...override, ch: this.ch, labels: this.labelsAt(z, Math.floor(x * s / 256), Math.floor(y * s / 256)) };
    const tile = document.createElement('canvas');
    tile.width = tile.height = 256 * dpr;
    const tctx = tile.getContext('2d');
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + h) / 256); ty++) {
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + w) / 256); tx++) {
        tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        tctx.clearRect(0, 0, 256, 256);
        drawTile(tctx, this.world, tx, ty, z, state);
        ctx.drawImage(tile, tx * 256 - ox, ty * 256 - oy, 256, 256);
      }
    }
    if (!override.noPin) {
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ea4335'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  }

  hitAt(x, y, z) {
    const s = Math.pow(2, z);
    const X = x * s, Y = y * s;
    let best = null, bd = 14;
    const tx = Math.floor(X / 256), ty = Math.floor(Y / 256);
    for (const lab of this.labelsAt(z, tx, ty)) {
      if (!lab.target) continue;
      const b = lab.box;
      const inside = X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3];
      const d = inside ? 0 : Math.hypot(lab.X - X, lab.Y - Y);
      if (d < bd) { bd = d; best = lab; }
    }
    if (z >= 8) {
      // business icons are drawn in the tiles; find the nearest one under the pointer
      const r = (z >= 10 ? 12 : 10) / s;
      let bq = null, bqd = r;
      for (const q of poisNear(x, y, r * 2)) { const d = Math.hypot(q.x - x, q.y - y); if (d < bqd) { bqd = d; bq = q; } }
      if (bq) return { type: 'poi', poi: bq };
    }
    return best ? best.target : null;
  }
}

export { toLL, fromLL };
