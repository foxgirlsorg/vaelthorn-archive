// Loads public/data/world.json, decodes the delta-encoded geometry into flat
// Float32Arrays (x0,y0,x1,y1,...) in km, and builds a coarse spatial index per layer.

const CELL = 64; // km per index cell

function decode(arr, q) {
  const out = new Float32Array(arr.length);
  let x = 0, y = 0;
  for (let i = 0; i < arr.length; i += 2) {
    x += arr[i]; y += arr[i + 1];
    out[i] = x / q; out[i + 1] = y / q;
  }
  return out;
}

class Index {
  constructor(items) {
    this.items = items;
    this.cells = new Map();
    items.forEach((it, i) => {
      const [a, b, c, d] = it.b;
      for (let y = Math.floor(b / CELL); y <= Math.floor(d / CELL); y++)
        for (let x = Math.floor(a / CELL); x <= Math.floor(c / CELL); x++) {
          const k = x + y * 1000;
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(i);
        }
    });
  }
  query(x0, y0, x1, y1) {
    const seen = new Set(), out = [];
    for (let y = Math.floor(y0 / CELL); y <= Math.floor(y1 / CELL); y++)
      for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) {
        const l = this.cells.get(x + y * 1000);
        if (!l) continue;
        for (const i of l) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = this.items[i].b;
          if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) continue;
          out.push(this.items[i]);
        }
      }
    return out;
  }
}

function geom(list, q) {
  return list.map((f) => ({ ...f, p: decode(f.p, q), lo: f.lo ? decode(f.lo, q) : null }));
}

export async function loadWorld(url = './data/world.json') {
  const res = await fetch(url);
  const w = await res.json();
  const q = w.q;
  const loadedBytes = Uint8Array.from(atob(w.loaded), (c) => c.charCodeAt(0));
  const world = {
    w: w.w, h: w.h, block: w.block, bw: w.bw, bh: w.bh, loaded: loadedBytes,
    countries: w.countries, seas: w.seas, ranges: w.ranges, peaks: w.peaks,
    places: w.places, sites: w.sites, districts: w.districts,
  };
  world.isLoaded = (x, y) => {
    const bx = Math.floor(x / w.block), by = Math.floor(y / w.block);
    return bx >= 0 && by >= 0 && bx < w.bw && by < w.bh && loadedBytes[by * w.bw + bx] === 1;
  };
  for (const k of ['land', 'lakes', 'rivers', 'forests', 'glaciers', 'roads', 'rails', 'borders', 'provBorders']) {
    world[k] = geom(w[k] || [], q);
    world[k].forEach((f, i) => { f.i = i; });
    world[k + 'Index'] = new Index(world[k]);
  }
  // multi-ring features: flatten rings, keep a back-reference to the owner
  for (const k of ['parks', 'urban', 'provinces']) {
    const rings = [];
    world[k] = w[k].map((f) => {
      const o = { ...f, rings: f.rings.map((r) => ({ b: r.b, p: decode(r.p, q) })) };
      for (const r of o.rings) rings.push({ ...r, owner: o });
      return o;
    });
    world[k + 'Rings'] = rings;
    world[k + 'Index'] = new Index(rings);
  }
  const byId = new Map(world.places.map((p) => [p.id, p]));
  world.placeById = byId;
  world.countryName = Object.fromEntries(world.countries.map((c) => [c.id, c.name]));
  for (const u of world.urban) u.place = byId.get(u.id);
  return world;
}

// the country's roads as the map editor left them (packs.js edits()): removed, re-routed, or added;
// the road lookup is built again over what is left
export function applyRoadEdits(world, E) {
  const roads = E.roads || {};
  world.roads = world.roads.filter((r) => !r.added);
  for (const r of world.roads) {
    const e = roads[r.i];
    if (!r.p0) { r.p0 = r.p; r.c0 = r.c; } // the road as generated, for undoing an edit
    r.c = e && e.c !== undefined ? e.c : r.c0;
    r.deleted = !!(e && e.del);
    r.p = e && e.p ? Float32Array.from(e.p) : r.p0;
    r.sm = null; // (render.js smooths the line again)
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < r.p.length; i += 2) { a = Math.min(a, r.p[i]); b = Math.min(b, r.p[i + 1]); c = Math.max(c, r.p[i]); d = Math.max(d, r.p[i + 1]); }
    r.b = [a, b, c, d];
    if (e && e.p) r.lo = null; // the simplified line is the old one: not used any more
  }
  (E.added || []).forEach((a, k) => {
    if (!a) return;
    const p = Float32Array.from(a.p);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); y0 = Math.min(y0, p[i + 1]); x1 = Math.max(x1, p[i]); y1 = Math.max(y1, p[i + 1]); }
    world.roads.push({ c: a.c, ref: a.ref, p, p0: p, lo: null, b: [x0, y0, x1, y1], i: 'a' + k, added: true });
  });
  world.roadsIndex = new Index(world.roads.filter((r) => !r.deleted));
}

// the TPF sites and landmarks as the generator's pins (auto-edits.json) and the map editor left
// them: moved, renamed, removed, or added (A: auto edits, E: the editor's)
export function applySiteEdits(world, E, A = {}) {
  if (!world.sites0) world.sites0 = world.sites;
  const ed = E.sites || {}, au = A.sites || {};
  const out = [];
  for (const s of world.sites0) {
    const a = s.id && au[s.id], e = s.id && ed[s.id];
    if (e && e.del) continue;
    out.push(a || e ? { ...s, ...(a || {}), ...(e || {}) } : s);
  }
  for (const s of E.sitesAdded || []) if (s) out.push({ ...s, tpf: true });
  world.sites = out;
}
