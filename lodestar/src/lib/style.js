// Lodestar map style. Flat colours in the manner of a road atlas app.
export const C = {
  water: '#a6cfe5',
  waterLabel: '#3f6f93',
  land: '#f4f2ed',
  landAbroad: '#f0eee8',
  unloaded: '#e5e3de',
  forest: '#d2e6c5',
  park: '#bfe0b2',
  parkEdge: '#93c48a',
  glacier: '#fbfcfd',
  urban: '#ece8e0',
  urbanSmall: '#efece6',
  street: '#ffffff',
  streetCase: '#e3ded4',
  motorway: '#f6c35b',
  motorwayCase: '#dd9f2e',
  primary: '#fde59a',
  primaryCase: '#e6c262',
  secondary: '#ffffff',
  secondaryCase: '#d9d4ca',
  minor: '#ffffff',
  minorCase: '#e2ddd3',
  border: '#9a93ad',
  borderHalo: '#ece9f2',
  province: '#76698f',
  river: '#a6cfe5',
  text: '#3c4043',
  textSoft: '#6b6f73',
  halo: 'rgba(255,255,255,0.92)',
  country: '#5f5b6b',
  provinceText: '#8b8695',
  range: '#8a7a64',
  park: '#bfe0b2',
  parkText: '#3d7a3a',
  tpf: '#c0392b',
};

export const FONT = '"Source Sans 3 Variable", "Source Sans 3", system-ui, sans-serif';

// zoom z: 2^z pixels per km
export const pxPerKm = (z) => Math.pow(2, z);
// The country is drawn at half the size the zoom rules for it were made for (towns keep
// theirs), so rules about the country itself are read one zoom further in: z + WZ.
export const WZ = 1;
// Towns, farms and compounds are drawn TS = 3 times the size the town code makes them
// (gen/lib/townscale.mjs), so their detail comes log2(3) zooms sooner: z + TZ.
export const TZ = Math.log2(3);

// road width in px for class c at zoom z
export function roadWidth(c, z) {
  const k = Math.max(0, z);
  switch (c) {
    case 4: return z < -1 ? 1.2 : Math.min(14, 1.6 + k * 1.15 + Math.max(0, k - 3) * 1.4);
    case 3: return z < 0 ? 0.9 : Math.min(11, 1.1 + k * 0.85 + Math.max(0, k - 3) * 1.1);
    case 2: return Math.min(8.5, 0.6 + k * 0.6 + Math.max(0, k - 3) * 0.9);
    case 1: return Math.min(6.5, 0.4 + k * 0.45 + Math.max(0, k - 4) * 0.8);
    default: return Math.min(5, 0.3 + k * 0.35 + Math.max(0, k - 4) * 0.6);
  }
}
export function roadMinZoom(c) {
  return c >= 4 ? -3 : c === 3 ? -1.2 : c === 2 ? 1 : c === 1 ? 2.4 : 3.6;
}
// rivers: catchment (km²) needed to show at zoom z
export function riverMinAcc(z) {
  if (z < -1.5) return 40000;
  if (z < -0.5) return 15000;
  if (z < 0.5) return 6000;
  if (z < 1.5) return 2000;
  if (z < 2.5) return 700;
  return 150;
}
export function riverWidth(acc, z) {
  const base = Math.max(0.6, Math.log10(acc) - 2.2) * 0.9;
  const s = Math.pow(1.45, Math.max(-2, z));
  return Math.min(22, base * s * 0.8);
}
