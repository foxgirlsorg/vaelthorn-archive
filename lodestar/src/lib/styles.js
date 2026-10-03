// Town styles by province (each was once its own realm) and by neighbouring country.
// dens: how far the dense core reaches   wind: how crooked streets are
// branch: how much streets branch         ring: chance of a ring where walls stood
// street: street width                    plot: building and plot size
// lane: share of narrow lanes in the core park: how often parks appear
// rows: density above which houses join into rows   industry: industrial share
// linear: towns that grew along their roads with few side streets
// planned: straight avenues and square corners (a planned ducal town)
export const STYLES = {
  'Aurenhal Capital District': { dens: 1.3, wind: 0.6, branch: 1.0, ring: 0.95, street: 1.25, plot: 1.15, lane: 0.3, park: 1.3, rows: 0.6, industry: 1.0 },
  'Northern Dales': { dens: 0.85, wind: 0.55, branch: 0.55, ring: 0.1, street: 1.0, plot: 1.0, lane: 0.2, park: 0.7, rows: 0.66, industry: 0.6, linear: 0.75 },
  Lumiria: { dens: 0.6, wind: 1.7, branch: 1.3, ring: 0.05, street: 0.95, plot: 1.35, lane: 0.1, park: 2.4, rows: 0.82, industry: 0.3 },
  Westmarch: { dens: 1.15, wind: 0.9, branch: 0.8, ring: 0.75, street: 0.9, plot: 0.9, lane: 0.45, park: 0.6, rows: 0.58, industry: 0.8 },
  Corvenne: { dens: 1.2, wind: 0.4, branch: 0.9, ring: 0.2, street: 1.1, plot: 1.05, lane: 0.25, park: 0.6, rows: 0.6, industry: 1.9 },
  'Lower Halve': { dens: 1.0, wind: 0.6, branch: 0.9, ring: 0.3, street: 1.0, plot: 1.0, lane: 0.3, park: 0.9, rows: 0.64, industry: 1.2 },
  Kestmark: { dens: 1.4, wind: 1.25, branch: 0.7, ring: 0.4, street: 0.8, plot: 0.8, lane: 0.6, park: 0.4, rows: 0.52, industry: 0.5 },
  'Eastern Province': { dens: 0.65, wind: 0.5, branch: 0.7, ring: 0.05, street: 1.05, plot: 1.3, lane: 0.05, park: 0.8, rows: 0.85, industry: 0.7 },
  Ardmere: { dens: 1.0, wind: 0.15, branch: 1.2, ring: 0.5, street: 1.35, plot: 1.15, lane: 0.1, park: 1.7, rows: 0.62, industry: 0.8, planned: true },
  Duncarrow: { dens: 0.95, wind: 0.2, branch: 1.1, ring: 0.1, street: 1.2, plot: 1.1, lane: 0.05, park: 0.7, rows: 0.7, industry: 1.3, planned: true },
  'Southern Reach': { dens: 1.55, wind: 1.6, branch: 1.4, ring: 0.2, street: 0.72, plot: 0.72, lane: 0.85, park: 0.25, rows: 0.45, industry: 0.4 },
  Midmarch: { dens: 0.9, wind: 0.5, branch: 0.8, ring: 0.2, street: 1.0, plot: 1.05, lane: 0.15, park: 0.9, rows: 0.7, industry: 0.9, linear: 0.3 },
  nor: { dens: 0.55, wind: 0.6, branch: 0.7, ring: 0.05, street: 1.0, plot: 1.4, lane: 0.05, park: 1.6, rows: 0.9, industry: 0.6 },
  var: { dens: 1.2, wind: 0.85, branch: 1.0, ring: 0.55, street: 1.0, plot: 0.95, lane: 0.4, park: 0.9, rows: 0.55, industry: 0.9 },
  mir: { dens: 1.0, wind: 0.5, branch: 0.9, ring: 0.3, street: 1.1, plot: 1.05, lane: 0.2, park: 0.8, rows: 0.65, industry: 1.2 },
  alc: { dens: 1.45, wind: 1.4, branch: 1.3, ring: 0.25, street: 0.8, plot: 0.8, lane: 0.7, park: 0.3, rows: 0.48, industry: 0.5 },
  bre: { dens: 1.05, wind: 0.4, branch: 0.9, ring: 0.6, street: 1.1, plot: 1.1, lane: 0.25, park: 1.0, rows: 0.6, industry: 1.0 },
};
export const DEFAULT_STYLE = STYLES.Midmarch;
