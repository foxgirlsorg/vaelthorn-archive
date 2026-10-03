<script>
  import Icon from './Icon.svelte';
  import { ROAD_CLASSES } from '../lib/editor.js';
  import { CHAINS, TYPES } from '../lib/chains.js';
  let { state, editor, onClose } = $props();
  const chains = [...CHAINS].sort((a, b) => a.name.localeCompare(b.name));
  const types = Object.entries(TYPES).sort((a, b) => a[1].label.localeCompare(b[1].label));
  const SITE_TYPES = ['Headquarters', 'Records', 'Signals', 'Laboratory (Project SCION)', 'Transit depot', 'Barracks', 'Detention', 'Garrison', 'Field station', 'Training', 'Historic site'];
  const setPoi = (k, v) => { editor.newPoi[k] = v; editor.emit(); };
  const setSite = (k, v) => { editor.newSite[k] = v; editor.emit(); };
</script>

<div class="ep" role="dialog" aria-label="Map editor">
  <div class="top"><h2>Map editor</h2><button class="x" onclick={onClose} aria-label="Close the editor"><Icon name="close" size={20} color="#5f6368" /></button></div>
  {#if state.stale}<p class="warn">edits.json was made on other map data, so it is not applied and nothing will be saved.</p>{/if}

  {#if state.mode === 'poi'}
    <div class="sel mode"><span class="k">Add business</span><span class="n">{state.hint}</span></div>
    <label class="f">Chain
      <select value={state.newPoi.chain} onchange={(e) => setPoi('chain', e.currentTarget.value)}>
        <option value="">Custom (not a chain)</option>
        {#each chains as c}<option value={c.id}>{c.name} · {TYPES[c.type]?.label || c.type}</option>{/each}
      </select>
    </label>
    {#if !state.newPoi.chain}
      <label class="f">Name <input value={state.newPoi.name} oninput={(e) => setPoi('name', e.currentTarget.value)} placeholder="e.g. The Crown" /></label>
      <label class="f">Kind
        <select value={state.newPoi.type} onchange={(e) => setPoi('type', e.currentTarget.value)}>
          {#each types as [id, t]}<option value={id}>{t.label}</option>{/each}
        </select>
      </label>
    {/if}
    <div class="row"><button onclick={() => editor.setMode('select')}>Cancel</button></div>
  {:else if state.mode === 'site'}
    <div class="sel mode"><span class="k">Add TPF site</span><span class="n">{state.hint}</span></div>
    <label class="f">Name <input value={state.newSite.name} oninput={(e) => setSite('name', e.currentTarget.value)} placeholder="e.g. Harwood Holding Block" /></label>
    <label class="f">Kind
      <select value={state.newSite.type} onchange={(e) => setSite('type', e.currentTarget.value)}>
        {#each SITE_TYPES as t}<option value={t}>{t}</option>{/each}
      </select>
    </label>
    <label class="f">Years <input value={state.newSite.years} oninput={(e) => setSite('years', e.currentTarget.value)} placeholder="e.g. 1958–2024" /></label>
    <label class="f">Status <input value={state.newSite.status} oninput={(e) => setSite('status', e.currentTarget.value)} placeholder="e.g. Dissolved" /></label>
    <label class="f">Description <textarea rows="3" value={state.newSite.desc} oninput={(e) => setSite('desc', e.currentTarget.value)}></textarea></label>
    <div class="row"><button onclick={() => editor.setMode('select')}>Cancel</button></div>
  {:else if state.mode !== 'select'}
    <div class="sel mode">
      <span class="k">{state.mode === 'reroute' ? 'Re-route' : 'New road'}</span>
      <span class="n">{state.hint}</span>
    </div>
    <div class="row">
      {#if state.mode === 'draw'}<button onclick={() => editor.finishDraw()}>Finish road</button>{/if}
      <button onclick={() => editor.setMode('select')}>Cancel</button>
    </div>
  {:else if state.sel}
    <div class="sel">
      <span class="k">{state.sel.kind}{state.sel.edited ? ' · edited' : ''}</span>
      <span class="n">{state.sel.name}</span>
      <span class="d">{state.sel.detail}</span>
    </div>
    {#if state.sel.type === 'road'}
      <label class="row cls">Class
        <select value={state.sel.c} onchange={(e) => editor.setClass(+e.currentTarget.value)}>
          {#each ROAD_CLASSES as [c, name]}<option value={c}>{name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if state.sel.type === 'poi'}
      <label class="f">Name <input value={state.sel.fields.name} onchange={(e) => editor.setFields({ name: e.currentTarget.value })} /></label>
      <p class="hint">Drag the round handle onto a building to move it there.</p>
    {/if}
    {#if state.sel.type === 'site'}
      <label class="f">Name <input value={state.sel.fields.name} onchange={(e) => editor.setFields({ name: e.currentTarget.value })} /></label>
      <label class="f">Kind
        <select value={state.sel.fields.type} onchange={(e) => editor.setFields({ type: e.currentTarget.value })}>
          {#each SITE_TYPES as t}<option value={t}>{t}</option>{/each}
        </select>
      </label>
      <label class="f">Years <input value={state.sel.fields.years} onchange={(e) => editor.setFields({ years: e.currentTarget.value })} /></label>
      <label class="f">Status <input value={state.sel.fields.status} onchange={(e) => editor.setFields({ status: e.currentTarget.value })} /></label>
      <label class="f">Description <textarea rows="3" value={state.sel.fields.desc} onchange={(e) => editor.setFields({ desc: e.currentTarget.value })}></textarea></label>
      <p class="hint">Drag the round handle onto a building to move the pin there.</p>
    {/if}
    <div class="row">
      {#if state.sel.type === 'road' || state.sel.type === 'street'}<button onclick={() => editor.setMode('reroute')}>Re-route</button>{/if}
      <button class="danger" onclick={() => editor.remove()}>Remove</button>
      {#if state.sel.edited}<button onclick={() => editor.reset()}>Back to generated</button>{/if}
    </div>
  {:else}
    <p class="hint">Click a building, a street, a road, a business or a TPF pin.</p>
  {/if}

  {#if state.mode === 'select'}
    <div class="row draw">
      <span class="lbl">New road:</span>
      <select value={state.newClass} onchange={(e) => { editor.newClass = +e.currentTarget.value; }} aria-label="Class of the new road">
        {#each ROAD_CLASSES as [c, name]}<option value={c}>{name}</option>{/each}
      </select>
      <button onclick={() => editor.setMode('draw')}>Draw</button>
    </div>
    <div class="row">
      <button onclick={() => editor.setMode('poi')}>Add business</button>
      <button onclick={() => editor.setMode('site')}>Add TPF site</button>
    </div>
  {/if}

  <ul class="help">
    <li><b>Building:</b> drag the middle to move it, the round handle to turn it, the corner to resize it.</li>
    <li><b>Street or road:</b> drag a point to move it (roads meeting there move with it), a midpoint to add one; right-click a point to drop it.</li>
    <li><b>Re-route:</b> click where the new way leaves the road, the way, and where it joins it again.</li>
    <li><b>Delete</b> removes, <b>Ctrl+Z</b> undoes, <b>Esc</b> stops or lets go.</li>
  </ul>
  <div class="foot">
    <button onclick={() => editor.undoLast()} disabled={!state.canUndo}>Undo</button>
    <span class="st" class:bad={state.status.startsWith('not')}>{state.status === 'saved' ? 'All changes saved to edits.json' : state.status === 'saving' ? 'Saving…' : state.status}</span>
  </div>
  <p class="cnt">{state.counts.changed} edited · {state.counts.added} added · {state.counts.removed} removed by you · {state.counts.auto} overlapping buildings removed and {state.counts.autoPins} pins put on buildings automatically</p>
</div>

<style>
  .ep { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.22); padding: 12px 16px 14px; width: 330px; max-height: calc(100vh - 120px); overflow-y: auto; font: 400 13.5px var(--font); color: #3c4043; }
  .top { display: flex; justify-content: space-between; align-items: center; }
  h2 { font: 500 15px var(--font); color: #202124; margin: 4px 0 8px; }
  .x { border: 0; background: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
  .x:hover { background: #f1f3f4; }
  .warn { margin: 0 0 8px; padding: 8px 10px; border-radius: 8px; background: #fce8e6; color: #a52714; font-size: 12.5px; }
  .sel { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: #f1f4fd; border-radius: 8px; }
  .sel.mode { background: #fef3e7; }
  .sel.mode .k { color: #b35c00; }
  .k { font: 600 12px var(--font); color: #1f4fd1; text-transform: uppercase; letter-spacing: .04em; }
  .n { font: 500 14px var(--font); color: #202124; }
  .d { font-size: 12.5px; color: #70757a; }
  .row, .foot { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  .draw { padding-top: 10px; border-top: 1px solid #e8eaed; }
  .f { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; font-size: 12.5px; color: #5f6368; }
  input, textarea { border: 1px solid #dadce0; border-radius: 6px; padding: 6px 8px; font: 400 13px var(--font); color: #202124; resize: vertical; }
  button, select { border: 1px solid #dadce0; background: #fff; border-radius: 6px; padding: 6px 12px; font: 500 13px var(--font); color: #1f4fd1; cursor: pointer; }
  select { color: #3c4043; padding: 6px 8px; }
  button:hover:not(:disabled) { background: #f1f3f4; }
  button:disabled { color: #bdc1c6; cursor: default; }
  .danger { color: #c5221f; }
  .hint { margin: 6px 0 0; color: #70757a; font-size: 12.5px; }
  .help { margin: 10px 0 0; padding-left: 18px; font-size: 12.5px; color: #5f6368; line-height: 1.45; }
  .st { font-size: 12.5px; color: #1e6b3a; }
  .st.bad { color: #c5221f; }
  .cls, .lbl { font-size: 12.5px; color: #5f6368; }
  .cnt { margin: 8px 0 0; font-size: 12px; color: #80868b; }
</style>
