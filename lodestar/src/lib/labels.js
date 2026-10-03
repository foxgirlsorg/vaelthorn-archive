// Global label placement per integer zoom. Every label gets a box in world pixels;
// higher priority labels are placed first and lower ones are dropped on overlap.
// Tiles then draw whatever placed labels touch them, so text crosses tile edges cleanly.
import { C, FONT, WZ, TZ, pxPerKm } from './style.js';

const meas = document.createElement('canvas').getContext('2d');
function textW(text, font, spacing = 0) {
  meas.font = font;
  return meas.measureText(text).width + spacing * Math.max(0, text.length - 1);
}

const KIND_RANK = { capital: 0, city: 1, town: 2, village: 3, hamlet: 4 };
// districts and street names belong to a town and are read at z + TZ; the rest at z + WZ
const TOWN_KINDS = new Set(['district', 'street']);

function placeStyle(p, z) {
  const k = p.k;
  if (k === 'capital') return { size: z < 0 ? 15 : z < 3 ? 17 : 19, weight: 700, minZ: -4, dotTo: 3.2 };
  // seen from furthest out: the capital and the seats (province capitals, and the largest city of
  // each neighbour); other cities and towns come in as one zooms in
  if (k === 'city' || (k === 'town' && p.seat)) {
    const big = p.pop > 300000;
    return { size: big ? (z < 1 ? 13.5 : 16) : z < 1 ? 12 : 14.5, weight: big ? 650 : 600, minZ: p.seat ? -4 : big ? 1.5 : 2, dotTo: 3.6 };
  }
  if (k === 'town') return { size: z < 3 ? 11.5 : 13, weight: 550, minZ: p.pop > 15000 ? 3 : 4, dotTo: 4.8 };
  // villages from the 2 km scale (z5) and hamlets from the 1 km scale (z6), as on Google Maps;
  // earlier they bury the towns under a carpet of names (z here is z + WZ)
  if (k === 'village') return { size: z < 6.5 ? 11 : 12, weight: 500, minZ: 6, dotTo: 5.4 };
  return { size: 10.5, weight: 500, minZ: 7, dotTo: 6.5 };
}

export function buildCandidates(world, opts) {
  const cands = [];
  const L = (o) => cands.push(o);
  // countries
  for (const c of world.countries) {
    const est = c.id === 'est';
    L({ kind: 'country', x: c.x, y: c.y, text: c.name.toUpperCase(), pri: est ? 5 : 30, minZ: -4, maxZ: est ? 1.6 : 3.2,
      style: (z) => ({ font: `${est ? 650 : 600} ${est ? (z < -1 ? 17 : 21) : 15}px ${FONT}`, color: C.country, spacing: est ? 5 : 3.5, halo: 3 }), target: { type: 'country', id: c.id, name: c.name } });
  }
  for (const s of world.seas) {
    L({ kind: 'sea', x: s.label[0], y: s.label[1], text: s.name, pri: 40, minZ: -4, maxZ: 6,
      style: (z) => ({ font: `italic 500 ${s.size === 3 ? 16 : 13}px ${FONT}`, color: C.waterLabel, spacing: 1.5, halo: 0 }), target: { type: 'water', name: s.name } });
  }
  for (const p of world.provinces) {
    if (p.city) continue; // the City of Aurenhal: the city's own name says it
    L({ kind: 'province', x: p.x, y: p.y, text: p.name.toUpperCase(), pri: 60, minZ: 3, maxZ: 4.4, // z2 and z3 only
      style: () => ({ font: `600 10.5px ${FONT}`, color: C.provinceText, spacing: 2.4, halo: 2.5 }), target: { type: 'province', name: p.name, desc: p.desc, x: p.x, y: p.y } });
  }
  for (const r of world.ranges) {
    const pts = r.pts.filter(([x, y]) => world.isLoaded(x, y));
    if (pts.length < 2) continue;
    const m = pts[(pts.length / 2) | 0];
    let ang = Math.atan2(pts.at(-1)[1] - pts[0][1], pts.at(-1)[0] - pts[0][0]);
    if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    ang = Math.max(-0.6, Math.min(0.6, ang));
    L({ kind: 'range', x: m[0], y: m[1], text: r.name.toUpperCase(), pri: 70, minZ: 3, maxZ: 4.6, angle: ang,
      style: () => ({ font: `italic 600 11px ${FONT}`, color: C.range, spacing: 3.2, halo: 2.5 }), target: { type: 'range', name: r.name, x: m[0], y: m[1] } });
  }
  // places; a seat is the largest place of each province of Esteloria, or of each neighbour
  const seats = new Map();
  for (const p of world.places) {
    if (p.k === 'capital') continue;
    const key = p.c === 'est' ? 'est:' + p.pr : p.c, o = seats.get(key);
    if (!o || p.pop > o.pop) seats.set(key, p);
  }
  for (const p of seats.values()) p.seat = true;
  for (const p of world.places) {
    const rank = KIND_RANK[p.k];
    L({ kind: 'place', place: p, x: p.x, y: p.y, text: p.n, pri: 100 + rank * 100 - Math.min(99, Math.log10(p.pop + 10) * 12) - (p.c === 'est' ? 4 : 0) - (p.seat ? 150 : 0) - (p.k === 'capital' ? 300 : 0), // the capital first, then the seats
      minZ: placeStyle(p, 0).minZ, maxZ: 99, target: { type: 'place', place: p } });
  }
  for (const pk of world.peaks) {
    L({ kind: 'peak', x: pk.x, y: pk.y, text: pk.name, sub: `${pk.ele.toLocaleString('en-GB')} m`, pri: 420 - pk.ele / 100, minZ: 2.4, maxZ: 99,
      style: () => ({ font: `600 11px ${FONT}`, color: '#5b5e62', spacing: 0, halo: 2.5 }), target: { type: 'peak', peak: pk } });
  }
  for (const l of world.lakes) {
    if (!l.name) continue;
    const minZ = l.area > 300 ? -0.4 : l.area > 80 ? 1.2 : l.area > 25 ? 2.4 : 3.6;
    L({ kind: 'lake', x: l.x, y: l.y, text: l.name, pri: 300 - Math.min(80, l.area / 10), minZ, maxZ: 99,
      style: (z) => ({ font: `italic 500 ${z > 4 ? 12.5 : 11}px ${FONT}`, color: C.waterLabel, spacing: 0.6, halo: 0 }), target: { type: 'lake', lake: l } });
  }
  for (const pk of world.parks) {
    L({ kind: 'park', x: pk.x, y: pk.y, text: pk.name, pri: 380, minZ: 1.8, maxZ: 6.5,
      style: () => ({ font: `600 11px ${FONT}`, color: C.parkText, spacing: 0, halo: 2.5 }), target: { type: 'park', park: pk } });
  }
  for (const d of world.districts) {
    L({ kind: d.kind, x: d.x, y: d.y, text: d.kind === 'district' ? d.name.toUpperCase() : d.name, angle: d.angle ? (d.angle * Math.PI) / 180 : 0,
      pri: d.kind === 'district' ? 150 : 160, minZ: d.kind === 'district' ? 5 : 5.8, maxZ: 99,
      style: () => d.kind === 'district' ? { font: `600 10.5px ${FONT}`, color: '#7b7f85', spacing: 1.8, halo: 2.5 } : { font: `500 11px ${FONT}`, color: '#5f6368', spacing: 0, halo: 2.5 },
      target: { type: 'street', name: d.name, city: d.city, x: d.x, y: d.y } });
  }
  for (const s of world.sites) {
    if (s.tpf) continue; // TPF sites are DOM markers
    L({ kind: 'poi', site: s, x: s.x, y: s.y, text: s.name, pri: 240, minZ: s.type === 'Bridge' || s.type === 'Weir and crossing' || s.type === 'Archaeological site' ? 3 : 4.2, maxZ: 99,
      style: () => ({ font: `600 11px ${FONT}`, color: poiColor(s.type), spacing: 0, halo: 2.5 }), target: { type: 'site', site: s } });
  }
  // rivers and road shields are generated per zoom (they depend on pixel spacing)
  return cands;
}

export function poiColor(type) {
  if (/Hospital/.test(type)) return '#c5463c';
  if (/Lake|Weir|Bridge/.test(type)) return '#3f6f93';
  if (/Memorial|Historic|Archaeological/.test(type)) return '#7a5c3c';
  if (/Border/.test(type)) return '#6b5a8e';
  return '#5b6c7d';
}

function alongLine(p, step, zpx, cb) {
  // walk a polyline (km) and call cb at every `step` pixels with position and angle
  let acc = step * 0.5;
  for (let i = 2; i < p.length; i += 2) {
    const ax = p[i - 2], ay = p[i - 1], bx = p[i], by = p[i + 1];
    const seg = Math.hypot(bx - ax, by - ay) * zpx;
    let t = 0;
    while (acc <= seg) {
      const f = acc / seg;
      cb(ax + (bx - ax) * f, ay + (by - ay) * f, Math.atan2(by - ay, bx - ax), i);
      acc += step;
    }
    acc -= seg;
  }
}

export function placeLabels(world, cands, z, reserved = [], bbox = null) {
  const zpx = pxPerKm(z), wz = z + WZ, tz = z + TZ;
  // a label must sit wholly on loaded tiles, or the grey of a missing tile cuts it
  const onLoaded = (b) => world.isLoaded(b[0] / zpx, b[1] / zpx) && world.isLoaded(b[2] / zpx, b[1] / zpx) && world.isLoaded(b[0] / zpx, b[3] / zpx) && world.isLoaded(b[2] / zpx, b[3] / zpx);
  const out = [];
  const grid = new Map();
  const G = 96;
  const boxes = (b) => {
    const k = [];
    for (let y = Math.floor(b[1] / G); y <= Math.floor(b[3] / G); y++) for (let x = Math.floor(b[0] / G); x <= Math.floor(b[2] / G); x++) k.push(x + ',' + y);
    return k;
  };
  const hit = (b) => {
    for (const k of boxes(b)) for (const o of grid.get(k) || []) if (!(o[2] < b[0] || o[0] > b[2] || o[3] < b[1] || o[1] > b[3])) return true;
    return false;
  };
  const put = (b) => { for (const k of boxes(b)) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); } };
  for (const r of reserved) put(r);

  // with a region box, consider candidates a little beyond it (for collisions), emit only those inside
  const M = bbox ? (bbox[2] - bbox[0]) * 0.15 : 0;
  const inBox = (x, y, m = 0) => !bbox || (x >= bbox[0] - m && x < bbox[2] + m && y >= bbox[1] - m && y < bbox[3] + m);
  const list = cands.filter((c) => { const cz = TOWN_KINDS.has(c.kind) ? tz : wz; return cz >= c.minZ && cz <= c.maxZ; }) .filter((c) => inBox(c.x, c.y, M) && (c.kind === 'country' || c.kind === 'sea' || world.isLoaded(c.x, c.y)));
  const rivers = bbox ? world.riversIndex.query(bbox[0] - M, bbox[1] - M, bbox[2] + M, bbox[3] + M) : world.rivers;
  const roadsL = bbox ? world.roadsIndex.query(bbox[0] - M, bbox[1] - M, bbox[2] + M, bbox[3] + M) : world.roads;
  // per-zoom candidates: river names and road shields
  for (const r of rivers) {
    if (!r.name) continue;
    const big = r.a1 > 40000;
    if (wz < (big ? 2 : r.a1 > 12000 ? 3 : 4)) continue;
    alongLine(r.p, 520, zpx, (x, y, ang, i) => {
      if (!world.isLoaded(x, y) || !inBox(x, y, M)) return;
      // smooth the angle over neighbouring vertices
      const j0 = Math.max(0, i - 8), j1 = Math.min(r.p.length - 2, i + 6);
      let a = Math.atan2(r.p[j1 + 1] - r.p[j0 + 1], r.p[j1] - r.p[j0]);
      if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      list.push({ kind: 'river', x, y, text: r.name, angle: a, pri: big ? 260 : 330,
        style: () => ({ font: `italic 500 11px ${FONT}`, color: C.waterLabel, spacing: 1, halo: 2 }), target: { type: 'river', river: r, x, y } });
    });
  }
  for (const rd of roadsL) {
    if (rd.deleted) continue;
    if (!rd.ref) continue;
    if (rd.c === 4 && wz < 2) continue;
    if (rd.c === 3 && wz < 2.6) continue;
    if (rd.c < 3) continue;
    alongLine(rd.p, rd.c === 4 ? 360 : 460, zpx, (x, y) => {
      if (!world.isLoaded(x, y) || !inBox(x, y, M)) return;
      list.push({ kind: 'shield', x, y, text: rd.c === 4 ? 'X' + rd.ref : String(rd.ref), road: rd, pri: rd.c === 4 ? 210 : 350, target: { type: 'road', road: rd, x, y } });
    });
  }
  list.sort((a, b) => a.pri - b.pri);

  for (const c of list) {
    const X = c.x * zpx, Y = c.y * zpx;
    if (c.kind === 'place') {
      const p = c.place, st = placeStyle(p, wz);
      if (wz < st.minZ) continue;
      const font = `${st.weight} ${st.size}px ${FONT}`;
      const w = textW(c.text, font), h = st.size;
      const dot = tz < st.dotTo; // a dot until the town itself shows
      const r = p.k === 'capital' ? 4.5 : p.k === 'city' ? 3.5 : p.k === 'town' ? 2.6 : 2;
      const tries = dot
        ? [[r + 3, -h / 2], [-r - 3 - w, -h / 2], [-w / 2, -r - 2 - h], [-w / 2, r + 2]]
        : [[-w / 2, -h / 2]];
      for (const [ox, oy] of tries) {
        const b = [X + ox - 2, Y + oy - 1, X + ox + w + 2, Y + oy + h + 1];
        const db = dot ? [X - r - 1, Y - r - 1, X + r + 1, Y + r + 1] : null;
        if (hit(b) || (db && hit(db)) || !onLoaded(b)) continue;
        put(b); if (db) put(db);
        out.push({ ...c, box: b, tx: X + ox, ty: Y + oy + h * 0.78, font, color: p.c === 'est' ? C.text : '#6a6d72', halo: 3, dot: dot ? r : 0, X, Y });
        break;
      }
      continue;
    }
    if (c.kind === 'shield') {
      const font = `700 10px ${FONT}`;
      const w = Math.max(16, textW(c.text, font) + 8), h = 15;
      const b = [X - w / 2 - 3, Y - h / 2 - 3, X + w / 2 + 3, Y + h / 2 + 3];
      if (hit(b) || !onLoaded(b)) continue;
      put(b);
      out.push({ ...c, box: b, X, Y, w, h, font });
      continue;
    }
    const st = c.style(TOWN_KINDS.has(c.kind) ? tz : wz);
    const w = textW(c.text, st.font, st.spacing);
    const size = parseFloat(/(\d+(\.\d+)?)px/.exec(st.font)[1]);
    const h = size * (c.sub ? 2.3 : 1.2);
    const ang = c.angle || 0;
    // rotated labels: box of the rotated rectangle (conservative)
    const cw = Math.abs(Math.cos(ang)) * w + Math.abs(Math.sin(ang)) * h, ch = Math.abs(Math.sin(ang)) * w + Math.abs(Math.cos(ang)) * h;
    let oy = 0;
    if (c.kind === 'peak' || c.kind === 'poi') oy = -h / 2 - 6;
    const b = [X - cw / 2 - 2, Y + oy - ch / 2 - 2, X + cw / 2 + 2, Y + oy + ch / 2 + 2];
    if (hit(b) || (c.kind !== 'sea' && !onLoaded(b))) continue;
    put(b);
    out.push({ ...c, box: b, X, Y, oy, w, h, ...st, size });
  }
  return bbox ? out.filter((l) => inBox(l.x, l.y)) : out;
}
