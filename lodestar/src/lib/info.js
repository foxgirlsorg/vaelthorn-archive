// Panel content (description, badge, info rows) for every kind of item.

import { TYPES, CHAINS } from './chains.js';
import { openNow } from './poiview.js';

const fmtPop = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/0$/, '')} million` : n.toLocaleString('en-GB'));
export const gridRef = (x, y) => `${x.toFixed(1)} E · ${y.toFixed(1)} S`;

export function elevationAt(h, x, y) {
  if (!h) return null;
  const gx = Math.max(0, Math.min(h.w - 1.001, x / h.cell - 0.5)), gy = Math.max(0, Math.min(h.h - 1.001, y / h.cell - 0.5));
  const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, a = h.data;
  return a[j * h.w + i] * (1 - fx) * (1 - fy) + a[j * h.w + i + 1] * fx * (1 - fy) + a[(j + 1) * h.w + i] * (1 - fx) * fy + a[(j + 1) * h.w + i + 1] * fx * fy;
}

function lineLength(p) {
  let L = 0;
  for (let i = 2; i < p.length; i += 2) L += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return L;
}
function ringArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] + p[i]) * (p[j + 1] - p[i + 1]);
  return Math.abs(a / 2);
}

export function itemInfo(item, world, height) {
  const cn = world.countryName;
  const rows = [];
  let desc = item.data?.desc || '';
  let badge = '', badgeRed = false;
  const ele = elevationAt(height, item.x, item.y);
  const eleRow = () => ele != null && ele > 0 && rows.push({ icon: 'mountain', label: 'Elevation', value: `${Math.round(ele).toLocaleString('en-GB')} m` });
  const d = item.data || {};
  switch (item.type) {
    case 'place': {
      rows.push({ icon: 'people', label: 'Population', value: fmtPop(d.pop) });
      rows.push({ icon: 'region', label: d.c === 'est' ? 'Province' : 'Country', value: d.c === 'est' ? `${d.pr || '—'}, Esteloria` : cn[d.c] });
      eleRow();
      if (!desc) {
        const kind = { city: 'City', town: 'Town', village: 'Village', hamlet: 'Hamlet' }[d.k] || '';
        desc = d.c === 'est' ? `${kind} in the ${d.pr || 'Esteloria'} province of Esteloria.` : `${kind} in ${cn[d.c]}, near the Estelorian border.`;
      }
      break;
    }
    case 'site': {
      if (item.cat === 'list') {
        // a shared list item: the map knows only where it is; the rest is the owner's note
        desc = '';
        if (d.town) rows.push({ icon: 'city', label: 'Near', value: d.town + (d.province ? `, ${d.province}` : '') });
        eleRow();
        break;
      }
      rows.push({ icon: 'info', label: 'Type', value: d.type });
      if (d.town) rows.push({ icon: 'city', label: 'Nearest town', value: d.town + (d.province ? `, ${d.province}` : '') });
      eleRow();
      break;
    }
    case 'peak':
      rows.push({ icon: 'mountain', label: 'Height', value: `${d.ele.toLocaleString('en-GB')} m` });
      rows.push({ icon: 'region', label: 'Country', value: cn[d.country] });
      desc = desc || `Summit in ${cn[d.country]}.`;
      break;
    case 'lake':
      rows.push({ icon: 'lake', label: 'Area', value: `${d.area.toLocaleString('en-GB')} km²` });
      eleRow();
      if (d.name === 'Black Mere') desc = 'Moorland lake beside the hamlet of Blackmere, at the end of the closed branch line north of Stenhollow.';
      break;
    case 'river':
      rows.push({ icon: 'river', label: 'Length shown', value: `${Math.round(lineLength(d.p)).toLocaleString('en-GB')} km` });
      rows.push({ icon: 'region', label: 'Catchment at mouth', value: `${Math.round(d.a1).toLocaleString('en-GB')} km²` });
      if (d.name === 'Halve') desc = 'Esteloria\'s principal river. It rises in the Grey Fells, runs through Halveth and the Northern Dales, past Merrowgate, and reaches the sea at Corvenne.';
      if (d.name === 'Auren') desc = 'River of the capital. It flows west through Aurenhal and joins the Halve above Merrowgate.';
      if (d.name === 'Ireyn') desc = 'Eastern river. It comes down from the north to Tollen, where Route 9 crosses it at the Route 9 Bridge, then turns east through the small rural county of Ireyn. For a short stretch it is the border with Varsenne before it crosses into that country.';
      break;
    case 'park': {
      const area = d.rings.reduce((a, r) => a + ringArea(r.p), 0);
      rows.push({ icon: 'park', label: 'Area', value: `${Math.round(area).toLocaleString('en-GB')} km²` });
      desc = 'Protected landscape, managed by the Esteloria Survey Office.';
      break;
    }
    case 'province': {
      const ps = world.places.filter((p) => p.pr === d.name);
      const pop = ps.reduce((a, p) => a + p.pop, 0);
      const seat = ps.slice().sort((a, b) => b.pop - a.pop)[0];
      const area = d.rings.reduce((a, r) => a + ringArea(r.p), 0);
      if (seat) rows.push({ icon: 'city', label: 'Largest city', value: seat.n });
      rows.push({ icon: 'people', label: 'Population', value: fmtPop(Math.round(pop / 1000) * 1000) });
      rows.push({ icon: 'region', label: 'Area', value: `${Math.round(area / 100) * 100} km²`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') });
      break;
    }
    case 'range':
      desc = 'Mountain range.';
      break;
    case 'street':
      rows.push({ icon: 'city', label: 'City', value: d.city });
      break;
    case 'country':
      if (d.id === 'est') {
        rows.push({ icon: 'city', label: 'Capital', value: 'Aurenhal' });
        rows.push({ icon: 'people', label: 'Population', value: 'about 14 million' });
        rows.push({ icon: 'landmark', label: 'Government', value: 'Provisional Council (since 10.01.2024)' });
        desc = 'Republic in the middle of the continent. It borders Norrhald, Varsenne, Mirova, Alcora and Brennland, and has one coast, on the Gulf of Corvenne.';
      } else {
        desc = `Neighbouring country of Esteloria. Lodestar has map data only for the area near the Estelorian border.`;
      }
      break;
    case 'road':
      rows.push({ icon: 'road', label: 'Class', value: d.c === 4 ? 'Motorway' : d.c === 3 ? 'National route' : 'Road' });
      if (item.name === 'Route 9') desc = 'National route through the Ireyn valley, from Ostrey by way of Tollen to the Varsenne border. Crosses the Ireyn river at the Route 9 Bridge.';
      break;
    case 'poi': {
      const ch = CHAINS.find((c) => c.id === d.chain);
      const st = openNow(d);
      badge = st.text; badgeRed = !st.open;
      rows.push({ icon: 'pin', label: 'Address', value: `${d.num} ${d.street}, ${d.town}${d.province ? ', ' + d.province : ''}` });
      if (d.phone) rows.push({ icon: 'phone', label: 'Phone', value: d.phone });
      if (ch?.web) rows.push({ icon: 'web', label: 'Website', value: ch.web });
      if (d.rating) rows.push({ icon: 'star', label: 'Rating', value: `${d.rating.toFixed(1)} ${'★'.repeat(Math.round(d.rating))}${'☆'.repeat(5 - Math.round(d.rating))} (${d.reviews.toLocaleString('en-GB')} reviews)` });
      rows.push({ icon: 'chain', label: ch ? (ch.scope === 'continental' ? 'Continental chain' : ch.scope === 'national' ? 'National chain' : 'Regional chain') : 'Business', value: ch ? `${ch.name} · ${ch.note}` : 'Independent, one location' });
      desc = '';
      break;
    }
    case 'point': {
      eleRow();
      if (item.near) rows.push({ icon: 'city', label: 'Nearest place', value: item.near });
      break;
    }
  }
  rows.push({ icon: 'pin', label: 'Survey grid', value: gridRef(item.x, item.y) });
  return { desc, rows, badge, badgeRed };
}
