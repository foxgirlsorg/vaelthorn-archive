// One list of everything that can be searched or opened in the place panel.
import { listItems } from './sharedlist.js';

const KIND_LABEL = { capital: 'Capital city', city: 'City', town: 'Town', village: 'Village', hamlet: 'Hamlet' };
export const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'");

export function buildItems(world) {
  const items = [];
  const cn = world.countryName;
  const where = (p) => [p.pr, cn[p.c]].filter(Boolean).join(', ');
  for (const p of world.places) {
    items.push({
      id: 'place:' + p.id, type: 'place', cat: p.k === 'capital' || p.k === 'city' ? 'city' : p.k,
      name: p.n, sub: `${KIND_LABEL[p.k]} · ${where(p)}`, x: p.x, y: p.y,
      zoom: p.k === 'capital' ? 4 : p.k === 'city' ? 5 : p.k === 'town' ? 5 : 6,
      rank: (p.k === 'capital' ? 6 : 0) + Math.log10(p.pop + 10) + (p.canon ? 1.5 : 0) + (p.c === 'est' ? 0.5 : 0), data: p,
    });
  }
  for (const s of world.sites) {
    if (s.tpf) continue; // not map data: they come from the shared list below
    items.push({
      id: 'site:' + (s.id || s.name), type: 'site', cat: /Hospital/.test(s.type) ? 'hospital' : 'landmark',
      name: s.name, sub: `${s.type}${s.town ? ' · near ' + s.town : ''}`,
      x: s.x, y: s.y, zoom: 6, rank: 5, data: s,
    });
  }
  items.push(...listItems(world));
  for (const pk of world.peaks) items.push({ id: 'peak:' + pk.name, type: 'peak', cat: 'peak', name: pk.name, sub: `Mountain · ${pk.ele.toLocaleString('en-GB')} m · ${cn[pk.country]}`, x: pk.x, y: pk.y, zoom: 4, rank: 3 + pk.ele / 1000, data: pk });
  for (const l of world.lakes) if (l.name) items.push({ id: 'lake:' + l.name, type: 'lake', cat: 'lake', name: l.name, sub: `Lake · ${l.area.toLocaleString('en-GB')} km²`, x: l.x, y: l.y, zoom: l.area > 50 ? 2 : 4, rank: 2.5 + Math.log10(l.area + 1), data: l });
  const seenRiver = new Set();
  for (const r of world.rivers) {
    if (!r.name || seenRiver.has(r.name)) continue;
    seenRiver.add(r.name);
    const m = ((r.p.length / 4) | 0) * 2;
    items.push({ id: 'river:' + r.name, type: 'river', cat: 'river', name: 'River ' + r.name, sub: 'River', x: r.p[m], y: r.p[m + 1], zoom: 1, rank: 3 + Math.log10(r.a1) / 2, data: r });
  }
  for (const p of world.parks) items.push({ id: 'park:' + p.name, type: 'park', cat: 'park', name: p.name, sub: 'Protected area · Esteloria', x: p.x, y: p.y, zoom: 2, rank: 4.5, data: p });
  for (const p of world.provinces) items.push({ id: 'prov:' + p.name, type: 'province', cat: 'region', name: p.name, sub: 'Province of Esteloria', x: p.x, y: p.y, zoom: 0, rank: 6, data: p });
  for (const r of world.ranges) { const m = r.pts[(r.pts.length / 2) | 0]; items.push({ id: 'range:' + r.name, type: 'range', cat: 'region', name: r.name, sub: 'Mountain range', x: m[0], y: m[1], zoom: 0, rank: 4, data: r }); }
  for (const d of world.districts) items.push({ id: 'street:' + d.name, type: 'street', cat: 'street', name: d.name, sub: `${d.kind === 'district' ? 'District' : 'Street'} · ${d.city}`, x: d.x, y: d.y, zoom: 7, rank: 3, data: d });
  for (const c of world.countries) items.push({ id: 'country:' + c.id, type: 'country', cat: 'region', name: c.name, sub: 'Country', x: c.x, y: c.y, zoom: c.id === 'est' ? -2 : -1, rank: 8, data: c });
  for (const it of items) it.key = norm(it.name);
  return items;
}

export function search(items, q, limit = 8) {
  const n = norm(q.trim());
  if (!n) return [];
  const out = [];
  for (const it of items) {
    let s = -1;
    if (it.key === n) s = 100;
    else if (it.key.startsWith(n)) s = 80;
    else {
      const i = it.key.indexOf(n);
      if (i > 0 && /[\s\-(.']/.test(it.key[i - 1])) s = 65;
      else if (i > 0) s = 35;
      else if (n.length >= 4 && fuzzy(it.key, n)) s = 15;
    }
    if (s < 0) continue;
    out.push([s + it.rank * 2.2, it]);
  }
  out.sort((a, b) => b[0] - a[0]);
  return out.slice(0, limit).map((o) => o[1]);
}

// letters in order, at most two skipped between them
function fuzzy(key, q) {
  let j = 0, gap = 0;
  for (let i = 0; i < key.length && j < q.length; i++) {
    if (key[i] === q[j]) { j++; gap = 0; } else if (j > 0 && ++gap > 2) { j = 0; gap = 0; }
  }
  return j === q.length;
}

// chips: business categories (generated near the view) and the fixed sets
export const CATEGORIES = [
  { id: 'food', label: 'Restaurants', icon: 'food', poi: true },
  { id: 'grocery', label: 'Groceries', icon: 'grocery', poi: true },
  { id: 'shop', label: 'Shopping', icon: 'shop', poi: true },
  { id: 'hotel', label: 'Hotels', icon: 'hotel', poi: true },
  { id: 'fuel', label: 'Fuel', icon: 'fuel', poi: true },
  { id: 'health', label: 'Pharmacies', icon: 'pharmacy', poi: true },
  { id: 'education', label: 'Schools', icon: 'school', poi: true },
  { id: 'money', label: 'Banks & post', icon: 'bank', poi: true },
  { id: 'landmark', label: 'Landmarks', icon: 'landmark' },
  { id: 'park', label: 'Parks', icon: 'park' },
  { id: 'city', label: 'Cities', icon: 'city' },
];
