// Business items for search and the place panel (no generation code here).
import { TYPES } from './chains.js';
import { norm } from './search.js';

export function poiItem(q) {
  const t = TYPES[q.type];
  return {
    id: 'poi:' + q.id, type: 'poi', cat: t.cat, name: q.name, sub: `${t.label} · ${q.num} ${q.street}, ${q.town}`,
    x: q.x, y: q.y, zoom: 10, rank: 2, data: q, key: norm(q.name),
  };
}

export function openNow(q, now = new Date()) {
  const t = TYPES[q.type];
  if (t.open24) return { open: true, text: 'Open 24 hours' };
  const day = now.getDay();
  if (t.weekdays && (day === 0 || day === 6)) return { open: false, text: 'Closed today · Opens Monday' };
  if (q.type === 'church') return { open: true, text: 'Open · Services Sunday 10:00 AM' };
  const m = now.getHours() * 60 + now.getMinutes();
  const [o, c] = t.hours;
  const om = o[0] * 60 + o[1], cm = c[0] * 60 + c[1];
  // 12-hour times, as the archive's own documents write them
  const f = (h) => `${((h[0] + 11) % 12) + 1}:${String(h[1]).padStart(2, '0')} ${h[0] < 12 ? 'AM' : 'PM'}`;
  if (m >= om && m < cm) return { open: true, text: `Open · Closes ${f(c)}` };
  return { open: false, text: `Closed · Opens ${f(o)}` };
}
