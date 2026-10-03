<script>
  import Icon from './Icon.svelte';
  let { cat, items = [], onPick, onClose, shown = true, onShow } = $props();
  import { TYPES, CAT_COLOR } from '../lib/chains.js';
  import { LIST } from '../lib/sharedlist.js';
  const ICON = { city: 'city', town: 'town', list: 'flag', hospital: 'hospital', landmark: 'landmark', peak: 'peak', lake: 'lake', park: 'park' };
  const iconOf = (it) => (it.type === 'poi' ? TYPES[it.data.type].icon : ICON[it.cat] || 'pin');
  const colOf = (it) => (it.type === 'poi' ? CAT_COLOR[it.cat] : it.cat === 'list' ? LIST.color : null);
</script>

<section class="cl">
  <div class="head">
    <button class="back" onclick={onClose} aria-label="Back"><Icon name="back" size={22} color="#5f6368" /></button>
    {#if cat.list}
      <div><h1>{LIST.title}</h1><p>Shared list · {items.length} places</p></div>
    {:else}
      <div><h1>{cat.label}</h1><p>{items.length} results{cat.poi ? ' near the map centre' : ''}</p></div>
    {/if}
  </div>
  {#if cat.list}
    <div class="owner">
      <p class="who"><span class="av">{@html LIST.avatar}</span><span><b>{LIST.owner}</b> shared this list with you<br /><span class="when">Updated {LIST.updated}</span></span></p>
      <p class="ldesc">{LIST.note}</p>
      <label class="show"><input type="checkbox" checked={shown} onchange={(e) => onShow?.(e.currentTarget.checked)} />Show on map</label>
    </div>
  {/if}
  <ul>
    {#each items as it (it.id)}
      <li>
        <button onclick={() => onPick(it)}>
          <span class="ico" style:background={colOf(it) || undefined}><Icon name={iconOf(it)} size={18} color={colOf(it) ? '#fff' : '#5f6368'} /></span>
          <span class="t"><span class="n">{it.name}</span>{#if cat.list}<span class="s nt">{it.note}</span><span class="s">Added {it.added}</span>{:else}<span class="s">{it.sub}</span>{/if}{#if it.type === 'poi'}<span class="s rt">{it.data.rating ? it.data.rating.toFixed(1) + ' ★ · ' : ''}{it.data.chain ? 'Chain' : 'Independent'}</span>{/if}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .head { display: flex; align-items: center; gap: 8px; padding: 16px 16px 10px 10px; border-bottom: 1px solid #e8eaed; }
  .back { width: 40px; height: 40px; border: 0; background: none; border-radius: 50%; cursor: pointer; display: grid; place-items: center; flex: none; }
  .back:hover { background: #f1f3f4; }
  h1 { margin: 0; font: 500 20px var(--font); color: #202124; }
  .head p { margin: 2px 0 0; font: 400 13px var(--font); color: #70757a; }
  .owner { padding: 14px 24px; background: #faf5fc; border-bottom: 1px solid #eadcf0; }
  .who { display: flex; gap: 12px; align-items: center; margin: 0 0 10px; font: 400 13px/1.35 var(--font); color: #5f6368; }
  .who b { font-weight: 600; color: #202124; }
  .av { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex: none; display: block; }
  .when { font-size: 12px; color: #80868b; }
  .ldesc { margin: 0 0 10px; font: 400 14px/1.5 var(--font); color: #3c4043; }
  .show { display: flex; align-items: center; gap: 8px; font: 500 13.5px var(--font); color: #3c4043; cursor: pointer; }
  .show input { accent-color: #7b1fa2; width: 16px; height: 16px; }
  .nt { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  ul { list-style: none; margin: 0; padding: 4px 0 24px; }
  li button { width: 100%; display: flex; gap: 14px; padding: 12px 24px; border: 0; border-bottom: 1px solid #f1f3f4; background: none; cursor: pointer; text-align: left; align-items: flex-start; }
  li button:hover { background: #f8f9fa; }
  .ico { width: 36px; height: 36px; border-radius: 50%; background: #f1f3f4; display: grid; place-items: center; flex: none; }
  .t { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
  .n { font: 500 15px var(--font); color: #202124; }
  .s { font: 400 13px var(--font); color: #70757a; }
  .rt { color: #b06000; }
</style>
