# Lodestar Maps

A map service of Esteloria and its neighbours (Svelte + Leaflet, canvas tiles).

## Run

```
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

The 3D button shows the same map draped over the height model (`src/lib/map3d.js`, MapLibre).

## Regenerate the world

The country is generated from `gen/design.mjs` (macro shape, mountain ranges, canon
rivers) and `gen/canon.mjs` (places, provinces, TPF sites and landmarks from the archive).

```
npm run gen          # all five steps below, about 8-10 minutes
npm run gen:towns    # only towns and countryside, after a change in the town code
```

The steps, from `gen/`:

```
node --max-old-space-size=8000 terrain.mjs    # height map, rivers, lakes, coast
node --max-old-space-size=8000 features.mjs   # borders, places, roads, rail, forests -> public/data/
node --max-old-space-size=12000 towns.mjs     # streets, buildings, businesses -> public/data/towns/
node --max-old-space-size=8000 extras.mjs     # farms and TPF compounds -> public/data/towns/
node --max-old-space-size=8000 landuse.mjs    # fields and harbours -> public/data/landuse/
```

Towns, farms and businesses are pre-generated into packs (`public/data/towns/`). The packs
are in git through Git LFS: run `git lfs install` once before you clone or pull, and the
map works without the generator. The town code (`src/lib/town.js`, with the province styles
in `src/lib/styles.js`) runs only in the generator. The app fetches the packs that cover the
visible area, so nothing is generated in the browser.

A host that does not serve `.bin` files can serve the same binary files under another
extension: build with `VITE_BIN_EXT=wasm npm run build` and publish each `*.bin` as `*.wasm`.

Links to a view are `#m<x>_<y>_<zoom>[_<place id>]` (only characters an artifact link passes
on). A host that shows the map inside another page sets its own address for the Share button
with `VITE_SHARE_BASE` at build time.
