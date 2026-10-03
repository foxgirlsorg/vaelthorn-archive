// Towns, farms and TPF compounds are generated on the world shrunk TS times and written TS
// times larger, so their streets, blocks and houses come out TS times the size the town
// code makes them. The shrunk world is the whole world scaled, so roads, rivers, sites and
// built-up areas still meet where they meet on the map.
export const TS = 3;

const pt = ([x, y]) => [x / TS, y / TS];
const box = (b) => b.map((v) => v / TS);
const xy = (o) => ({ ...o, x: o.x / TS, y: o.y / TS });

// world.json as written by features.mjs -> the same world TS times smaller
export function shrinkWorld(w) {
  const geo = (f) => ({ ...f, b: box(f.b) }); // p and lo are integers / q: q * TS shrinks them
  const rings = (f) => ({ ...f, rings: f.rings.map(geo) });
  return {
    ...w,
    q: w.q * TS, w: w.w / TS, h: w.h / TS, block: w.block / TS,
    countries: w.countries.map(xy),
    seas: w.seas.map((s) => ({ ...s, label: pt(s.label) })),
    land: w.land.map(geo), rivers: w.rivers.map(geo), forests: w.forests.map(geo), glaciers: w.glaciers.map(geo),
    roads: w.roads.map(geo), rails: w.rails.map(geo), borders: w.borders.map(geo), provBorders: (w.provBorders || []).map(geo),
    lakes: w.lakes.map((l) => ({ ...xy(geo(l)), area: l.area / (TS * TS) })),
    parks: w.parks.map((p) => xy(rings(p))), provinces: w.provinces.map((p) => xy(rings(p))), urban: w.urban.map(rings),
    ranges: w.ranges.map((r) => ({ ...r, pts: r.pts.map(pt) })),
    peaks: w.peaks.map(xy), places: w.places.map(xy), districts: w.districts.map(xy),
    sites: w.sites.map((s) => ({ ...xy(s), pin: s.pin ? pt(s.pin) : undefined })),
  };
}
