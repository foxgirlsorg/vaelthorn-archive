// The map editor: npm run dev only (App.svelte loads it only there, and it saves through the dev
// server). Its edits go into public/data/edits.json, which is part of the map for every build.
//
// Select (click a building, a town street or a country road):
//   building: drag the middle to move it, the round handle to turn it, the corner to resize it
//   street or road: drag a point (a road's junction points move with it), drag a midpoint to add
//   one, right-click a point to drop it
// Re-route (a street or road selected): click where the new way leaves it, then the way, then where
//   it joins it again; that stretch is replaced.
// New road: click its points (its ends join the roads they are dropped on); Enter or a double
//   click ends it.
// Business or TPF site (click its pin): drag it (dropped on a building, it goes in the middle),
//   rename it, remove it. Add business / Add TPF site: pick what it is, then click where.
// Delete removes the selection, Ctrl+Z undoes, Esc stops or lets go.
import L from 'leaflet';
import { edits, autoEdits, forgetChunk, chunkRecord, CH, poisNear, refreshPois } from './packs.js';
import { CHAINS, TYPES } from './chains.js';
import { applyRoadEdits } from './world.js';
import { smooth } from './render.js';

const toLL = (x, y) => L.latLng(-y, x);
const fromLL = (ll) => ({ x: ll.lng, y: -ll.lat });
const r5 = (v) => Math.round(v * 1e5) / 1e5; // 1 cm
const icon = (cls) => L.divIcon({ className: 'ed-h ' + cls, iconSize: [12, 12], iconAnchor: [6, 6] });
export const ROAD_CLASSES = [[4, 'Motorway'], [3, 'Main road'], [2, 'Secondary road'], [1, 'Minor road'], [0.5, 'Lane']];
const CLASS_NAME = Object.fromEntries(ROAD_CLASSES);

// the nearest point of a line [x0, y0, x1, y1, ...]: distance, segment and where along it
function nearestOn(p, x, y) {
  let best = { d: Infinity, seg: 0, t: 0, x, y };
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], dx = p[i] - ax, dy = p[i + 1] - ay, l = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)), qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(qx - x, qy - y);
    if (d < best.d) best = { d, seg: i / 2 - 1, t, x: qx, y: qy };
  }
  return best;
}
const lineDist = (x, y, p) => nearestOn(p, x, y).d;
function inPoly(q, x, y) { let n = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < ((q[j][0] - q[i][0]) * (y - q[i][1])) / (q[j][1] - q[i][1]) + q[i][0]) n = !n; return n; }
function inQuad(q, x, y) { let n = 0; for (let i = 0; i < 4; i++) { const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4]; n += Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); } return Math.abs(n) === 4; }
// a building as centre, axes, width and depth, and back
function frame(r) {
  const cx = (r[0][0] + r[2][0]) / 2, cy = (r[0][1] + r[2][1]) / 2;
  const w = Math.hypot(r[1][0] - r[0][0], r[1][1] - r[0][1]), d = Math.hypot(r[3][0] - r[0][0], r[3][1] - r[0][1]);
  return { cx, cy, w, d, u: [(r[1][0] - r[0][0]) / w, (r[1][1] - r[0][1]) / w], v: [(r[3][0] - r[0][0]) / d, (r[3][1] - r[0][1]) / d] };
}
function rect({ cx, cy, w, d, u, v }) {
  const c = (a, b) => [r5(cx + u[0] * a + v[0] * b), r5(cy + u[1] * a + v[1] * b)];
  return [c(-w / 2, -d / 2), c(w / 2, -d / 2), c(w / 2, d / 2), c(-w / 2, d / 2)];
}

export class Editor {
  constructor(view, onChange) {
    this.view = view; this.world = view.world; this.map = view.map; this.onChange = onChange;
    this.layer = L.layerGroup(); this.draft = L.layerGroup();
    this.newPoi = { chain: '', type: 'shop', name: '' };
    this.newSite = { name: '', type: 'Detention', desc: '', years: '', status: '' };
    this.sel = null; this.mode = 'select'; this.newClass = 1; this.pts = []; this.undo = []; this.status = 'saved'; this.timer = 0;
    this.onKey = (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') { if (this.mode !== 'select') this.setMode('select'); else this.select(null); }
      else if (e.key === 'Enter' && this.mode === 'draw') this.finishDraw();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel && this.mode === 'select') { e.preventDefault(); this.remove(); }
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.undoLast(); }
    };
    this.onMove = (e) => this.drawDraft(fromLL(e.latlng));
    this.onDbl = () => { if (this.mode === 'draw') this.finishDraw(); };
  }
  open() {
    this.layer.addTo(this.map); this.draft.addTo(this.map);
    this.view.editClick = (p) => this.click(p);
    this.view.editSite = (site) => { if (this.mode === 'select') this.select({ type: 'site', id: site.id, added: !!site.added, site: { ...site } }); };
    addEventListener('keydown', this.onKey); this.map.on('mousemove', this.onMove); this.map.on('dblclick', this.onDbl);
    this.emit();
  }
  close() {
    this.setMode('select'); this.select(null); this.layer.remove(); this.draft.remove(); this.view.editClick = null; this.view.editSite = null;
    removeEventListener('keydown', this.onKey); this.map.off('mousemove', this.onMove); this.map.off('dblclick', this.onDbl);
  }
  get tol() { return 10 / Math.pow(2, this.map.getZoom()); }

  // ---------------------------------------------------------------- what is under a point
  find({ x, y }) {
    const z = this.map.getZoom(), tol = this.tol;
    // a business's icon (drawn from z8 on)
    if (z >= 8) {
      let bq = null, bqd = 12 / Math.pow(2, z);
      for (const q of poisNear(x, y, bqd * 2)) { const d = Math.hypot(q.x - x, q.y - y); if (d < bqd) { bqd = d; bq = q; } }
      if (bq) return { type: 'poi', id: bq.id, added: String(bq.id).startsWith('ed-'), poi: { ...bq } };
    }
    const owners = new Set(this.world.urbanIndex.query(x - 0.2, y - 0.2, x + 0.2, y + 0.2).map((r) => r.owner).filter((u) => u.place));
    let best = null, bd = Infinity, area = null;
    for (const u of owners) for (let cy = Math.floor((y - 0.1) / CH()); cy <= Math.floor((y + 0.1) / CH()); cy++) for (let cx = Math.floor((x - 0.1) / CH()); cx <= Math.floor((x + 0.1) / CH()); cx++) {
      const R = chunkRecord(u.id, cx, cy);
      if (!R) continue;
      const key = `${u.id}|${cx}|${cy}`;
      for (const b of R.buildings) if (inQuad(b.r, x, y)) return { type: 'building', key, i: b.i, r: b.r.map((p) => [...p]), kind: b.kind, town: u.place.n };
      for (const a of R.areas) if (inPoly(a.poly, x, y)) area = { type: 'area', key, i: a.i, poly: a.poly.map((p) => [...p]), kind: a.kind, town: u.place.n };
      for (const s of R.streets) {
        if (s.regional) continue;
        const d = lineDist(x, y, s.pts) - Math.min(0.009, s.w / 3.75) / 2; // (drawn at about 0.8 of real width, render.js)
        if (d < tol && d < bd) { bd = d; best = { type: 'street', key, i: s.i, pts: Array.from(s.pts), name: s.name, main: s.main, town: u.place.n }; }
      }
    }
    const r = this.roadAt(x, y, z);
    if (r && r.d < bd) best = { type: 'road', i: r.road.i, pts: Array.from(r.road.p), c: r.road.c, ref: r.road.ref, added: r.road.added };
    return best || area; // (a car park, park, pitch or square: what is left under the click)
  }
  // the town building under a point, if any
  buildingAt(x, y) {
    for (const r of this.world.urbanIndex.query(x - 0.01, y - 0.01, x + 0.01, y + 0.01)) {
      const u = r.owner;
      if (!u.place) continue;
      // (a building can lean into the next chunk)
      for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        const R = chunkRecord(u.id, Math.floor(x / CH()) + dx, Math.floor(y / CH()) + dy);
        for (const b of R ? R.buildings : []) if (inQuad(b.r, x, y)) return b;
      }
    }
    return null;
  }
  // a point dropped on a building goes to its middle
  snap(p) {
    const b = this.buildingAt(p.x, p.y);
    return b ? { x: r5((b.r[0][0] + b.r[2][0]) / 2), y: r5((b.r[0][1] + b.r[2][1]) / 2) } : { x: r5(p.x), y: r5(p.y) };
  }
  placeNear(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.world.places) { if (p.k === 'hamlet') continue; const d = Math.hypot(p.x - x, p.y - y) / Math.sqrt(Math.max(p.pop, 100)); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  streetNear(x, y) {
    let best = '', bd = 0.15;
    for (const r of this.world.urbanIndex.query(x - 0.1, y - 0.1, x + 0.1, y + 0.1)) {
      if (!r.owner.place) continue;
      for (let cy = Math.floor((y - 0.1) / CH()); cy <= Math.floor((y + 0.1) / CH()); cy++) for (let cx = Math.floor((x - 0.1) / CH()); cx <= Math.floor((x + 0.1) / CH()); cx++) {
        const R = chunkRecord(r.owner.id, cx, cy);
        for (const st of R ? R.streets : []) if (st.name) { const d = lineDist(x, y, st.pts); if (d < bd) { bd = d; best = st.name; } }
      }
    }
    return best;
  }

  // the country road drawn under a point (close in, roads are drawn smoothed: measured to that)
  roadAt(x, y, z = this.map.getZoom()) {
    const half = { 4: 0.0075, 3: 0.006, 2: 0.005, 1: 0.004, 0.5: 0.003 };
    let best = null;
    for (const road of this.world.roadsIndex.query(x - 0.05, y - 0.05, x + 0.05, y + 0.05)) {
      const d = lineDist(x, y, z >= 6 ? smooth(road) : road.p) - Math.max(half[road.c] || 0.003, 3 / Math.pow(2, z));
      if (d < this.tol && (!best || d < best.d)) best = { d, road };
    }
    return best;
  }

  // ---------------------------------------------------------------- edits.json entries
  ref(sel) {
    const E = edits();
    if (sel.type === 'road') {
      if (String(sel.i)[0] === 'a') { const k = +String(sel.i).slice(1); return { get: () => E.added[k], set: (v) => { E.added[k] = v ? (v.del ? null : { ...E.added[k], ...v }) : E.added[k]; } }; }
      return { get: () => E.roads[sel.i], set: (v) => { if (v) E.roads[sel.i] = v; else delete E.roads[sel.i]; } };
    }
    if (sel.type === 'poi' || sel.type === 'site') {
      const [map, list] = sel.type === 'poi' ? [E.pois, E.poisAdded] : [E.sites, E.sitesAdded];
      if (sel.added) {
        const k = () => list.findIndex((a) => a && a.id === sel.id);
        return { get: () => list[k()], set: (v) => { const i = k(); if (i >= 0) list[i] = v ? (v.del ? null : { ...list[i], ...v }) : list[i]; } };
      }
      return { get: () => map[sel.id], set: (v) => { if (v) map[sel.id] = v; else delete map[sel.id]; } };
    }
    const part = sel.type === 'building' ? 'b' : sel.type === 'area' ? 'a' : 's';
    return { get: () => E.chunks[sel.key]?.[part]?.[sel.i], set: (v) => { const m = ((E.chunks[sel.key] ||= {})[part] ||= {}); if (v) m[sel.i] = v; else delete m[sel.i]; } };
  }
  // one undoable change of one or more things: [[sel, value], ...]
  change(items) {
    const step = items.map(([sel, value]) => {
      const ref = this.ref(sel), before = ref.get();
      // a road keeps what else was changed on it (its course and its class are changed apart)
      if (value && !value.del && sel.type !== 'building' && sel.type !== 'street' && sel.type !== 'area' && before && !before.del) value = { ...before, ...value };
      ref.set(value);
      return { sel, before: before && JSON.parse(JSON.stringify(before)) };
    });
    this.undo.push(step);
    this.redraw(items.map(([sel]) => sel));
    this.save();
  }
  undoLast() {
    const step = this.undo.pop();
    if (!step) return;
    const E = edits();
    for (const { sel, before } of step.reverse()) {
      if (sel.type === 'road' && String(sel.i)[0] === 'a') E.added[+String(sel.i).slice(1)] = before || null;
      else if (sel.added) {
        // an added business or site: back as it was, or gone if it was just added
        const list = sel.type === 'poi' ? E.poisAdded : E.sitesAdded, k = list.findIndex((a) => a && a.id === sel.id);
        if (k >= 0) list[k] = before || null;
        else if (before) list.push(before);
      } else this.ref(sel).set(before);
    }
    this.redraw(step.map((s) => s.sel));
    this.select(null);
    this.save();
  }
  redraw(sels) {
    if (sels.some((s) => s.type === 'road')) { applyRoadEdits(this.world, edits()); this.view.labelCache.clear(); }
    for (const s of sels) if (s.key) forgetChunk(s.key);
    if (sels.some((s) => s.type === 'poi')) refreshPois();
    if (sels.some((s) => s.type === 'site')) this.onSites && this.onSites();
    this.view.tiles.redraw();
    this.emit();
  }
  save() {
    if (edits().stale) { this.status = 'not saved: edits.json belongs to other map data'; this.emit(); return; }
    this.status = 'saving'; this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try {
        const r = await fetch('/__lodestar/edits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(edits()) });
        this.status = r.ok ? 'saved' : 'not saved: ' + (await r.json().catch(() => ({}))).error;
      } catch (e) { this.status = 'not saved: the dev server is not running'; }
      this.emit();
    }, 400);
  }

  // ---------------------------------------------------------------- modes and clicks
  setMode(mode) {
    this.mode = mode; this.pts = []; this.draft.clearLayers();
    if (mode === 'select') this.map.doubleClickZoom.enable(); else this.map.doubleClickZoom.disable();
    this.map.getContainer().style.cursor = mode === 'select' ? '' : 'crosshair';
    this.emit();
  }
  click(p) {
    if (this.mode === 'select') return this.select(this.find(p));
    if (this.mode === 'reroute') return this.rerouteClick(p);
    if (this.mode === 'poi') return this.addPoi(p);
    if (this.mode === 'site') return this.addSite(p);
    if (this.mode === 'draw') {
      // a point dropped on a road joins it there (snapped onto the road's own line)
      const r = this.roadAt(p.x, p.y);
      const q = r ? nearestOn(r.road.p, p.x, p.y) : p;
      this.pts.push([q.x, q.y]); this.drawDraft(p);
    }
  }
  drawDraft(mouse) {
    this.draft.clearLayers();
    if (!this.pts.length) return;
    const line = [...this.pts, [mouse.x, mouse.y]].map(([x, y]) => toLL(x, y));
    L.polyline(line, { color: '#e8710a', weight: 3, dashArray: '6 5', interactive: false }).addTo(this.draft);
    for (const [x, y] of this.pts) L.circleMarker(toLL(x, y), { radius: 4, color: '#e8710a', fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: false }).addTo(this.draft);
  }
  // re-route: the first click on the selected line, then the way, then a click on the line again
  rerouteClick(p) {
    const sel = this.sel, on = nearestOn(sel.pts, p.x, p.y);
    const onLine = on.d < this.tol * 1.5;
    if (!this.pts.length) { if (onLine) { this.from = on; this.pts.push([on.x, on.y]); this.drawDraft(p); } return; }
    if (!onLine) { this.pts.push([p.x, p.y]); this.drawDraft(p); return; }
    // back on the line: the stretch between the two points is replaced by the new way
    let a = this.from, b = on, way = this.pts.slice(1);
    const pos = (q) => q.seg + q.t;
    if (pos(b) < pos(a)) { [a, b] = [b, a]; way = way.reverse(); }
    const P = sel.pts, out = [];
    for (let i = 0; i <= a.seg; i++) out.push(P[2 * i], P[2 * i + 1]);
    out.push(a.x, a.y);
    for (const [x, y] of way) out.push(x, y);
    out.push(b.x, b.y);
    for (let i = b.seg + 1; i < P.length / 2; i++) out.push(P[2 * i], P[2 * i + 1]);
    sel.pts = out.map(r5);
    this.change([[sel, sel.type === 'road' ? { p: sel.pts } : { pts: sel.pts }]]);
    this.setMode('select'); this.select(sel);
  }
  finishDraw() {
    if (this.pts.length < 2) return;
    const E = edits(), k = E.added.length, p = this.pts.flat().map(r5);
    E.added.push(null); // (its slot; the change below fills it, so undo empties it again)
    const sel = { type: 'road', i: 'a' + k, c: this.newClass, pts: p, added: true };
    this.change([[sel, { c: this.newClass, p }]]);
    this.setMode('select'); this.select(sel);
  }

  // a business: a chain's, or one named here; in the building clicked
  addPoi(p) {
    const q = this.snap(p), place = this.placeNear(q.x, q.y), n = this.newPoi, chain = CHAINS.find((c) => c.id === n.chain);
    const name = chain ? chain.name : n.name.trim();
    if (!name) return;
    const poi = {
      id: 'ed-' + Date.now().toString(36), type: chain ? chain.type : n.type, name, x: q.x, y: q.y, chain: chain ? chain.id : null,
      town: place?.n || '', province: place?.pr || null, country: place?.c || 'est', street: this.streetNear(q.x, q.y), num: 1 + Math.floor(Math.random() * 120),
      rating: null, reviews: 0, phone: '',
    };
    edits().poisAdded.push(poi);
    const sel = { type: 'poi', id: poi.id, added: true, poi };
    this.change([[sel, poi]]);
    this.setMode('select'); this.select(sel);
  }
  addSite(p) {
    const q = this.snap(p), place = this.placeNear(q.x, q.y), n = this.newSite;
    if (!n.name.trim()) return;
    const site = { id: 'ed-' + Date.now().toString(36), name: n.name.trim(), type: n.type, desc: n.desc, years: n.years, status: n.status, x: q.x, y: q.y, pin: [q.x, q.y], town: place?.n, province: place?.pr, tpf: true, added: true };
    edits().sitesAdded.push(site);
    const sel = { type: 'site', id: site.id, added: true, site };
    this.change([[sel, site]]);
    this.setMode('select'); this.select(sel);
  }
  // rename a business, or change what is said of a TPF site
  setFields(fields) {
    const sel = this.sel;
    if (!sel || (sel.type !== 'poi' && sel.type !== 'site')) return;
    Object.assign(sel.type === 'poi' ? sel.poi : sel.site, fields);
    this.change([[sel, fields]]);
    this.select(sel);
  }

  // ---------------------------------------------------------------- actions
  setClass(c) {
    const sel = this.sel;
    if (!sel || sel.type !== 'road' || sel.c === c) return;
    sel.c = c;
    this.change([[sel, { c }]]);
    this.select(sel);
  }
  remove() { if (this.sel) { this.change([[this.sel, { del: true }]]); this.select(null); } }
  reset() { if (this.sel && !this.sel.added) { this.change([[this.sel, null]]); this.select(null); } }
  select(sel) {
    this.sel = sel;
    this.layer.clearLayers();
    if (sel && sel.type === 'building') this.drawBuilding(sel);
    else if (sel && (sel.type === 'poi' || sel.type === 'site')) this.drawPin(sel);
    else if (sel && sel.type === 'area') L.polygon(sel.poly.map(([x, y]) => toLL(x, y)), { color: '#1f4fd1', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(this.layer);
    else if (sel) this.drawLine(sel);
    this.emit();
  }
  drawBuilding(sel) {
    const shape = L.polygon(sel.r.map(([x, y]) => toLL(x, y)), { color: '#1f4fd1', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(this.layer);
    const handles = () => {
      const f = frame(sel.r), off = 14 / Math.pow(2, this.map.getZoom());
      return { mid: [f.cx, f.cy], rot: [f.cx + f.u[0] * (f.w / 2 + off), f.cy + f.u[1] * (f.w / 2 + off)], corner: sel.r[2] };
    };
    const h = handles();
    const mk = (pos, cls) => L.marker(toLL(...pos), { draggable: true, icon: icon(cls), zIndexOffset: 1000 }).addTo(this.layer);
    const mid = mk(h.mid, 'ed-move'), rot = mk(h.rot, 'ed-rot'), corner = mk(h.corner, 'ed-corner');
    const start = { r: sel.r };
    const live = (r) => {
      sel.r = r; shape.setLatLngs(r.map(([x, y]) => toLL(x, y)));
      const k = handles(); mid.setLatLng(toLL(...k.mid)); rot.setLatLng(toLL(...k.rot)); corner.setLatLng(toLL(...k.corner));
    };
    mid.on('drag', (e) => { const p = fromLL(e.latlng), f = frame(start.r); live(rect({ ...f, cx: p.x, cy: p.y })); });
    rot.on('drag', (e) => {
      const p = fromLL(e.latlng), f = frame(start.r), a = Math.atan2(p.y - f.cy, p.x - f.cx);
      const s = Math.sign(f.u[0] * f.v[1] - f.u[1] * f.v[0]) || 1, u = [Math.cos(a), Math.sin(a)];
      live(rect({ ...f, u, v: [-u[1] * s, u[0] * s] }));
    });
    corner.on('drag', (e) => {
      const p = fromLL(e.latlng), f = frame(start.r), dx = p.x - f.cx, dy = p.y - f.cy;
      live(rect({ ...f, w: Math.max(0.002, 2 * Math.abs(dx * f.u[0] + dy * f.u[1])), d: Math.max(0.002, 2 * Math.abs(dx * f.v[0] + dy * f.v[1])) }));
    });
    for (const m of [mid, rot, corner]) { m.on('dragstart', () => { start.r = sel.r.map((p) => [...p]); }); m.on('dragend', () => this.change([[sel, { r: sel.r }]])); }
  }
  // a business or a TPF site: one handle; dropped on a building, it goes in the middle
  drawPin(sel) {
    const o = sel.type === 'poi' ? sel.poi : sel.site;
    const [x, y] = sel.type === 'site' && o.pin ? o.pin : [o.x, o.y];
    const m = L.marker(toLL(x, y), { draggable: true, icon: L.divIcon({ className: 'ed-h ed-pin', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1100 }).addTo(this.layer);
    m.on('dragend', () => {
      const q = this.snap(fromLL(m.getLatLng()));
      m.setLatLng(toLL(q.x, q.y));
      if (sel.type === 'poi') { o.x = q.x; o.y = q.y; this.change([[sel, { x: q.x, y: q.y }]]); }
      else { o.pin = [q.x, q.y]; this.change([[sel, sel.added ? { pin: o.pin, x: q.x, y: q.y } : { pin: o.pin }]]); }
    });
  }
  drawLine(sel) {
    const toLLs = (p) => { const out = []; for (let i = 0; i < p.length; i += 2) out.push(toLL(p[i], p[i + 1])); return out; };
    // a country road is drawn smoothed close in (render.js): that line is highlighted, and the
    // points it is smoothed from are shown as a dashed guide, with the handles on them
    const drawn = () => (sel.type === 'road' && this.map.getZoom() >= 6 ? smooth({ p: Float32Array.from(sel.pts) }) : sel.pts);
    const guide = sel.type === 'road' ? L.polyline(toLLs(sel.pts), { color: '#1f4fd1', weight: 1.5, opacity: 0.7, dashArray: '4 4', interactive: false }).addTo(this.layer) : null;
    const shape = L.polyline(toLLs(drawn()), { color: '#1f4fd1', weight: 4, opacity: 0.8, interactive: false }).addTo(this.layer);
    const live = () => { shape.setLatLngs(toLLs(drawn())); if (guide) guide.setLatLngs(toLLs(sel.pts)); };
    const value = () => (sel.type === 'road' ? { p: sel.pts.map(r5) } : { pts: sel.pts.map(r5) });
    const n = sel.pts.length / 2;
    for (let k = 0; k < n; k++) {
      const m = L.marker(toLL(sel.pts[2 * k], sel.pts[2 * k + 1]), { draggable: true, icon: icon('ed-v'), zIndexOffset: 1000 }).addTo(this.layer);
      let from = null;
      m.on('dragstart', () => { from = [sel.pts[2 * k], sel.pts[2 * k + 1]]; });
      m.on('drag', (e) => { const p = fromLL(e.latlng); sel.pts[2 * k] = p.x; sel.pts[2 * k + 1] = p.y; live(); });
      m.on('dragend', () => {
        // a road's point where other roads meet it (a junction): they move with it
        const items = [[sel, value()]];
        if (sel.type === 'road') for (const o of this.world.roadsIndex.query(from[0] - 0.001, from[1] - 0.001, from[0] + 0.001, from[1] + 0.001)) {
          if (o.i === sel.i) continue;
          const q = Array.from(o.p);
          let moved = false;
          for (let j = 0; j < q.length; j += 2) if (Math.hypot(q[j] - from[0], q[j + 1] - from[1]) < 0.0005) { q[j] = sel.pts[2 * k]; q[j + 1] = sel.pts[2 * k + 1]; moved = true; }
          if (moved) items.push([{ type: 'road', i: o.i, added: o.added }, { p: q.map(r5) }]);
        }
        this.change(items); this.select(sel);
      });
      m.on('contextmenu', (e) => { L.DomEvent.preventDefault(e.originalEvent); if (n <= 2) return; sel.pts.splice(2 * k, 2); this.change([[sel, value()]]); this.select(sel); });
    }
    for (let k = 0; k + 1 < n; k++) {
      const m = L.marker(toLL((sel.pts[2 * k] + sel.pts[2 * k + 2]) / 2, (sel.pts[2 * k + 1] + sel.pts[2 * k + 3]) / 2), { draggable: true, icon: icon('ed-mid'), zIndexOffset: 900 }).addTo(this.layer);
      let added = false;
      m.on('drag', (e) => { const p = fromLL(e.latlng); if (!added) { sel.pts.splice(2 * k + 2, 0, p.x, p.y); added = true; } sel.pts[2 * k + 2] = p.x; sel.pts[2 * k + 3] = p.y; live(); });
      m.on('dragend', () => { this.change([[sel, value()]]); this.select(sel); });
    }
  }

  // ---------------------------------------------------------------- for the panel
  info() {
    const s = this.sel;
    if (!s) return null;
    const edited = !!this.ref(s).get() && !s.added;
    if (s.type === 'building') { const f = frame(s.r); return { type: s.type, kind: 'Building', name: `${s.kind || 'building'} · ${s.town}`, detail: `${Math.round(f.w * 1000)} × ${Math.round(f.d * 1000)} m`, edited }; }
    if (s.type === 'area') return { type: s.type, kind: { parking: 'Car park', park: 'Park', pitch: 'Sports pitch', plaza: 'Square' }[s.kind] || 'Area', name: s.town, detail: 'remove it, or put it back', edited: !!this.ref(s).get() };
    if (s.type === 'poi') {
      const q = s.poi, chain = CHAINS.find((c) => c.id === q.chain);
      const detail = [TYPES[q.type]?.label || q.type, chain && chain.name !== q.name ? chain.name : '', q.street ? `${q.num} ${q.street}` : '', q.town].filter(Boolean).join(' · ');
      return { type: s.type, kind: 'Business' + (s.added ? ' · added' : ''), name: q.name, detail, edited: !!this.ref(s).get() && !s.added, added: s.added, fields: { name: q.name } };
    }
    if (s.type === 'site') {
      const t = s.site;
      return { type: s.type, kind: 'TPF site' + (s.added ? ' · added' : ''), name: t.name, detail: [t.type, t.town].filter(Boolean).join(' · '), edited: !!this.ref(s).get() && !s.added, added: s.added, fields: { name: t.name, type: t.type || '', desc: t.desc || '', years: t.years || '', status: t.status || '' } };
    }
    if (s.type === 'street') return { type: s.type, kind: s.main ? 'Main street' : 'Street', name: `${s.name || 'unnamed'} · ${s.town}`, detail: `${s.pts.length / 2} points`, edited };
    return { type: s.type, kind: (CLASS_NAME[s.c] || 'Road') + (s.added ? ' · added' : ''), name: s.ref ? (s.c === 4 ? 'X' : '') + s.ref : 'no number', detail: `${s.pts.length / 2} points`, edited, added: s.added, c: s.c };
  }
  counts() {
    const E = edits();
    let auto = 0, removed = 0, changed = 0;
    for (const ch of Object.values(E.chunks)) for (const part of ['b', 's', 'a']) for (const e of Object.values(ch[part] || {})) { if (e.auto) auto++; else if (e.del) removed++; else changed++; }
    for (const e of Object.values(E.roads)) { if (e.del) removed++; else changed++; }
    for (const e of [...Object.values(E.pois), ...Object.values(E.sites)]) { if (e.del) removed++; else changed++; }
    const added = E.added.filter(Boolean).length + E.poisAdded.filter(Boolean).length + E.sitesAdded.filter(Boolean).length;
    const A = autoEdits();
    for (const ch of Object.values(A.chunks)) auto += Object.keys(ch.b || {}).length + Object.keys(ch.a || {}).length;
    return { auto, removed, changed, added, autoPins: Object.keys(A.pois).length + Object.keys(A.sites).length };
  }
  emit() {
    const hint = this.mode === 'reroute' ? (this.pts.length ? 'Click the new way, then a point on the road where it joins it again.' : 'Click the road where the new way leaves it.')
      : this.mode === 'poi' ? 'Click a building to put the business in it.'
      : this.mode === 'site' ? 'Click where the TPF site is (on a building to put it in that building).'
      : this.mode === 'draw' ? (this.pts.length ? 'Click the next point; Enter or a double click ends the road.' : 'Click where the road starts (on a road to join it).') : '';
    this.onChange && this.onChange({ sel: this.info(), mode: this.mode, hint, newClass: this.newClass, newPoi: { ...this.newPoi }, newSite: { ...this.newSite }, status: this.status, counts: this.counts(), canUndo: this.undo.length > 0, stale: !!edits().stale });
  }
}
