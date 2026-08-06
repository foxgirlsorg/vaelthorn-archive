const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

/** '2026-03-17' -> '17 Mar 2026' (plain date, no UTC shift). */
export function formatPublished(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-03-17' -> '17.03.2026' */
export function formatShort(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
