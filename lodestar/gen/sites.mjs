// Puts TPF sites from canon.mjs that the map does not have yet into public/data/world.json, where
// features.mjs would have put them (near their town, on land), so a new site needs no new map; and
// brings the names, years, status and descriptions of the sites it has up to date.
// Then: extras.mjs (a compound for a site out of town), overlaps.mjs (the pin of a site in town
// goes on a building).
//   node sites.mjs
import fs from 'node:fs';
import { FACILITIES } from './canon.mjs';
import { inPoly } from './lib/clash.mjs';

const file = new URL('../public/data/world.json', import.meta.url);
const raw = JSON.parse(fs.readFileSync(file));
const MAP_K = 0.5; // (features.mjs: canon.mjs is in the units of the world before it was halved)
const q = raw.q;
const ring = (f) => { const out = []; let x = 0, y = 0; for (let i = 0; i < f.p.length; i += 2) { x += f.p[i]; y += f.p[i + 1]; out.push(x / q, y / q); } return out; };
const land = raw.land.map(ring), lakes = raw.lakes.map(ring);
const onLand = (x, y) => land.filter((r) => inPoly(x, y, r)).length % 2 === 1 && !lakes.some((r) => inPoly(x, y, r));

const places = raw.places;
const provRank = (prov, rank) => places.filter((p) => p.pr === prov && (p.k === 'city' || p.k === 'town') && !p.canon).sort((a, b) => b.pop - a.pop)[rank];
const resolveNear = (near) => (typeof near === 'string' ? places.find((p) => p.n === near) : provRank(near.province, near.rank) || provRank(near.province, 0));
const have = new Map(raw.sites.map((s) => [s.id, s]));
let added = 0, updated = 0;
for (const f of FACILITIES) {
  // a site the map has: what canon.mjs says of it now (where it is stays)
  const old = have.get(f.id);
  if (old) {
    for (const k of ['name', 'type', 'years', 'status', 'desc', 'canon']) if (f[k] !== undefined && old[k] !== f[k]) { old[k] = f[k]; updated++; }
    continue;
  }
  const base = resolveNear(f.near);
  if (!base) { console.warn('no base for', f.id); continue; }
  let x, y;
  if (f.at) [x, y] = [f.at[0] * MAP_K, f.at[1] * MAP_K];
  else {
    x = base.x + f.off[0] * MAP_K; y = base.y + f.off[1] * MAP_K;
    if (!onLand(x, y)) { x = base.x + f.off[0] * MAP_K * 0.4; y = base.y + f.off[1] * MAP_K * 0.4; }
  }
  raw.sites.push({ ...f, near: undefined, off: undefined, x: +x.toFixed(2), y: +y.toFixed(2), town: base.n, province: base.pr, tpf: true });
  added++;
}
fs.writeFileSync(file, JSON.stringify(raw));
console.log(`TPF sites added: ${added}, details changed: ${updated}; now ${raw.sites.filter((s) => s.tpf).length}`);
