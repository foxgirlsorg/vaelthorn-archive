// Points of interest per town: along the main streets and around the old square,
// with chains chosen by country and province and independents everywhere else.
import { TYPES, CHAINS, MIX, localName } from './chains.js';
import { townOf, h32 } from './town.js';
import { norm } from './search.js';

// how likely a business of this type belongs to a chain
const CHAIN_P = { supermarket: 0.85, hypermarket: 1, convenience: 0.65, bank: 0.85, post: 0.95, fuel: 0.85, pharmacy: 0.6, cafe: 0.25, hotel: 0.35, bakery: 0.3, cinema: 0.7, department: 1, books: 0.3, hardware: 0.45, restaurant: 0.05, pub: 0.1, outdoor: 1, wine: 0.6 };
const MIN_POP = { museum: 5000, cinema: 15000, hotel: 1500, department: 80000, library: 2500, police: 4000, fire: 6000, sports: 5000, jeweller: 4000, books: 3000, dentist: 2000, school: 400 };

function chainFor(type, p, r1, r2) {
  if (r1 > (CHAIN_P[type] ?? 0)) return null;
  const list = CHAINS.filter((c) => c.type === type && p.pop >= (c.minPop || 0) &&
    (c.scope === 'continental' || (c.scope === 'national' && c.country === p.c) || (c.scope === 'regional' && p.c === 'est' && c.provinces.includes(p.pr))));
  if (!list.length) return null;
  const tot = list.reduce((a, c) => a + c.w, 0);
  let x = r2 * tot;
  for (const c of list) { x -= c.w; if (x <= 0) return c; }
  return list[list.length - 1];
}

function pickType(mix, p, r) {
  const ents = Object.entries(mix).filter(([t]) => p.pop >= (MIN_POP[t] || 0));
  const tot = ents.reduce((a, [, w]) => a + w, 0);
  let x = r * tot;
  for (const [t, w] of ents) { x -= w; if (x <= 0) return t; }
  return ents[0][0];
}

// adds businesses to out; rnd(n, k) gives the hashes for the n-th one
function adder(T, out, idOf, rnd) {
  const p = T.p;
  let n = 0;
  // force: a chain's branch for certain (when the type has a chain here)
  return (type, x, y, street, num, force = false) => {
    n++;
    const R = (k) => rnd(n, k);
    const ch = chainFor(type, p, force ? 0 : R(1), R(2));
    if (type === 'hypermarket' && !ch) return;
    if (type === 'outdoor' && !ch) type = 'clothes';
    if (type === 'department' && !ch) return;
    const name = ch ? ch.name : localName(type, p.n, street || 'Market', (k) => rnd(n, 500 + k));
    out.push({
      id: idOf(n), type, name, x, y, chain: ch ? ch.id : null, town: p.n, province: p.pr, country: p.c,
      street: street || 'Market Square', num: num || 1 + Math.floor(R(3) * 60),
      rating: +(3.4 + 1.5 * Math.pow(R(4), 0.6)).toFixed(1), reviews: Math.floor(4 + 900 * Math.pow(R(5), 2.2)),
      phone: `0${(strDigits(p.n) % 90) + 10} ${100 + Math.floor(R(6) * 899)} ${1000 + Math.floor(R(7) * 8999)}`,
    });
  };
}

export function poisOf(T) {
  if (T.pois) return T.pois;
  const p = T.p, out = [];
  const R = (k) => h32(T.seed, out.length + 1, k, 991);
  const add = adder(T, out, (n) => `${T.u.id}-${n}`, (n, k) => h32(T.seed, n, k, 991));
  // the square: church and town hall, moved out of the river when the centre is on its bank
  const dry = (x, y) => {
    for (let r = 0; r < 0.6; r += 0.01) for (let a = 0; a < 12; a++) {
      const qx = x + Math.cos(a * 0.5236) * r, qy = y + Math.sin(a * 0.5236) * r;
      if (!T.inWater(qx, qy, 0.01)) return [qx, qy];
      if (r === 0) break;
    }
    return [x, y];
  };
  add('church', ...dry(p.x + 0.01, p.y - 0.004), 'Market Square', 1);
  if (p.pop >= 1500) add('townhall', ...dry(p.x - 0.018, p.y + 0.012), 'Market Square', 2);
  // cap by population, so a village gets a handful and the capital thousands
  const cap = Math.min(12000, 3 + Math.floor(p.pop / 150));
  const streets = T.mains.map((m) => ({ pts: m.pts, name: m.name, w: m.w }));
  for (const st of streets) {
    const q = st.pts;
    let along = 0, next = 0.02 + h32(T.seed, st.pts.length, 3) * 0.05, side = 1;
    for (let i = 2; i < q.length && out.length < cap; i += 2) {
      const ax = q[i - 2], ay = q[i - 1], bx = q[i], by = q[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      while (next < along + L && out.length < cap) {
        const t = next - along, x = ax + ux * t, y = ay + uy * t;
        const dens = T.density(x, y);
        const zone = dens > 0.6 ? 'core' : dens > 0.3 ? 'urban' : 'suburb';
        const off = st.w / 2 + 0.012;
        const type = pickType(MIX[zone], p, R(8));
        if (T.inWater(x - uy * off * side, y + ux * off * side, 0.006)) { next += 0.02; continue; } // not in the river
        add(type, x - uy * off * side, y + ux * off * side, st.name, 2 + Math.floor(next / 0.012) * 2 + (side > 0 ? 1 : 0));
        side = -side;
        const sp = zone === 'core' ? 0.03 + 0.04 * R(9) : zone === 'urban' ? 0.1 + 0.15 * R(9) : 0.3 + 0.4 * R(9);
        next += sp * (p.pop < 3000 ? 2.5 : 1);
      }
      along += L;
    }
  }
  // what every town has, whatever the streets above came to: a hospital (more in a city), a
  // chain supermarket, a few chain convenience shops and, from 10,000 people, a hypermarket out
  // on a main road at the edge of town
  if (T.mains.length && (p.k === 'town' || p.k === 'city' || p.k === 'capital')) {
    const has = (type, chain) => out.filter((q) => q.type === type && (!chain || q.chain)).length;
    const at = (i, salt, edge = false) => {
      const m = T.mains[Math.floor(h32(T.seed, i, salt) * T.mains.length)];
      const n = m.pts.length / 2, k = edge ? Math.max(0, n - 2 - Math.floor(h32(T.seed, i, salt + 1) * 3)) : Math.floor(h32(T.seed, i, salt + 1) * n);
      const x = m.pts[2 * k], y = m.pts[2 * k + 1], k2 = Math.min(n - 1, k + 1);
      const dx = m.pts[2 * k2] - x || 1e-6, dy = m.pts[2 * k2 + 1] - y, l = Math.hypot(dx, dy), off = m.w / 2 + (edge ? 0.04 : 0.02);
      return { m, xy: dry(x - (dy / l) * off, y + (dx / l) * off) };
    };
    const hospitals = 1 + Math.floor(p.pop / 400000);
    for (let i = has('hospital'); i < hospitals; i++) { const s = at(i, 77); add('hospital', ...s.xy, s.m.name, 1); }
    if (!has('supermarket', true)) { const s = at(0, 81); add('supermarket', ...s.xy, s.m.name, 3, true); }
    const corner = 2 + Math.floor(p.pop / 8000);
    for (let i = has('convenience', true); i < Math.min(40, corner); i++) { const s = at(i, 83); add('convenience', ...s.xy, s.m.name, 5 + 2 * i, true); }
    const hyper = p.pop >= 10000 ? 1 + Math.floor(p.pop / 150000) : 0;
    for (let i = 0; i < Math.min(12, hyper); i++) { const s = at(i, 85, true); add('hypermarket', ...s.xy, s.m.name, 200 + i, true); }
  }
  T.pois = out;
  return out;
}

// ground-floor businesses on every street of a chunk: shops, cafés and restaurants fill
// the rows of a city centre, thin out in the inner suburbs and are rare further out
const CIVIC = new Set(['school', 'church', 'fire', 'police', 'library', 'museum', 'townhall', 'hospital', 'fuel', 'sports', 'cinema', 'department', 'supermarket', 'hypermarket', 'post']);
// hotels are few on ordinary ground floors; most stand on the main streets
const FLOOR_MIX = Object.fromEntries(Object.entries(MIX).map(([z, m]) => [z, Object.fromEntries(Object.entries(m).filter(([t]) => !CIVIC.has(t)).map(([t, v]) => [t, t === 'hotel' ? v * 0.15 : v]))]));
const BIG_SHOP = { supermarket: 6, hardware: 2, convenience: 1, department: 1, outdoor: 0.6, clothes: 1 };
// skip(x, y): true for a building that takes no business (a TPF site's building)
export function chunkPois(T, C, D, cx, cy, skip = null) {
  const p = T.p, out = [];
  if (p.pop < 1500) return out;
  const size = Math.min(1, 0.25 + Math.log10(p.pop / 1500) / 3); // 0.25 for a small town, 1 for a city of 1.5 million
  const add = adder(T, out, (n) => `${T.u.id}-${cx}.${cy}-${n}`, (n, k) => h32(T.seed, cx * 7919 + cy, n * 13 + k, 613));
  const lines = [];
  for (const s of C.streets) if (s.name) lines.push(s);
  for (const m of C.mains) if (m.street?.name && !m.street.river && !m.street.regional) lines.push({ pts: [m.ax, m.ay, m.bx, m.by], name: m.street.name });
  const streetAt = (x, y) => {
    let best = null, bd = 0.05;
    for (const s of lines) {
      const q = s.pts;
      for (let i = 2; i < q.length; i += 2) {
        const ax = q[i - 2], ay = q[i - 1], dx = q[i] - ax, dy = q[i + 1] - ay, l2 = dx * dx + dy * dy || 1e-12;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
        const d = Math.hypot(ax + t * dx - x, ay + t * dy - y);
        if (d < bd) { bd = d; best = s.name; }
      }
    }
    return best;
  };
  let k = 0;
  for (const b of D.buildings) {
    k++;
    if (b.kind !== 'row' && b.kind !== 'flat' && b.kind !== 'shop') continue;
    const x = (b.r[0][0] + b.r[2][0]) / 2, y = (b.r[0][1] + b.r[2][1]) / 2;
    if (skip && skip(x, y)) continue;
    const dens = T.density(x, y);
    const zone = dens > 0.6 ? 'core' : dens > 0.3 ? 'urban' : 'suburb';
    const r = h32(T.seed, cx * 104729 + cy, k, 271);
    let type;
    if (b.kind === 'shop') {
      if (r > 0.9) continue;
      type = pickType(BIG_SHOP, p, h32(T.seed, cx, cy * 31 + k, 272));
    } else {
      const base = b.kind === 'row' ? { core: 0.23, urban: 0.055, suburb: 0.007 } : { core: 0.3, urban: 0.07, suburb: 0.01 };
      if (r > base[zone] * size) continue;
      type = pickType(FLOOR_MIX[zone], p, h32(T.seed, cx, cy * 31 + k, 272));
    }
    const street = streetAt(x, y);
    if (!street) continue;
    add(type, +x.toFixed(4), +y.toFixed(4), street, 1 + Math.floor(h32(T.seed, cx, cy, k * 3) * 180));
  }
  return out;
}

function strDigits(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 1000; return h; }

// all POIs of towns near a point (towns are generated on demand and cached)
export function poisNear(world, x, y, r, filter = () => true) {
  const out = [];
  for (const u of world.urban) {
    const p = u.place;
    if (!p || Math.abs(p.x - x) > r + 30 || Math.abs(p.y - y) > r + 30) continue;
    if (Math.hypot(p.x - x, p.y - y) > r + Math.sqrt(p.pop) / 50) continue;
    const T = townOf(u, world);
    for (const q of poisOf(T)) if (filter(q) && Math.hypot(q.x - x, q.y - y) < r) out.push(q);
  }
  return out;
}
