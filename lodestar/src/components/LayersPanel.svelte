<script>
  import Icon from './Icon.svelte';
  let { layers, view, onToggle, onClose } = $props();
  let cDefault = $state(), cTerrain = $state();
  $effect(() => {
    if (!view) return;
    const p = view.world.places.find((q) => q.n === 'Halveth');
    if (cDefault) view.renderPreview(cDefault, p.x + 10, p.y - 40, 1, { terrain: false, noPin: true });
    if (cTerrain) view.renderPreview(cTerrain, p.x + 10, p.y - 40, 1, { terrain: true, noPin: true });
  });
</script>

<div class="lp" role="dialog" aria-label="Map layers">
  <div class="top"><h2>Map type</h2><button class="x" onclick={onClose} aria-label="Close"><Icon name="close" size={20} color="#5f6368" /></button></div>
  <div class="types">
    <button class:on={!layers.terrain} onclick={() => onToggle('terrain', false)}><canvas bind:this={cDefault}></canvas><span>Default</span></button>
    <button class:on={layers.terrain} onclick={() => onToggle('terrain', true)}><canvas bind:this={cTerrain}></canvas><span>Terrain</span></button>
  </div>
  <h2>Map details</h2>
  <div class="toggles">
    <label><input type="checkbox" checked={layers.list} onchange={(e) => onToggle('list', e.currentTarget.checked)} /><span class="sw tpf"><Icon name="flag" size={16} color="#fff" /></span>TPF sites</label>
    <label><input type="checkbox" checked={layers.borders} onchange={(e) => onToggle('borders', e.currentTarget.checked)} /><span class="sw"><Icon name="region" size={16} color="#fff" /></span>Borders</label>
  </div>
</div>

<style>
  .lp { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.22); padding: 12px 16px 16px; width: 300px; }
  .top { display: flex; justify-content: space-between; align-items: center; }
  h2 { font: 500 14px var(--font); color: #202124; margin: 6px 0 10px; }
  .x { border: 0; background: none; width: 34px; height: 34px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
  .x:hover { background: #f1f3f4; }
  .types { display: flex; gap: 12px; margin-bottom: 14px; }
  .types button { flex: 1; border: 0; background: none; padding: 0; cursor: pointer; font: 500 13px var(--font); color: #3c4043; display: flex; flex-direction: column; gap: 6px; align-items: center; }
  .types canvas { width: 100%; height: 76px; border-radius: 10px; border: 2px solid transparent; box-shadow: 0 0 0 1px #dadce0; }
  .types button.on canvas { border-color: #1f4fd1; }
  .types button.on { color: #1f4fd1; }
  .toggles { display: flex; flex-direction: column; gap: 4px; }
  label { display: flex; align-items: center; gap: 12px; font: 400 14px var(--font); color: #3c4043; cursor: pointer; padding: 6px 2px; border-radius: 8px; }
  label:hover { background: #f8f9fa; }
  input { width: 18px; height: 18px; accent-color: #1f4fd1; margin: 0; }
  .sw { width: 26px; height: 26px; border-radius: 6px; background: #5c6bc0; display: grid; place-items: center; }
  .sw.tpf { background: #7b1fa2; }
</style>
