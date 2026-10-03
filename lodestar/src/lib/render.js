// Draws one 256px tile from the vector world.
import { C, FONT, WZ, TZ, pxPerKm, roadWidth, roadMinZoom, riverMinAcc, riverWidth } from './style.js';
import { poiColor } from './labels.js';
import { chunkRecord, poisInBox, poiVersion, ruralInBox, compoundsInBox, fieldsInBox, portsInBox } from './packs.js';
import { TYPES, CAT_COLOR } from './chains.js';
import { ICONS } from './icons.js';

const TILE = 256;
const REAL = { 4: 0.015, 3: 0.0115, 2: 0.0095, 1: 0.0075, 0.5: 0.006 }; // road widths in km (paved width, as drawn at close zoom)

// at close zoom, round off the kinks of the stored lines (computed once per feature)
export function smooth(f) {
  if (f.sm) return f.sm;
  let p = f.p;
  for (let it = 0; it < 2; it++) {
    if (p.length < 6) break;
    const o = [p[0], p[1]];
    for (let i = 0; i < p.length - 2; i += 2) {
      o.push(0.75 * p[i] + 0.25 * p[i + 2], 0.75 * p[i + 1] + 0.25 * p[i + 3], 0.25 * p[i] + 0.75 * p[i + 2], 0.25 * p[i + 1] + 0.75 * p[i + 3]);
    }
    o.push(p[p.length - 2], p[p.length - 1]);
    p = o;
  }
  f.sm = new Float32Array(p);
  return f.sm;
}

function path(ctx, p, ox, oy, s, close) {
  ctx.moveTo(p[0] * s - ox, p[1] * s - oy);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * s - ox, p[i + 1] * s - oy);
  if (close) ctx.closePath();
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// state.out (the 3D map): the names of places and points (towns, villages, landmarks, peaks,
// businesses) and the buildings are handed back in it, not drawn: the 3D map stands them up.
// The names of what lies on the ground (streets, rivers, lakes, regions) stay on it
const FLOAT = new Set(['place', 'poi', 'peak']);
export function drawTile(ctx, world, tx, ty, z, state) {
  const out = state.out;
  const s = pxPerKm(z);
  const ox = tx * TILE, oy = ty * TILE;
  const x0 = ox / s, y0 = oy / s, x1 = (ox + TILE) / s, y1 = (oy + TILE) / s;
  const pad = 2 / s;
  const qx0 = x0 - pad, qy0 = y0 - pad, qx1 = x1 + pad, qy1 = y1 + pad;
  const wz = z + WZ; // zoom for the country's own features
  const tz = z + TZ; // zoom for towns, farms and compounds
  const lo = wz < 1.5;
  const geo = (f) => (lo && f.lo ? f.lo : f.p);
  const line = (f) => (z >= 6 ? smooth(f) : geo(f));
  const B = world.block;

  // fully unloaded tile: nothing but the grey of a tile that never arrived
  const bx0 = Math.floor(x0 / B), by0 = Math.floor(y0 / B), bx1 = Math.floor((x1 - 1e-6) / B), by1 = Math.floor((y1 - 1e-6) / B);
  let anyLoaded = false;
  for (let by = by0; by <= by1 && !anyLoaded; by++) for (let bx = bx0; bx <= bx1; bx++) if (world.isLoaded(bx * B + 1, by * B + 1)) { anyLoaded = true; break; }
  if (!anyLoaded) { ctx.fillStyle = C.unloaded; ctx.fillRect(0, 0, TILE, TILE); return; }

  ctx.fillStyle = C.water;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // land (kept, to keep the fields on it)
  const land = new Path2D();
  for (const f of world.landIndex.query(qx0, qy0, qx1, qy1)) path(land, geo(f), ox, oy, s, true);
  ctx.fillStyle = C.land;
  ctx.fill(land, 'evenodd');

  if (state.terrain && state.height) drawRelief(ctx, state.height, x0, y0, s);

  // fields: a patchwork of farmland, faint at first, clearer close in (gen/landuse.mjs)
  if (z >= 4) {
    const fl = fieldsInBox(x0, y0, x1, y1);
    if (fl.length) {
      // (a field's corners are on a coarser grid than the coast: what of it is out at sea is not drawn)
      ctx.save();
      ctx.clip(land, 'evenodd');
      for (let k = 0; k < FIELD.length; k++) {
        ctx.beginPath();
        let any = false;
        for (const f of fl) if (f.kind === k) { const q = f.q; ctx.moveTo(q[0][0] * s - ox, q[0][1] * s - oy); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0] * s - ox, q[i][1] * s - oy); ctx.closePath(); any = true; }
        if (!any) continue;
        ctx.fillStyle = FIELD[k]; ctx.globalAlpha = z >= 6 ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1;
        // close in, what each is: rows of vines, plots, glasshouses and panels, graves, a quarry's edge, reeds
        const pat = FIELD_LINES[k];
        if (pat && z >= pat.z) {
          ctx.save(); ctx.clip();
          ctx.beginPath();
          for (const f of fl) if (f.kind === k) fieldLines(ctx, f.q, s, ox, oy, pat.gap, pat.cross);
          ctx.strokeStyle = pat.color; ctx.lineWidth = pat.w; if (pat.dash) ctx.setLineDash(pat.dash); ctx.stroke(); ctx.setLineDash([]);
          ctx.restore();
        }
        if (k === QUARRY_K && z >= 6) { ctx.strokeStyle = '#c4b8a6'; ctx.lineWidth = 1; ctx.stroke(); }
        // a golf course: its fairways, paler, winding across it, each to a round green
        if (k === GOLF_K && z >= 6) {
          ctx.save(); ctx.clip();
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#dcf1cf'; ctx.lineWidth = Math.max(2, 0.035 * s);
          ctx.beginPath();
          for (const f of fl) if (f.kind === k) {
            const q = f.q, P = (u, v) => { const ax = q[0][0] + (q[1][0] - q[0][0]) * u, ay = q[0][1] + (q[1][1] - q[0][1]) * u, bx = q[3][0] + (q[2][0] - q[3][0]) * u, by = q[3][1] + (q[2][1] - q[3][1]) * u; return [(ax + (bx - ax) * v) * s - ox, (ay + (by - ay) * v) * s - oy]; };
            const holes = [[0.12, 0.15, 0.4, 0.2], [0.45, 0.22, 0.85, 0.12], [0.88, 0.3, 0.7, 0.55], [0.62, 0.62, 0.2, 0.5], [0.15, 0.72, 0.5, 0.88], [0.55, 0.9, 0.88, 0.82]];
            for (const [u0, v0, u1, v1] of holes) { const [X0, Y0] = P(u0, v0), [X1, Y1] = P(u1, v1); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); }
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  // glaciers, forests, parks
  if (wz >= -1.5) {
    ctx.beginPath();
    for (const f of world.forestsIndex.query(qx0, qy0, qx1, qy1)) path(ctx, geo(f), ox, oy, s, true);
    ctx.fillStyle = C.forest;
    ctx.fill('evenodd');
  }
  if (wz >= -0.5) {
    ctx.beginPath();
    for (const f of world.glaciersIndex.query(qx0, qy0, qx1, qy1)) path(ctx, f.p, ox, oy, s, true);
    ctx.fillStyle = C.glacier;
    ctx.fill('evenodd');
  }
  if (wz >= 0.5) {
    ctx.beginPath();
    for (const f of world.parksIndex.query(qx0, qy0, qx1, qy1)) path(ctx, f.p, ox, oy, s, true);
    ctx.fillStyle = 'rgba(160, 208, 148, 0.45)';
    ctx.fill('evenodd');
    if (wz >= 2) { ctx.strokeStyle = C.parkEdge; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); }
  }

  // lakes
  ctx.beginPath();
  for (const f of world.lakesIndex.query(qx0, qy0, qx1, qy1)) path(ctx, geo(f), ox, oy, s, true);
  ctx.fillStyle = C.water;
  ctx.fill('evenodd');

  // built-up areas and streets
  if (z >= 0.3) {
    const rings = world.urbanIndex.query(qx0, qy0, qx1, qy1);
    // (a town's ground is coarser than the shore: on the land only)
    ctx.save();
    ctx.clip(land, 'evenodd');
    ctx.beginPath();
    for (const r of rings) if (r.owner.big || z >= 2.2) path(ctx, r.p, ox, oy, s, true);
    ctx.fillStyle = tz >= 6 ? '#fbfaf7' : z < 3 ? C.urban : C.urbanSmall;
    ctx.fill('evenodd');
    ctx.restore();
    if (tz >= 6 && state.ch) state.town = drawTowns(ctx, world, rings, ox, oy, s, tz, qx0, qy0, qx1, qy1, state.ch, out, land);
  }

  // harbours, out on the water: a quay along the shore with berths, cranes, warehouses and
  // container stacks, or a village's jetty (gen/landuse.mjs). Over the town's ground (whose edge is
  // coarser than the shore); a river is drawn over it, through its quay
  if (wz >= 5) {
    const P2 = (q) => { ctx.moveTo(q[0][0] * s - ox, q[0][1] * s - oy); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0] * s - ox, q[i][1] * s - oy); ctx.closePath(); };
    for (const pt of portsInBox(x0, y0, x1, y1)) {
      ctx.beginPath();
      if (pt.quay) P2(pt.quay);
      for (const q of pt.piers) P2(q);
      ctx.fillStyle = '#e7e4df'; ctx.fill();
      if (tz >= 8) { ctx.strokeStyle = '#c9c4bb'; ctx.lineWidth = 0.8; ctx.lineJoin = 'miter'; ctx.stroke(); ctx.lineJoin = 'round'; }
      if (tz >= BUILD_Z && pt.sheds.length) { ctx.beginPath(); for (const q of pt.sheds) P2(q); ctx.fillStyle = BUILD.industrial; ctx.fill(); ctx.strokeStyle = BUILD_EDGE; ctx.lineWidth = 0.6; ctx.stroke(); if (out) for (const q of pt.sheds) out.builds.push({ r: q, kind: 'shed' }); }
      if (tz >= 10) {
        for (let c = 0; c < 5; c++) { ctx.beginPath(); let any = false; for (const [q, k] of pt.containers) if (k === c) { P2(q); any = true; } if (any) { ctx.fillStyle = CONTAINER[c]; ctx.fill(); } }
        ctx.fillStyle = '#7d7a75';
        for (const [x, y] of pt.cranes) { const r = Math.max(1.5, 0.008 * s); ctx.fillRect(x * s - ox - r, y * s - oy - r, r * 2, r * 2); }
      }
    }
  }

  // TPF compounds: cleared, fenced yard and buildings
  if (tz >= 7) {
    const cps = compoundsInBox(x0, y0, x1, y1);
    const poly = (pp) => { ctx.moveTo(pp[0][0] * s - ox, pp[0][1] * s - oy); for (let k = 1; k < pp.length; k++) ctx.lineTo(pp[k][0] * s - ox, pp[k][1] * s - oy); ctx.closePath(); };
    for (const cp of cps) if (cp.track && tz >= 8) {
      const t = cp.track;
      ctx.beginPath(); ctx.moveTo(t[0] * s - ox, t[1] * s - oy);
      for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k] * s - ox, t[k + 1] * s - oy);
      ctx.lineJoin = 'round'; ctx.strokeStyle = '#d9d2c5'; ctx.lineWidth = Math.max(2.2, 0.007 * s) + 1.4; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(2.2, 0.007 * s); ctx.stroke();
    }
    for (const cp of cps) {
      ctx.beginPath(); poly(cp.yard);
      ctx.fillStyle = '#ebe7e1'; ctx.fill();
      if (tz >= 9) { ctx.setLineDash([4, 3]); ctx.strokeStyle = '#a3958c'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
      if (tz >= 8) {
        ctx.beginPath(); for (const q of cp.buildings) poly(q);
        ctx.fillStyle = cp.ruin ? '#dcd4c4' : '#d6ccc6'; ctx.fill();
        if (out && !cp.ruin) for (const q of cp.buildings) out.builds.push({ r: q, kind: 'compound' });
        if (tz >= 10) { ctx.strokeStyle = 'rgba(130,115,105,.6)'; ctx.lineWidth = 0.9; if (cp.ruin) ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
      }
    }
  }

  // rivers
  const minAcc = riverMinAcc(wz);
  ctx.strokeStyle = C.river;
  for (const r of world.riversIndex.query(qx0, qy0, qx1, qy1)) {
    if (r.a1 < minAcc) continue;
    ctx.beginPath();
    path(ctx, line(r), ox, oy, s, false);
    const ra = (r.a0 + r.a1 * 2) / 3;
    // close in, a stream is drawn no wider than 14 m (gen/lib/clash.mjs keeps buildings off that), or its real width
    ctx.lineWidth = Math.max(Math.min(riverWidth(ra, wz), Math.max(4, 0.014 * s)), Math.min(0.32, 0.00028 * Math.sqrt(ra)) * s);
    ctx.stroke();
  }

  // province boundaries
  if (z < 6) { // province borders at every zoom out to the furthest
    ctx.beginPath();
    for (const r of world.provBordersIndex.query(qx0, qy0, qx1, qy1)) path(ctx, r.p, ox, oy, s, false); // between provinces only
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = wz < 2 ? 4 : 4.6; ctx.stroke(); // a halo, to read over rivers and roads
    ctx.strokeStyle = C.province;
    ctx.lineWidth = wz < 2 ? 1.7 : 2;
    ctx.setLineDash([8, 3, 2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // farmsteads and hamlet houses
  if (tz >= BUILD_Z) {
    const rur = ruralInBox(x0, y0, x1, y1);
    ctx.beginPath();
    for (const t of rur.tracks) { ctx.moveTo(t[0] * s - ox, t[1] * s - oy); for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k] * s - ox, t[k + 1] * s - oy); }
    ctx.strokeStyle = '#fbf8f2'; ctx.lineWidth = Math.max(2, 0.004 * s); ctx.stroke();
    {
    ctx.beginPath();
    for (const f of rur.farms) for (const q of f) { ctx.moveTo(q[0][0] * s - ox, q[0][1] * s - oy); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0] * s - ox, q[k][1] * s - oy); ctx.closePath(); if (out) out.builds.push({ r: q, kind: 'house' }); }
    ctx.fillStyle = BUILD.house; ctx.fill();
    ctx.strokeStyle = BUILD_EDGE; ctx.lineWidth = tz >= 11 ? 0.8 : tz >= 10 ? 0.5 : 0.35; ctx.stroke();
    }
  }

  // roads: all casings, then all fills, low classes first
  // furthest out (z < 0): no roads, only the country, its provinces and the water
  const roads = z < 0 ? [] : world.roadsIndex.query(qx0, qy0, qx1, qy1).filter((r) => wz >= roadMinZoom(r.c));
  roads.sort((a, b) => a.c - b.c);
  const fill = { 4: C.motorway, 3: wz < 1 ? C.primaryCase : C.primary, 2: C.secondary, 1: C.minor, 0.5: C.minor };
  const cas = { 4: C.motorwayCase, 3: C.primaryCase, 2: C.secondaryCase, 1: C.minorCase, 0.5: C.minorCase };
  // with the town's streets: every edge first, then the fills from the smallest street to the
  // motorway, so where two of them meet they join into one shape
  const town = state.town;
  if (town) town.streetPass(0);
  if (wz >= 1.5) {
    for (const r of roads) {
      ctx.beginPath(); path(ctx, line(r), ox, oy, s, false);
      ctx.strokeStyle = cas[r.c]; ctx.lineWidth = Math.max(roadWidth(r.c, wz), REAL[r.c] * s) + (wz > 4 ? 2 : 1.4);
      ctx.stroke();
    }
  }
  if (town) town.streetPass(1);
  for (const r of roads) {
    ctx.beginPath(); path(ctx, line(r), ox, oy, s, false);
    ctx.strokeStyle = wz < 1.5 && r.c <= 2 ? '#e2dccf' : fill[r.c];
    ctx.lineWidth = Math.max(roadWidth(r.c, wz), REAL[r.c] * s);
    ctx.stroke();
  }
  if (town) town.roundabouts();

  if (state.town) {
    if (state.town.names.length) drawStreetNames(ctx, state.town.names, ox, oy, s, tz, land);
    if (state.town.pois.length) drawPois(ctx, ox, oy, z, tz, out);
    state.town = null;
  }

  // country borders
  if (state.borders !== false) {
    const lines = world.bordersIndex.query(qx0, qy0, qx1, qy1);
    // on land only: a border stops at the coast
    ctx.save();
    ctx.beginPath();
    for (const f of world.landIndex.query(qx0, qy0, qx1, qy1)) path(ctx, geo(f), ox, oy, s, true);
    ctx.clip('evenodd');
    ctx.beginPath();
    for (const l of lines) path(ctx, line(l), ox, oy, s, false);
    ctx.strokeStyle = C.borderHalo; ctx.lineWidth = wz < 2 ? 4 : 6; ctx.stroke();
    ctx.strokeStyle = C.border; ctx.lineWidth = wz < 2 ? 1.3 : 1.8;
    ctx.setLineDash(wz < 2 ? [6, 3] : [9, 4, 2, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  // the buildings of the TPF sites, from the town's streets on (other buildings only at street scale)
  if (tz >= 6 && state.ch) {
    const quads = [];
    for (const st of world.sites) {
      if (!st.tpf || !st.pin || st.pin[0] < x0 - 0.3 || st.pin[0] > x1 + 0.3 || st.pin[1] < y0 - 0.3 || st.pin[1] > y1 + 0.3) continue;
      const q = siteBuilding(world, st, state.ch);
      if (q) quads.push(q);
    }
    if (quads.length) {
      ctx.beginPath();
      for (const q of quads) { ctx.moveTo(q[0][0] * s - ox, q[0][1] * s - oy); for (let k = 1; k < 4; k++) ctx.lineTo(q[k][0] * s - ox, q[k][1] * s - oy); ctx.closePath(); }
      ctx.fillStyle = '#dccfe8'; ctx.fill();
      ctx.strokeStyle = 'rgba(123,31,162,.75)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  // labels
  for (const L of state.labels) {
    const b = L.box;
    if (b[2] < ox || b[0] > ox + TILE || b[3] < oy || b[1] > oy + TILE) continue;
    if (out && FLOAT.has(L.kind)) out.labels.push(L); else drawLabel(ctx, L, ox, oy, z);
  }

  // blocks that did not load: grey, over everything
  ctx.fillStyle = C.unloaded;
  for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
    if (world.isLoaded(bx * B + 1, by * B + 1)) continue;
    const px = bx * B * s - ox, py = by * B * s - oy;
    ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(B * s) + 1, Math.ceil(B * s) + 1);
  }
}

// the building a TPF site's pin stands on (in the chunk records of the town round it), found once
const SITE_B = new Map();
function inQuad(q, x, y) { let n = 0; for (let i = 0; i < 4; i++) { const [ax, ay] = q[i], [bx, by] = q[(i + 1) % 4]; n += Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax)); } return Math.abs(n) === 4; }
function siteBuilding(world, st, CH) {
  if (SITE_B.has(st.id)) return SITE_B.get(st.id);
  const [x, y] = st.pin;
  for (const u of world.urban) {
    if (!u.rings.some((r) => r.b[0] <= x && r.b[2] >= x && r.b[1] <= y && r.b[3] >= y)) continue;
    for (let cy = Math.floor(y / CH) - 1; cy <= Math.floor(y / CH) + 1; cy++) for (let cx = Math.floor(x / CH) - 1; cx <= Math.floor(x / CH) + 1; cx++) {
      const R = chunkRecord(u.id, cx, cy);
      if (!R) continue;
      const b = R.buildings.find((b) => inQuad(b.r, x, y));
      if (b) { SITE_B.set(st.id, b.r); return b.r; }
    }
  }
  return null; // not loaded yet (or a compound, drawn with its yard)
}

// street pieces (main streets are stored a segment at a time, in every chunk they touch) joined
// into whole lines where exactly two pieces of the same kind meet end to end
function joinStreets(list) {
  const key = (x, y) => Math.round(x * 2e4) + ',' + Math.round(y * 2e4);
  const pieces = [], seen = new Set();
  for (const st of list) {
    const q = st.pts;
    if (q.length < 4) continue;
    const k = key(q[0], q[1]) + '|' + key(q[q.length - 2], q[q.length - 1]), k2 = key(q[q.length - 2], q[q.length - 1]) + '|' + key(q[0], q[1]);
    if (seen.has(k) || seen.has(k2)) continue; // the same piece from two chunks
    seen.add(k);
    pieces.push({ pts: Array.from(q), w: st.w, main: st.main, a: key(q[0], q[1]), b: key(q[q.length - 2], q[q.length - 1]) });
  }
  const at = new Map();
  for (const p of pieces) for (const k of [p.a, p.b]) { if (!at.has(k)) at.set(k, []); at.get(k).push(p); }
  const out = [], used = new Set();
  const next = (k, from) => { const l = at.get(k); if (!l || l.length !== 2) return null; const o = l[0] === from ? l[1] : l[0]; return o.main === from.main && !used.has(o) ? o : null; };
  for (const p0 of pieces) {
    if (used.has(p0)) continue;
    used.add(p0);
    let pts = p0.pts.slice(), w = p0.w, head = p0.a, tail = p0.b, cur = p0;
    for (let o; (o = next(tail, cur)); cur = o) { used.add(o); const fwd = o.a === tail; const q = fwd ? o.pts : reversePts(o.pts); pts.push(...q.slice(2)); tail = fwd ? o.b : o.a; w = Math.max(w, o.w); }
    cur = p0;
    for (let o; (o = next(head, cur)); cur = o) { used.add(o); const fwd = o.b === head; const q = fwd ? o.pts : reversePts(o.pts); pts = q.slice(0, -2).concat(pts); head = fwd ? o.a : o.b; w = Math.max(w, o.w); }
    out.push({ pts, w, main: p0.main });
  }
  return out;
}
function reversePts(q) { const r = []; for (let i = q.length - 2; i >= 0; i -= 2) r.push(q[i], q[i + 1]); return r; }
// the ends of street lines that meet nothing (no other street, no road): these get a round end
// (the segments near each end are found in a grid: a city tile has thousands of streets)
function deadEnds(lines, roads) {
  const G = 0.05, grid = new Map();
  // (only the cells where the streets end: a country road's segment can be kilometres long)
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const o of lines) { const q = o.pts, n = q.length; for (const i of [0, n - 2]) { X0 = Math.min(X0, q[i]); X1 = Math.max(X1, q[i]); Y0 = Math.min(Y0, q[i + 1]); Y1 = Math.max(Y1, q[i + 1]); } }
  const gx0 = Math.floor((X0 - 0.02) / G), gx1 = Math.floor((X1 + 0.02) / G), gy0 = Math.floor((Y0 - 0.02) / G), gy1 = Math.floor((Y1 + 0.02) / G);
  const add = (ax, ay, bx, by, o, pad) => {
    for (let gy = Math.max(gy0, Math.floor((Math.min(ay, by) - 0.02) / G)); gy <= Math.min(gy1, Math.floor((Math.max(ay, by) + 0.02) / G)); gy++)
      for (let gx = Math.max(gx0, Math.floor((Math.min(ax, bx) - 0.02) / G)); gx <= Math.min(gx1, Math.floor((Math.max(ax, bx) + 0.02) / G)); gx++) {
        const k = gx * 65536 + gy;
        let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(ax, ay, bx, by, o, pad);
      }
  };
  for (const o of lines) { const q = o.pts; for (let i = 2; i < q.length; i += 2) add(q[i - 2], q[i - 1], q[i], q[i + 1], o, 0); }
  for (const rd of roads) { const q = rd.p; for (let i = 2; i < q.length; i += 2) add(q[i - 2], q[i - 1], q[i], q[i + 1], null, 0.01); }
  const near = (x, y, self, r) => {
    const l = grid.get(Math.floor(x / G) * 65536 + Math.floor(y / G));
    if (l) for (let i = 0; i < l.length; i += 6) if (l[i + 4] !== self && segPt(x, y, l[i], l[i + 1], l[i + 2], l[i + 3]) < r + l[i + 5]) return true;
    return false;
  };
  const out = [];
  for (const st of lines) {
    const q = st.pts, n = q.length;
    if (!near(q[0], q[1], st, 0.006)) out.push([q[0], q[1], st]);
    if (!near(q[n - 2], q[n - 1], st, 0.006)) out.push([q[n - 2], q[n - 1], st]);
  }
  return out;
}
function segPt(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l));
  return Math.hypot(ax + t * dx - x, ay + t * dy - y);
}

// container stacks on a terminal
const CONTAINER = ['#c98a6e', '#7d98b8', '#93ad78', '#d2b56c', '#a597bd'];
// land use (gen/landuse.mjs): arable, pasture, orchard, fallow, vineyard, wood, marsh, heath, common,
// allotments, cemetery, golf course, quarry, market garden, solar farm
const FIELD = ['#ebe9cc', '#dcebcb', '#d0e3bd', '#ede6d6', '#e4e2c0', '#cbe2bd', '#d6eae2', '#e9e4d3', '#dbedcf', '#d9e8c4', '#d3e4cc', '#c7e6b6', '#e4ded4', '#e6edef', '#dde2ec'];
const QUARRY_K = 12, GOLF_K = 11;
// lines across a field, `gap` km apart along its long side (and across too: a grid)
const FIELD_LINES = {
  2: { z: 9, gap: 0.012, color: 'rgba(150,185,130,.55)', w: 1, dash: [1.5, 3.5] }, // orchard: rows of trees
  4: { z: 8, gap: 0.006, color: 'rgba(170,160,110,.55)', w: 0.8 }, // vineyard rows
  6: { z: 8, gap: 0.01, color: 'rgba(120,175,160,.5)', w: 0.8, dash: [3, 4] }, // marsh: reeds
  9: { z: 9, gap: 0.012, color: 'rgba(170,190,140,.8)', w: 0.8, cross: true }, // allotment plots
  10: { z: 9, gap: 0.006, color: 'rgba(150,170,145,.6)', w: 0.8, dash: [1.5, 2.5] }, // graves
  13: { z: 9, gap: 0.008, color: 'rgba(170,190,200,.9)', w: 1 }, // glasshouses
  14: { z: 9, gap: 0.006, color: 'rgba(120,135,175,.7)', w: 1.4 }, // panels
};
function fieldLines(ctx, q, s, ox, oy, gap, cross) {
  const L01 = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), L03 = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
  const sets = cross ? [[0, 1, 3, 2], [0, 3, 1, 2]] : [L01 > L03 ? [0, 3, 1, 2] : [0, 1, 3, 2]];
  for (const [a, b, c, d] of sets) {
    // from points along edge a-b to the matching points along edge c-d
    const len = Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1]), n = Math.min(80, Math.floor(len / gap));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ctx.moveTo((q[a][0] + (q[b][0] - q[a][0]) * t) * s - ox, (q[a][1] + (q[b][1] - q[a][1]) * t) * s - oy);
      ctx.lineTo((q[c][0] + (q[d][0] - q[c][0]) * t) * s - ox, (q[c][1] + (q[d][1] - q[c][1]) * t) * s - oy);
    }
  }
}

// (car parks a paler, bluer grey than the buildings, with a P close in, as Google draws them)
const AREA = { park: '#c6e5b8', pitch: '#b8dfa6', parking: '#eef0f5', plaza: '#f1ebe1' };
// buildings as Google draws them: quiet cool greys that never compete with the streets
const BUILD = { row: '#e6e7eb', flat: '#e4e6ea', house: '#e9eaee', shed: '#ecedf0', industrial: '#e2e3e9', church: '#e3e0dc', school: '#ebe8e0', shop: '#e9e6ec' };
const BUILD_EDGE = 'rgba(190,193,200,.9)';
// buildings show from the 500 m scale bar (map zoom 7, town zoom 7 + TZ ≈ 8.6)
const BUILD_Z = 8.5;

function drawTowns(ctx, world, rings, ox, oy, s, z, x0, y0, x1, y1, CH, out, land) {
  const owners = new Set();
  for (const r of rings) if (r.owner.place) owners.add(r.owner);
  const P = (x, y) => [x * s - ox, y * s - oy];
  const line = (pts) => { ctx.moveTo(pts[0] * s - ox, pts[1] * s - oy); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * s - ox, pts[i + 1] * s - oy); };
  const polyPath = (pp) => { ctx.moveTo(pp[0][0] * s - ox, pp[0][1] * s - oy); for (let k = 1; k < pp.length; k++) ctx.lineTo(pp[k][0] * s - ox, pp[k][1] * s - oy); ctx.closePath(); };
  const names = [];
  const streets = [], mains = [], areas = [], builds = [], paths = [], rounds = [];
  for (const u of owners) {
    let tx0 = Infinity, ty0 = Infinity, tx1 = -Infinity, ty1 = -Infinity;
    for (const r of u.rings) { tx0 = Math.min(tx0, r.b[0]); ty0 = Math.min(ty0, r.b[1]); tx1 = Math.max(tx1, r.b[2]); ty1 = Math.max(ty1, r.b[3]); }
    if (tx1 < x0 || tx0 > x1 || ty1 < y0 || ty0 > y1) continue;
    // chunks left of and above the tile may lean 48 m into it
    for (let cy = Math.floor(Math.max(y0 - 0.06, ty0 - 0.3) / CH); cy <= Math.floor(Math.min(y1, ty1 + 0.3) / CH); cy++)
      for (let cx = Math.floor(Math.max(x0 - 0.06, tx0 - 0.3) / CH); cx <= Math.floor(Math.min(x1, tx1 + 0.1) / CH); cx++) {
        const R = chunkRecord(u.id, cx, cy);
        if (!R) continue;
        for (const st of R.streets) if (!st.regional) (st.main ? mains : streets).push(st);
        if (z >= 8) areas.push(...R.areas);
        if (z >= 9) { paths.push(...R.paths); rounds.push(...R.rounds); }
        // street scale only: at city scale the streets alone; only those on the tile (a chunk is 2.4 km)
        if (z >= BUILD_Z) for (const b of R.buildings) if (b.cx + b.rr > x0 && b.cx - b.rr < x1 && b.cy + b.rr > y0 && b.cy - b.rr < y1) builds.push(b);
      }
  }
  // open land
  for (const kind of ['plaza', 'park', 'pitch', 'parking']) {
    ctx.beginPath();
    let any = false;
    for (const a of areas) if (a.kind === kind) { polyPath(a.poly); any = true; }
    if (!any) continue;
    ctx.fillStyle = AREA[kind]; ctx.fill();
    if (kind === 'pitch' && z >= 10) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    if (kind === 'parking' && z >= 10) {
      ctx.strokeStyle = '#d6dae3'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.save(); ctx.font = `700 ${z >= 11 ? 11 : 9}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#7b8db8';
      for (const a of areas) if (a.kind === 'parking') {
        let cx = 0, cy = 0; for (const p of a.poly) { cx += p[0]; cy += p[1]; }
        const [X, Y] = P(cx / a.poly.length, cy / a.poly.length);
        const xs = a.poly.map((p) => p[0]); if ((Math.max(...xs) - Math.min(...xs)) * s > 18) ctx.fillText('P', X, Y);
      }
      ctx.restore();
    }
  }
  for (const a of areas) if (a.pond) { ctx.beginPath(); polyPath(a.pond); ctx.fillStyle = C.water; ctx.fill(); }
  if (z >= 10) {
    ctx.beginPath();
    for (const a of areas) if (a.paths) for (const pth of a.paths) line(pth);
    for (const pth of paths) line(pth);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#b9b2a6'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
  }
  // streets: casing, then fill; main streets a touch wider and creamier (local streets from z8)
  // like Google Maps: streets a little wider than real at middle zoom, real width close in
  // a street's stored width is the scaled-up town's (TS times real); drawn near its real width, so a
  // town street is never wider than the country road it leaves
  // (at most 9 m: narrower than any country road but a lane, as a town street is)
  const wpx = (w) => Math.max(z >= 10 ? 6 : z >= 9 ? 4.5 : z >= 8 ? 2.6 : 1.3, Math.min(0.009, (w / Math.pow(2, TZ)) * 0.8) * s);
  // the streets are drawn with the country's roads (drawTile): edges of all of them first, then
  // the fills, so a street joins a road instead of lying over its edge
  // Streets end square where they meet another street or road (a round end as wide as the street
  // would bulge past a narrower road) and round only at a dead end. Square ends need whole lines,
  // so the pieces stored per chunk are joined end to end first.
  const lines = joinStreets(z >= 8 ? [...streets, ...mains] : mains);
  const ends = deadEnds(lines, world.roadsIndex.query(x0, y0, x1, y1));
  // (a town's streets on the land only: none runs out over the sea)
  const streetPass = (pass) => {
    ctx.save(); ctx.clip(land, 'evenodd');
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const st of lines) {
      ctx.beginPath(); line(st.pts);
      ctx.strokeStyle = pass === 0 ? '#dad3c6' : st.main ? '#fffaf0' : '#ffffff';
      ctx.lineWidth = wpx(st.w) + (pass === 0 ? (z >= 10 ? 2 : 1.2) : 0);
      ctx.stroke();
    }
    for (const [x, y, st] of ends) {
      const [X, Y] = P(x, y);
      ctx.beginPath(); ctx.arc(X, Y, (wpx(st.w) + (pass === 0 ? (z >= 10 ? 2 : 1.2) : 0)) / 2, 0, Math.PI * 2);
      ctx.fillStyle = pass === 0 ? '#dad3c6' : st.main ? '#fffaf0' : '#ffffff'; ctx.fill();
    }
    ctx.restore();
  };
  const roundabouts = () => {
    for (const r of rounds) {
      const [X, Y] = P(r.x, r.y);
      ctx.beginPath(); ctx.arc(X, Y, r.r * s, 0, Math.PI * 2);
      ctx.strokeStyle = '#dad3c6'; ctx.lineWidth = 0.009 * s + 2; ctx.stroke();
      ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 0.009 * s; ctx.stroke();
      if (z >= 10) { ctx.beginPath(); ctx.arc(X, Y, Math.max(1, (r.r - 0.006) * s), 0, Math.PI * 2); ctx.fillStyle = '#c6e5b8'; ctx.fill(); }
    }
  };
  // buildings
  if (z >= BUILD_Z) {
    const byKind = new Map();
    for (const b of builds) { if (!byKind.has(b.kind)) byKind.set(b.kind, []); byKind.get(b.kind).push(b); }
    for (const [kind, list] of byKind) {
      ctx.beginPath();
      for (const b of list) polyPath(b.r);
      ctx.fillStyle = BUILD[kind] || BUILD.house; ctx.fill();
      if (out) out.builds.push(...list);
      if (z >= 9.5) { ctx.strokeStyle = BUILD_EDGE; ctx.lineWidth = z >= 11 ? 0.8 : 0.5; ctx.stroke(); } // (further out an edge is under half a pixel)
    }
  }
  if (z >= 10) names.push(...streets, ...mains);
  else if (z >= 9) names.push(...mains); // main street names one zoom earlier
  const pois = z >= 9 ? poisInBox(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05) : [];
  return { names, pois, streetPass, roundabouts };
}

const MAJOR = new Set(['supermarket', 'hypermarket', 'school', 'hospital', 'church', 'townhall', 'fuel', 'hotel', 'museum', 'department', 'cinema', 'police', 'fire', 'library', 'post']);
const GLYPH = new Map();
const glyph = (name) => { let g = GLYPH.get(name); if (!g) GLYPH.set(name, (g = new Path2D(ICONS[name] || ICONS.pin))); return g; };

// Which business icons show, and which with a name, is decided once per region of 8 x 8 tiles
// (looking at the regions round it too), so an icon on the edge of a tile is drawn by both tiles,
// whole, instead of by neither
const POI_PLACE = new Map(), TEXT_W = new Map();
function placePois(ctx, mz, z, rx, ry) {
  const key = `${mz}|${rx}|${ry}|${poiVersion()}`;
  let out = POI_PLACE.get(key);
  if (out) return out;
  const s = Math.pow(2, mz), R = (8 * TILE) / s, M = TILE / s; // (and a tile round it, for the icons that would overlap across its edge)
  const pois = poisInBox(rx * R - M, ry * R - M, (rx + 1) * R + M, (ry + 1) * R + M);
  const rank = (q) => (MAJOR.has(q.type) ? 0 : 2) + (q.chain ? 0 : 1) - (q.rating || 0) / 10;
  pois.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
  const boxes = [];
  out = [];
  ctx.font = `600 ${z >= 11 ? 12 : 11}px ${FONT}`;
  const r = z >= 11 ? 10 : z >= 10 ? 9 : 7.5;
  const hit = (b) => boxes.some((o) => !(o[2] < b[0] || o[0] > b[2] || o[3] < b[1] || o[1] > b[3]));
  // (as Google: further out only the big places and the chains, with room between them)
  const pad = z >= 11.5 ? 3 : 8;
  for (const q of pois) {
    const major = MAJOR.has(q.type);
    if (z < 10 && !major) continue;
    if (z < 11.5 && !major && !q.chain) continue;
    const X = q.x * s, Y = q.y * s;
    let tw = 0;
    if (z >= 11 || (z >= 10 && (major || q.chain))) { const wk = ctx.font + q.name; tw = TEXT_W.get(wk); if (tw === undefined) TEXT_W.set(wk, (tw = ctx.measureText(q.name).width)); }
    let box = [X - r - pad, Y - r - pad, X + r + (tw ? tw + 7 : 1) + pad, Y + r + pad];
    if (hit(box)) {
      // no room for the name: the icon alone
      tw = 0; box = [X - r - pad, Y - r - pad, X + r + pad, Y + r + pad];
      if (hit(box)) continue;
    }
    boxes.push(box);
    if (q.x >= rx * R && q.x < (rx + 1) * R && q.y >= ry * R && q.y < (ry + 1) * R) out.push({ q, X, Y, r, tw, box });
  }
  POI_PLACE.set(key, out);
  if (POI_PLACE.size > 300) POI_PLACE.delete(POI_PLACE.keys().next().value);
  return out;
}

function drawPois(ctx, ox, oy, mz, z, out) {
  const R = 8 * TILE, rx0 = Math.floor((ox - 200) / R), rx1 = Math.floor((ox + TILE + 30) / R), ry0 = Math.floor((oy - 30) / R), ry1 = Math.floor((oy + TILE + 30) / R);
  for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) for (const it of placePois(ctx, mz, z, rx, ry)) {
    const box = it.box;
    if (box[2] < ox || box[0] > ox + TILE || box[3] < oy || box[1] > oy + TILE) continue;
    if (out) out.pois.push([it, z]); else drawPoi(ctx, it, it.X - ox, it.Y - oy, z);
  }
}
// one business: its icon at X, Y and its name, if it has room for one (it.tw)
export function drawPoi(ctx, { q, r, tw }, X, Y, z) {
  ctx.textBaseline = 'middle';
  const t = TYPES[q.type], col = CAT_COLOR[t.cat];
  ctx.font = `600 ${z >= 11 ? 12 : 11}px ${FONT}`;
  ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.save();
  const k = (r * 1.25) / 24;
  ctx.translate(X - 12 * k, Y - 12 * k); ctx.scale(k, k);
  ctx.fillStyle = '#fff'; ctx.fill(glyph(t.icon));
  ctx.restore();
  if (tw) {
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.strokeText(q.name, X + r + 4, Y + 0.5);
    ctx.fillStyle = col; ctx.fillText(q.name, X + r + 4, Y + 0.5);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawStreetNames(ctx, streets, ox, oy, s, z, land) {
  const boxes = [], seen = new Set(), T = ctx.getTransform();
  ctx.font = `500 ${z >= 11 ? 12 : 10.5}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const st of streets) {
    if (!st.name || seen.has(st.name + (st.main ? 'm' : ''))) continue;
    const q = st.pts;
    const w = ctx.measureText(st.name).width;
    // the longest straight-ish run inside the tile
    let best = null;
    for (let i = 2; i < q.length; i += 2) {
      const ax = q[i - 2] * s - ox, ay = q[i - 1] * s - oy;
      let j = i, L = 0, a0 = null, ok = true;
      for (; j < q.length; j += 2) {
        const bx = q[j] * s - ox, by = q[j + 1] * s - oy, px2 = q[j - 2] * s - ox, py2 = q[j - 1] * s - oy;
        const ang = Math.atan2(by - py2, bx - px2);
        if (a0 === null) a0 = ang; else if (Math.abs(Math.atan2(Math.sin(ang - a0), Math.cos(ang - a0))) > 0.35) break;
        L += Math.hypot(bx - px2, by - py2);
        if (L > w + 24) break;
      }
      if (L > w + 24) { const e = Math.min(j, q.length - 2); best = [ax, ay, q[e] * s - ox, q[e + 1] * s - oy]; break; }
    }
    if (!best) continue;
    const mx = (best[0] + best[2]) / 2, my = (best[1] + best[3]) / 2;
    let ang = Math.atan2(best[3] - best[1], best[2] - best[0]);
    if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const hw = w / 2 + 6;
    const ex = Math.abs(Math.cos(ang)) * hw + 8, ey = Math.abs(Math.sin(ang)) * hw + 8;
    if (mx - ex < 0 || mx + ex > 256 || my - ey < 0 || my + ey > 256) continue;
    const box = [mx - ex - 10, my - ey - 10, mx + ex + 10, my + ey + 10];
    if (boxes.some((o) => !(o[2] < box[0] || o[0] > box[2] || o[3] < box[1] || o[1] > box[3]))) continue;
    { const c = T.transformPoint({ x: mx, y: my }); if (!ctx.isPointInPath(land, c.x, c.y, 'evenodd')) continue; } // (not on the water)
    boxes.push(box); seen.add(st.name + (st.main ? 'm' : ''));
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.strokeText(st.name, 0, 0.5);
    ctx.fillStyle = st.main ? '#5b5f65' : '#73777d'; ctx.fillText(st.name, 0, 0.5);
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
}

function drawRelief(ctx, hm, x0, y0, s) {
  const N = 64, img = ctx.createImageData(N, N), d = img.data;
  const step = 256 / s / N; // km per sample
  const H = (x, y) => {
    const gx = Math.max(0, Math.min(hm.w - 1.001, x / hm.cell - 0.5)), gy = Math.max(0, Math.min(hm.h - 1.001, y / hm.cell - 0.5));
    const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, a = hm.data;
    return a[j * hm.w + i] * (1 - fx) * (1 - fy) + a[j * hm.w + i + 1] * fx * (1 - fy) + a[(j + 1) * hm.w + i] * (1 - fx) * fy + a[(j + 1) * hm.w + i + 1] * fx * fy;
  };
  const e = Math.max(step, 0.5);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = x0 + (i + 0.5) * step, y = y0 + (j + 0.5) * step;
    const h = H(x, y);
    const dx = (H(x + e, y) - H(x - e, y)) / (2 * e * 1000), dy = (H(x, y + e) - H(x, y - e)) / (2 * e * 1000);
    const shade = Math.max(0, Math.min(1, 0.72 - (dx * 0.7 - dy * 0.7) * 6));
    const t = Math.max(0, Math.min(1, h / 2600));
    const o = (j * N + i) * 4;
    // elevation tint (green lowland to tan uplands) multiplied by the shade
    const r = 214 + 30 * t, g = 228 - 10 * t, b = 196 + 6 * t;
    d[o] = r * (0.55 + shade * 0.6); d[o + 1] = g * (0.55 + shade * 0.6); d[o + 2] = b * (0.55 + shade * 0.6);
    d[o + 3] = h > 0 ? 150 : 0;
  }
  const c = document.createElement('canvas');
  c.width = c.height = N;
  c.getContext('2d').putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(c, 0, 0, 256, 256);
  ctx.restore();
}

function haloText(ctx, text, x, y, color, halo, spacing) {
  if (spacing) ctx.letterSpacing = spacing + 'px';
  if (halo) { ctx.strokeStyle = C.halo; ctx.lineWidth = halo; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  if (spacing) ctx.letterSpacing = '0px';
}

export function drawLabel(ctx, L, ox, oy, z) {
  const X = L.X - ox, Y = L.Y - oy;
  ctx.textBaseline = 'alphabetic';
  if (L.kind === 'place') {
    if (L.dot) {
      ctx.beginPath(); ctx.arc(X, Y, L.dot, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = L.place.k === 'capital' ? 2 : 1.3; ctx.strokeStyle = L.place.c === 'est' ? '#5f6368' : '#8a8d91'; ctx.stroke();
      if (L.place.k === 'capital') { ctx.beginPath(); ctx.arc(X, Y, 1.6, 0, Math.PI * 2); ctx.fillStyle = '#5f6368'; ctx.fill(); }
    }
    ctx.font = L.font; ctx.textAlign = 'left';
    haloText(ctx, L.text, L.tx - ox, L.ty - oy, L.color, L.halo, 0);
    return;
  }
  if (L.kind === 'shield') {
    const w = L.w, h = L.h, x = X - w / 2, y = Y - h / 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 3.5);
    if (L.road.c === 4) { ctx.fillStyle = '#2f6db5'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
    else { ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#8f8a7e'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.font = L.font; ctx.textAlign = 'center';
    ctx.fillStyle = L.road.c === 4 ? '#fff' : '#3c4043';
    ctx.fillText(L.text, X, Y + 3.6);
    return;
  }
  ctx.font = L.font;
  ctx.textAlign = 'center';
  if (L.kind === 'peak') {
    ctx.beginPath(); ctx.moveTo(X, Y - 4.5); ctx.lineTo(X + 4.5, Y + 3); ctx.lineTo(X - 4.5, Y + 3); ctx.closePath();
    ctx.fillStyle = '#8a7a64'; ctx.fill();
    haloText(ctx, L.text, X, Y + L.oy - 2, L.color, L.halo, 0);
    ctx.font = `500 10px ${FONT}`;
    haloText(ctx, L.sub, X, Y + L.oy + 10, '#7c7f83', 2.5, 0);
    return;
  }
  if (L.kind === 'poi') {
    const col = poiColor(L.site.type);
    ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(X, Y, 1.8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    haloText(ctx, L.text, X, Y + L.oy + 4, L.color, L.halo, 0);
    return;
  }
  ctx.save();
  ctx.translate(X, Y + (L.oy || 0));
  if (L.angle) ctx.rotate(L.angle);
  haloText(ctx, L.text, 0, L.size * 0.35, L.color, L.halo, L.spacing);
  ctx.restore();
}

