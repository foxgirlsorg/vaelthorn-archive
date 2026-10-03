<script>
  import { onMount, tick } from 'svelte';
  import { loadWorld, applySiteEdits } from './lib/world.js';
  import { MapView } from './lib/mapview.js';
  import { buildItems, search, CATEGORIES } from './lib/search.js';
  import { itemInfo, gridRef } from './lib/info.js';
  import { poisNear, ensurePois, BIN, initPacks, initEdits, checkEdits, edits, autoEdits } from './lib/packs.js';
  import { poiItem } from './lib/poiview.js';
  import { TYPES } from './lib/chains.js';
  import Icon from './components/Icon.svelte';
  import Logo from './components/Logo.svelte';
  import SearchBox from './components/SearchBox.svelte';
  import PlacePanel from './components/PlacePanel.svelte';
  import LayersPanel from './components/LayersPanel.svelte';
  import CategoryList from './components/CategoryList.svelte';
  import { hscroll } from './lib/hscroll.js';
  import { LIST } from './lib/sharedlist.js';

  let mapEl, map3dEl;
  let is3d = $state(false);
  let view = $state(null);
  let world = null;
  let items = [];
  let byId = new Map();
  let height = $state(null);

  let loading = $state(true);
  let query = $state('');
  let selected = $state(null);
  let category = $state(null);
  let catItems = $state([]);
  let layers = $state({ terrain: false, borders: true, list: readStore('ls-list-shown', true) });
  let layersOpen = $state(false);
  let menuOpen = $state(false);
  let toast = $state('');
  let zoom = $state(0);
  let cursor = $state(null);
  let sheet = $state('half'); // mobile: peek | half | full
  let saved = $state(readStore('ls-saved', []));
  let recent = $state(readStore('ls-recent', []));

  let viewTick = $state(0);
  let chipsEl = $state(), chipEdges = $state({ left: false, right: false });
  const scrollChips = (dir) => chipsEl.scrollBy({ left: dir * chipsEl.clientWidth * 0.75, behavior: 'smooth' });
  // the map editor: npm run dev only (it saves through the dev server). Loaded on demand, so a
  // build has none of it; its edits (public/data/edits.json) are in every build all the same
  let editor = null;
  let EditPanel = $state(null);
  let editState = $state(null);
  async function openEditor() {
    if (!import.meta.env.DEV) return;
    menuOpen = false; closePanel(); closeCategory();
    if (is3d) toggle3d(); // (the editor works on the flat map)
    if (!editor) {
      const [{ Editor }, panel] = await Promise.all([import('./lib/editor.js'), import('./components/EditPanel.svelte')]);
      EditPanel = panel.default;
      editor = new Editor(view, (s) => (editState = s));
      // a TPF site moved, changed, added or removed: the list, its pins and search follow
      editor.onSites = () => { applySiteEdits(world, edits(), autoEdits()); items = buildItems(world); byId = new Map(items.map((i) => [i.id, i])); view.addListMarkers(); };
      window.lodestarEditor = editor; // (for the console)
    }
    editor.open();
  }
  function closeEditor() { editor.close(); editState = null; }
  let poisLoaded = false;
  const results = $derived(query.trim() ? searchAll(query, viewTick) : []);
  function searchAll(q, _tick) {
    const base = search(items, q, 8);
    if (!view || q.trim().length < 2) return base;
    const c = view.center();
    // businesses in memory now; nearby packs load in the background and refresh the list
    ensurePois(c.x - 35, c.y - 35, c.x + 35, c.y + 35).then(() => { if (!poisLoaded) { poisLoaded = true; viewTick++; } });
    const local = search(poisNear(c.x, c.y, 35).map(poiItem), q, 8).map((it) => ({ ...it, rank: it.rank + 4 }));
    // nearby businesses first when they match well, then places
    return [...local.slice(0, 5), ...base].slice(0, 9);
  }
  const recentItems = $derived(recent.map((id) => byId.get(id)).filter(Boolean).slice(0, 6));
  const panelOpen = $derived(!!selected || !!category);
  const info = $derived(selected && world ? itemInfo(selected, world, height) : null);
  const nearby = $derived(selected ? nearbyOf(selected) : []);
  const scale = $derived(scaleBar(zoom));

  function readStore(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
  function writeStore(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  onMount(async () => {
    const fonts = ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 12px "Source Sans 3 Variable"`));
    fonts.push(document.fonts.load('italic 500 12px "Source Sans 3 Variable"'));
    [world] = await Promise.all([loadWorld(), Promise.all(fonts).catch(() => {}), initPacks(), initEdits()]);
    checkEdits(world.roads.length);
    applySiteEdits(world, edits(), autoEdits()); // (TPF pins put on buildings, and the editor's sites)
    items = buildItems(world);
    byId = new Map(items.map((i) => [i.id, i]));
    view = new MapView(mapEl, world, {
      onSelect: (t) => select(resolve(t), { fly: false }),
      onMove: ({ x, y, z }) => { zoom = z; poisLoaded = false; viewTick++; writeHash(x, y, z); },
      onMapClick: (p) => clickPoint(p),
    });
    if (!layers.list) view.setLayer('list', false);
    if (import.meta.env.DEV) window.lodestarView = view; // (for the console)
    const want3d = location.hash === '#3d'; // (the old link to the 3D page)
    if (!readHash()) view.fitEsteloria();
    addEventListener('hashchange', () => { if (location.hash !== hashFor(view.center().x, view.center().y, view.zoom)) readHash(); });
    zoom = view.zoom;
    loading = false;
    mapEl.addEventListener('mousemove', (e) => {
      const ll = view.map.mouseEventToLatLng(e);
      cursor = { x: ll.lng, y: -ll.lat };
    });
    map3dEl.addEventListener('mousemove', (e) => { if (view.d3) cursor = view.d3.toKm(e); });
    // height data: terrain shading and elevations in the panel
    const [meta, buf] = await Promise.all([fetch('./data/height.json').then((r) => r.json()), fetch(`./data/height.${BIN}`).then((r) => r.arrayBuffer())]);
    height = { ...meta, data: new Int16Array(buf) };
    view.setHeight(height);
    if (want3d) toggle3d();
  });

  // ---------------------------------------------------------------- selection
  function resolve(t) {
    if (t.id && byId.has(t.id)) return byId.get(t.id);
    switch (t.type) {
      case 'place': return byId.get('place:' + t.place.id);
      case 'site': return byId.get('site:' + (t.site?.id || t.site?.name || t.data?.id));
      case 'peak': return byId.get('peak:' + t.peak.name);
      case 'lake': return byId.get('lake:' + t.lake.name);
      case 'park': return byId.get('park:' + t.park.name);
      case 'province': return byId.get('prov:' + t.name);
      case 'range': return byId.get('range:' + t.name);
      case 'street': return byId.get('street:' + t.name);
      case 'country': return byId.get('country:' + t.id);
      case 'river': return { ...byId.get('river:' + t.river.name), x: t.x, y: t.y };
      case 'road': {
        const r = t.road;
        return { id: `road:${r.c}:${r.ref}`, type: 'road', cat: 'road', name: r.c === 4 ? `Motorway X${r.ref}` : `Route ${r.ref}`, sub: r.c === 4 ? 'Motorway · Esteloria' : 'National route · Esteloria', x: t.x, y: t.y, zoom: 4, data: r };
      }
      case 'poi': return poiItem(t.poi);
      case 'water': return { id: 'water:' + t.name, type: 'water', cat: 'water', name: t.name, sub: 'Sea', x: 0, y: 0, zoom: 0, data: {} };
    }
    return t;
  }
  function select(it, { fly = true } = {}) {
    if (!it) return;
    selected = it;
    query = '';
    menuOpen = false;
    sheet = 'half';
    if (it.type !== 'water') view.showPin(it.x, it.y);
    if (fly) {
      view.setView(it.x, it.y, Math.max(view.zoom, it.zoom ?? 4), true);
    }
    if (!it.id.startsWith('point:') && !it.id.startsWith('poi:')) {
      recent = [it.id, ...recent.filter((r) => r !== it.id)].slice(0, 12);
      writeStore('ls-recent', recent);
    }
    const c = view.center();
    writeHash(c.x, c.y, view.zoom);
  }
  function clickPoint(p) {
    if (!world.isLoaded(p.x, p.y)) return;
    let near = null, bd = Infinity;
    for (const q of world.places) {
      if (q.k === 'hamlet') continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) { bd = d; near = q; }
    }
    select({ id: 'point:' + p.x.toFixed(3) + ',' + p.y.toFixed(3), type: 'point', cat: 'point', name: gridRef(p.x, p.y), sub: near ? `${bd.toFixed(1)} km from ${near.n}` : 'Dropped pin', near: near ? `${near.n} (${bd.toFixed(1)} km)` : '', x: p.x, y: p.y, zoom: view.zoom, previewZoom: Math.max(3, view.zoom), data: {} }, { fly: false });
  }
  function closePanel() {
    selected = null;
    view.clearPin();
    if (!category) view.clearDots();
    const c = view.center();
    writeHash(c.x, c.y, view.zoom);
  }
  function nearbyOf(it) {
    if (!items.length) return [];
    const out = [];
    for (const o of items) {
      if (o.id === it.id || !['place', 'site', 'peak', 'lake'].includes(o.type)) continue;
      if (o.type === 'place' && (o.data.k === 'hamlet' || o.data.k === 'village' && o.data.pop < 600)) continue;
      const d = Math.hypot(o.x - it.x, o.y - it.y);
      if (d < 45) out.push({ item: o, d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 6);
  }

  // ---------------------------------------------------------------- categories
  async function openCategory(c) {
    if (category?.id === c.id) { closeCategory(); return; }
    category = c;
    selected = null;
    view.clearPin();
    sheet = 'half';
    const ctr = view.center();
    if (c.poi) {
      // the nearest businesses of this kind, widening the search until there are enough
      let found = [];
      for (const r of [3, 10, 30, 80]) {
        await ensurePois(ctr.x - r, ctr.y - r, ctr.x + r, ctr.y + r);
        found = poisNear(ctr.x, ctr.y, r, (q) => TYPES[q.type].cat === c.id);
        if (found.length >= 25) break;
      }
      if (category?.id !== c.id) return;
      catItems = found.sort((a, b) => Math.hypot(a.x - ctr.x, a.y - ctr.y) - Math.hypot(b.x - ctr.x, b.y - ctr.y)).slice(0, 60).map(poiItem);
      view.showDots(catItems);
      return;
    }
    if (c.list) {
      // the shared list, in the order its owner added the places
      catItems = items.filter((i) => i.cat === 'list');
      if (!layers.list) view.showDots(catItems); else view.clearDots();
      return;
    }
    let list = items.filter((i) => i.cat === c.id && world.isLoaded(i.x, i.y));
    if (c.id === 'town') list = list.filter((i) => i.data.c === 'est');
    list.sort((a, b) => b.rank - a.rank || Math.hypot(a.x - ctr.x, a.y - ctr.y) - Math.hypot(b.x - ctr.x, b.y - ctr.y));
    catItems = list.slice(0, c.id === 'town' ? 120 : 200);
    view.showDots(catItems);
  }
  const LIST_CAT = { id: 'list', list: true, label: LIST.title };
  function openList() { menuOpen = false; selected = null; view.clearPin(); category = null; openCategory(LIST_CAT); }
  function showList(on) {
    toggleLayer('list', on);
    writeStore('ls-list-shown', on);
    if (category?.list) { if (on) view.clearDots(); else view.showDots(catItems); }
  }
  function closeCategory() { category = null; catItems = []; view.clearDots(); }

  // ---------------------------------------------------------------- actions
  function toggleSave() {
    if (!selected) return;
    saved = saved.includes(selected.id) ? saved.filter((s) => s !== selected.id) : [selected.id, ...saved];
    writeStore('ls-saved', saved);
    flash(saved.includes(selected.id) ? 'Saved to your places' : 'Removed from your places');
  }
  // the link to this view; a host that serves the map inside another page (an artifact)
  // gives its own address at build time (VITE_SHARE_BASE)
  function shareUrl() {
    const c = view.center();
    return (import.meta.env.VITE_SHARE_BASE || location.href.split('#')[0]) + hashFor(selected && selected.type !== 'water' ? selected.x : c.x, selected && selected.type !== 'water' ? selected.y : c.y, view.zoom);
  }
  async function share() {
    const url = shareUrl();
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: selected?.name, url });
      else { await navigator.clipboard.writeText(url); flash('Link copied'); }
    } catch {}
  }
  async function copyRef() {
    try { await navigator.clipboard.writeText(gridRef(selected.x, selected.y)); flash('Grid reference copied'); } catch {}
  }
  function flash(t) { toast = t; clearTimeout(flash.h); flash.h = setTimeout(() => (toast = ''), 2200); }
  function toggleLayer(name, on) {
    layers[name] = on;
    view.setLayer(name, on);
  }
  // the map in 3D, from where the flat map is (and back to the flat map where the 3D one is)
  let opening3d = false;
  async function toggle3d() {
    if (is3d) { is3d = false; view.close3d(); return; }
    if (!height || opening3d) return;
    if (editState) closeEditor();
    opening3d = true;
    is3d = true;
    await tick(); // (shown before it is measured)
    try { await view.open3d(map3dEl); } catch (e) { console.error(e); is3d = false; flash('3D is not available here'); }
    opening3d = false;
  }
  function showNearby() { document.getElementById('nearby')?.scrollIntoView({ behavior: 'smooth' }); }

  // ---------------------------------------------------------------- hash
  // #m<x>_<y>_<z>[_<id>]: only letters, digits, '.', '-', '_' and '~', the characters a
  // shared artifact link passes on. In the id, '~' plus two hex digits stands for any other
  // character (so '_' never appears in it). A dropped pin is the id 'point:<x>,<y>'.
  const encId = (id) => id.replace(/[^A-Za-z0-9.-]/g, (c) => '~' + c.charCodeAt(0).toString(16).padStart(2, '0'));
  const decId = (s) => s.replace(/~([0-9a-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  function hashFor(x, y, z) {
    const sel = selected && selected.type !== 'water' ? '_' + encId(selected.id) : '';
    return `#m${x.toFixed(3)}_${y.toFixed(3)}_${z}${sel}`;
  }
  function writeHash(x, y, z) { history.replaceState(null, '', hashFor(x, y, z)); }
  function readHash() {
    let m = /^#m(-?[\d.]+)_(-?[\d.]+)_(-?\d+)(?:_([A-Za-z0-9.~-]+))?$/.exec(location.hash);
    // the older form, #@x,y,zz/id
    if (!m) { const o = /^#@(-?[\d.]+),(-?[\d.]+),(-?\d+)z(?:\/(.+))?$/.exec(location.hash); if (o) m = [o[0], o[1], o[2], o[3], o[4] && encId(decodeURIComponent(o[4]))]; }
    if (!m) return false;
    view.setView(+m[1], +m[2], +m[3]);
    if (m[4]) selectId(decId(m[4]), +m[1], +m[2]);
    return true;
  }
  async function selectId(id, x, y) {
    const pt = /^point:(-?[\d.]+),(-?[\d.]+)$/.exec(id);
    if (pt) { clickPoint({ x: +pt[1], y: +pt[2] }); return; }
    let it = byId.get(id);
    if (!it && id.startsWith('poi:')) {
      // a business: load the packs round the spot and find it there
      await ensurePois(x - 5, y - 5, x + 5, y + 5);
      const q = poisNear(x, y, 5).find((p) => 'poi:' + p.id === id);
      if (q) it = poiItem(q);
    }
    if (it) select(it, { fly: false });
  }

  // ---------------------------------------------------------------- scale bar
  function scaleBar(z) {
    const kmPerPx = 1 / Math.pow(2, z);
    const target = kmPerPx * 90;
    const steps = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const km = steps.reduce((a, s) => (s <= target ? s : a), steps[0]);
    return { px: km / kmPerPx, label: km < 1 ? `${km * 1000} m` : `${km} km` };
  }

  // ---------------------------------------------------------------- mobile sheet drag
  let drag = null;
  function sheetDown(e) { drag = { y: e.clientY, s: sheet }; e.currentTarget.setPointerCapture(e.pointerId); }
  function sheetUp(e) {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    const order = ['peek', 'half', 'full'];
    let i = order.indexOf(drag.s);
    if (dy < -40) i = Math.min(2, i + 1);
    else if (dy > 40) i = i - 1;
    else if (Math.abs(dy) < 6) i = drag.s === 'peek' ? 1 : i;
    drag = null;
    if (i < 0) { selected ? closePanel() : closeCategory(); return; }
    sheet = order[i];
  }
</script>

<div class="app" class:panel={panelOpen}>
  <div class="map" bind:this={mapEl} aria-label="Map of Esteloria"></div>
  <div class="map3d" class:on={is3d} bind:this={map3dEl} aria-label="Map of Esteloria in 3D"></div>

  {#if loading}
    <div class="loading"><Logo size={56} /><span>Lodestar Maps</span><i></i></div>
  {/if}

  <div class="top">
    <div class="searchwrap">
      <SearchBox bind:query results={results} recent={recentItems} selectedName={selected?.name || category?.label || ''}
        onPick={(it) => { closeCategory(); select(it); }}
        onClear={() => { closePanel(); closeCategory(); }}
        onMenu={() => (menuOpen = !menuOpen)} />
    </div>
    <div class="chipwrap">
      <div class="chips" role="toolbar" aria-label="Categories" bind:this={chipsEl} use:hscroll={(e) => (chipEdges = e)}>
        {#each CATEGORIES as c (c.id)}
          <button class="chip" class:on={category?.id === c.id} onclick={() => openCategory(c)}>
            <Icon name={c.icon} size={16} color={category?.id === c.id ? '#fff' : '#5f6368'} />{c.label}
          </button>
        {/each}
      </div>
      <!-- arrows at the ends while there is more to see that way (as on Google Maps) -->
      {#if chipEdges.left}<button class="chiparrow l" onclick={() => scrollChips(-1)} aria-label="Scroll the categories left"><Icon name="chevronLeft" size={20} color="#3c4043" /></button>{/if}
      {#if chipEdges.right}<button class="chiparrow r" onclick={() => scrollChips(1)} aria-label="Scroll the categories right"><Icon name="chevronRight" size={20} color="#3c4043" /></button>{/if}
    </div>
  </div>

  {#if menuOpen}
    <div class="scrim" onclick={() => (menuOpen = false)} role="presentation"></div>
    <nav class="menu">
      <div class="mh"><Logo size={30} /><span><b>Lodestar</b> Maps</span></div>
      <button onclick={() => { menuOpen = false; view.fitEsteloria(); }}><Icon name="map" size={20} color="#5f6368" />Show all of Esteloria</button>
      <button onclick={() => { menuOpen = false; layersOpen = true; }}><Icon name="layers" size={20} color="#5f6368" />Map type and details</button>
      {#if import.meta.env.DEV}<button onclick={openEditor}><Icon name="street" size={20} color="#5f6368" />Edit map</button>{/if}
      <div class="msec">Your places</div>
      {#if saved.length === 0}<p class="mempty">Places you save appear here.</p>{/if}
      {#each saved.map((id) => byId.get(id)).filter(Boolean) as it (it.id)}
        <button onclick={() => select(it)}><Icon name="saved" size={20} color="#1f4fd1" />{it.name}</button>
      {/each}
      <div class="msec">Shared with you</div>
      <button class="mlist" onclick={openList}><span class="lico"><Icon name="flag" size={16} color="#fff" /></span><span class="mt"><span>{LIST.title}</span><span class="ms">{LIST.owner} · {items.filter((i) => i.cat === 'list').length} places</span></span></button>
      <div class="mfoot">Lodestar Maps · Map data ©2026 Lodestar, Esteloria Survey Office</div>
    </nav>
  {/if}

  {#if panelOpen}
    <aside class="side sheet-{sheet}" aria-label={selected ? selected.name : category?.label}>
      <div class="grab" onpointerdown={sheetDown} onpointerup={sheetUp} role="presentation"><span></span></div>
      <button class="close" onclick={() => (selected ? closePanel() : closeCategory())} aria-label="Close"><Icon name="close" size={20} color="#5f6368" /></button>
      <div class="scroll">
        {#if selected && info}
          {#if category}<button class="backlink" onclick={closePanel}><Icon name="back" size={18} color="#1f4fd1" />{category.label}</button>{/if}
          <PlacePanel item={selected} {info} {nearby} {view} saved={saved.includes(selected.id)}
            onSave={toggleSave} onShare={share} onCopy={copyRef} onPick={(it) => select(it)} onNearby={showNearby} onList={openList} />
        {:else if category}
          <CategoryList cat={category} items={catItems} onPick={(it) => select(it)} onClose={closeCategory} shown={layers.list} onShow={showList} />
        {/if}
      </div>
    </aside>
  {/if}

  <div class="controls">
    <button onclick={() => view.zoomBy(1)} aria-label="Zoom in"><Icon name="plus" size={22} color="#5f6368" /></button>
    <span class="sep"></span>
    <button onclick={() => view.zoomBy(-1)} aria-label="Zoom out"><Icon name="minus" size={22} color="#5f6368" /></button>
  </div>

  <button class="btn3d" class:on={is3d} onclick={toggle3d} disabled={!height} aria-label={is3d ? 'Flat map' : '3D map'} title={is3d ? 'Back to the flat map' : '3D map (right-drag or Ctrl-drag to turn and tilt)'}>{is3d ? '2D' : '3D'}</button>

  <button class="layersbtn" onclick={() => (layersOpen = !layersOpen)} aria-label="Layers">
    <Icon name="layers" size={22} color="#fff" /><span>Layers</span>
  </button>
  {#if layersOpen}
    <div class="layerspop"><LayersPanel {layers} {view} onToggle={(name, on) => (name === 'list' ? showList(on) : toggleLayer(name, on))} onClose={() => (layersOpen = false)} /></div>
  {/if}

  <footer class="status">
    {#if cursor}<span class="coord">{gridRef(cursor.x, cursor.y)}</span>{/if}
    <span>Map data ©2026 Lodestar, Esteloria Survey Office</span>
    <span class="scale"><i style="width:{scale.px}px"></i>{scale.label}</span>
  </footer>

  {#if !loading && layers.list && !panelOpen}
    <div class="listpill">
      <button class="lpopen" onclick={openList}><span class="lico"><Icon name="flag" size={14} color="#fff" /></span>{LIST.title}<span class="lo">· shared by {LIST.owner}</span></button>
      <button class="lphide" onclick={() => showList(false)} aria-label="Hide the {LIST.title} on the map" title="Hide from the map (Layers shows them again)"><Icon name="close" size={16} color="#5f6368" /></button>
    </div>
  {/if}

  {#if editState && EditPanel}
    <div class="editpop"><EditPanel state={editState} {editor} onClose={closeEditor} /></div>
  {/if}

  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
  .app { position: fixed; inset: 0; overflow: hidden; }
  .map { position: absolute; inset: 0; background: #e5e3de; }
  .loading { position: absolute; inset: 0; z-index: 2000; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font: 500 20px var(--font); color: #3c4043; }
  .loading i { width: 140px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #1f4fd1 40%, #e8eaed 40%) 0 0 / 300% 100%; animation: load 1.1s linear infinite; }
  @keyframes load { to { background-position: -100% 0; } }

  .top { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 1000; display: flex; gap: 10px; align-items: flex-start; pointer-events: none; }
  .searchwrap { width: 392px; flex: none; pointer-events: auto; }
  .chipwrap { position: relative; flex: 1; min-width: 0; }
  .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 6px 2px 8px; pointer-events: auto; mask-image: linear-gradient(90deg, #000 92%, transparent); }
  .chiparrow { position: absolute; top: 6px; width: 34px; height: 34px; border-radius: 50%; border: 0; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); display: grid; place-items: center; cursor: pointer; pointer-events: auto; z-index: 1; }
  .chiparrow:hover { background: #f1f3f4; }
  .chiparrow.l { left: 0; }
  .chiparrow.r { right: 4px; }
  .chips::-webkit-scrollbar { display: none; }
  .chip { flex: none; display: flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px 0 11px; border-radius: 17px; border: 0; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.24); font: 500 14px var(--font); color: #3c4043; cursor: pointer; white-space: nowrap; }
  .chip:hover { background: #f8f9fa; }
  .chip.on { background: #1f4fd1; color: #fff; }
  .listpill { position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%); z-index: 800; display: flex; align-items: center; height: 36px; border-radius: 18px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); white-space: nowrap; }
  .lpopen { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px 0 6px; border: 0; border-radius: 18px 0 0 18px; background: none; font: 600 13.5px var(--font); color: #4a148c; cursor: pointer; }
  .lpopen:hover, .lphide:hover { background: #faf5fc; }
  .lphide { display: grid; place-items: center; width: 32px; height: 36px; margin-left: 2px; padding-right: 4px; border: 0; border-left: 1px solid #ece6ef; border-radius: 0 18px 18px 0; background: none; cursor: pointer; }
  .lico { width: 26px; height: 26px; border-radius: 50%; background: #7b1fa2; display: grid; place-items: center; flex: none; }
  .lo { font-weight: 400; color: #70757a; }
  .menu .mlist { gap: 14px; }
  .mt { display: flex; flex-direction: column; }
  .ms { font: 400 12.5px var(--font); color: #80868b; }

  .side { position: absolute; z-index: 900; background: #fff; display: flex; flex-direction: column; }
  .scroll { overflow-y: auto; flex: 1; overscroll-behavior: contain; }
  .close { position: absolute; z-index: 2; width: 36px; height: 36px; border: 0; border-radius: 50%; background: rgba(255,255,255,.92); box-shadow: 0 1px 3px rgba(0,0,0,.2); display: grid; place-items: center; cursor: pointer; }
  .close:hover { background: #fff; }
  .backlink { display: flex; align-items: center; gap: 8px; border: 0; background: #fff; padding: 12px 20px; font: 500 14px var(--font); color: #1f4fd1; cursor: pointer; width: 100%; border-bottom: 1px solid #e8eaed; }
  .grab { display: none; }

  .controls { position: absolute; right: 12px; bottom: 34px; z-index: 800; background: #fff; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,.3); display: flex; flex-direction: column; overflow: hidden; }
  .controls button { width: 40px; height: 40px; border: 0; background: #fff; cursor: pointer; display: grid; place-items: center; }
  .controls button:hover { background: #f1f3f4; }
  .sep { height: 1px; background: #e8eaed; margin: 0 8px; }
  .btn3d { position: absolute; right: 12px; bottom: 132px; z-index: 800; width: 40px; height: 40px; border: 0; border-radius: 8px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.3); font: 700 14px var(--font); color: #3c4043; cursor: pointer; }
  .btn3d:hover { background: #f1f3f4; color: #1f4fd1; }
  .btn3d.on { color: #1f4fd1; }
  .btn3d:disabled { color: #bdc1c6; cursor: default; }
  .map3d { position: absolute; inset: 0; z-index: 750; background: #e5e3de; display: none; }
  .map3d.on { display: block; }
  .layersbtn { position: absolute; left: 12px; bottom: 34px; z-index: 800; width: 76px; height: 76px; border-radius: 10px; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); background: linear-gradient(150deg, #8fb98a, #5d8d63 55%, #43734f); display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; padding-bottom: 6px; cursor: pointer; font: 600 12px var(--font); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5); transition: left .2s; }
  .layerspop { position: absolute; left: 98px; bottom: 34px; z-index: 1100; transition: left .2s; }
  .editpop { position: absolute; right: 12px; top: 64px; z-index: 1200; }

  .status { position: absolute; right: 0; bottom: 0; z-index: 800; display: flex; align-items: center; gap: 14px; height: 22px; padding: 0 10px; background: rgba(255,255,255,.82); font: 400 11px var(--font); color: #5f6368; border-top-left-radius: 6px; }
  .coord { font-variant-numeric: tabular-nums; }
  .scale { display: flex; align-items: center; gap: 6px; }
  .scale i { display: block; height: 6px; border: 1.5px solid #5f6368; border-top: 0; }

  .toast { position: absolute; left: 50%; bottom: 48px; transform: translateX(-50%); z-index: 3000; background: #323232; color: #fff; font: 400 14px var(--font); padding: 12px 20px; border-radius: 6px; box-shadow: 0 3px 10px rgba(0,0,0,.3); }

  .scrim { position: absolute; inset: 0; background: rgba(0,0,0,.35); z-index: 1500; }
  .menu { position: absolute; top: 0; left: 0; bottom: 0; width: 320px; max-width: 86vw; background: #fff; z-index: 1600; box-shadow: 0 0 20px rgba(0,0,0,.3); display: flex; flex-direction: column; overflow-y: auto; }
  .mh { display: flex; align-items: center; gap: 12px; padding: 18px 20px; font: 400 21px var(--font); color: #3c4043; border-bottom: 1px solid #e8eaed; }
  .mh b { font-weight: 650; color: #1f4fd1; }
  .menu button { display: flex; align-items: center; gap: 18px; border: 0; background: none; padding: 12px 22px; font: 400 15px var(--font); color: #3c4043; cursor: pointer; text-align: left; }
  .menu button:hover { background: #f1f3f4; }
  .msec { padding: 18px 22px 6px; font: 500 12px var(--font); text-transform: uppercase; letter-spacing: .06em; color: #70757a; border-top: 1px solid #e8eaed; margin-top: 8px; }
  .mempty { margin: 4px 22px; font: 400 13.5px var(--font); color: #80868b; }
  .mfoot { margin-top: auto; padding: 16px 22px; font: 400 11.5px var(--font); color: #80868b; }

  /* desktop: side panel on the left, search inside it */
  @media (min-width: 761px) {
    .side { top: 0; left: 0; bottom: 0; width: 408px; box-shadow: 0 0 20px rgba(0,0,0,.25); padding-top: 72px; }
    .close { top: 84px; right: 12px; }
    .app.panel .chips { margin-left: 0; }
    .app.panel .top { left: 8px; }
    .app.panel .searchwrap { width: 392px; }
    .app.panel .layersbtn { left: 420px; }
    .app.panel .layerspop { left: 506px; }
  }
  /* phone: search on top, bottom sheet */
  @media (max-width: 760px) {
    .top { flex-direction: column; gap: 4px; left: 10px; right: 10px; top: max(10px, env(safe-area-inset-top)); }
    .searchwrap { width: 100%; }
    .chipwrap { width: 100%; flex: none; }
    .chips { width: calc(100% + 20px); margin: 0 -10px; padding: 6px 10px 8px; mask-image: none; }
    .chiparrow.l { left: -4px; }
    .chiparrow.r { right: -4px; }
    .controls { display: none; }
    .layersbtn { left: auto; right: 10px; top: calc(max(10px, env(safe-area-inset-top)) + 104px); bottom: auto; width: 44px; height: 44px; border-radius: 50%; border: 0; background: #fff; padding: 0; justify-content: center; }
    .layersbtn :global(svg) { fill: #5f6368; }
    .layersbtn span { display: none; }
    .layerspop { left: auto; right: 10px; top: calc(max(10px, env(safe-area-inset-top)) + 154px); bottom: auto; }
    .btn3d { right: 10px; bottom: auto; top: calc(max(10px, env(safe-area-inset-top)) + 156px); width: 44px; height: 44px; border-radius: 50%; }
    .app.panel .btn3d { display: none; }
    .side { left: 0; right: 0; bottom: 0; border-radius: 16px 16px 0 0; box-shadow: 0 -2px 14px rgba(0,0,0,.22); transition: height .25s ease; max-height: calc(100% - 64px); }
    .sheet-peek { height: 150px; }
    .sheet-half { height: 52%; }
    .sheet-full { height: calc(100% - 64px); }
    .grab { display: flex; justify-content: center; padding: 8px 0 10px; touch-action: none; cursor: grab; }
    .grab span { width: 36px; height: 4px; border-radius: 2px; background: #dadce0; }
    .close { top: 10px; right: 10px; }
    .status { left: auto; font-size: 10px; height: 20px; }
    .status .coord { display: none; }
    .app.panel .status { display: none; }
    .toast { bottom: auto; top: 120px; }
    .listpill { bottom: 28px; }
    .lo { display: none; }
  }
</style>
