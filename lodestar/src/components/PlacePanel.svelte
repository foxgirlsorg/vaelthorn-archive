<script>
  import Icon from './Icon.svelte';

  import { LIST } from '../lib/sharedlist.js';
  let { item, info, nearby = [], saved = false, view, onSave, onShare, onCopy, onPick, onNearby, onList } = $props();
  let canvas = $state();

  $effect(() => {
    if (canvas && item && view) view.renderPreview(canvas, item.x, item.y, item.previewZoom ?? Math.min(7, Math.max(1, (item.zoom ?? 4) + 1)));
  });

  const TYPE_ICON = { poi: 'shop', place: 'city', site: 'landmark', peak: 'peak', lake: 'lake', river: 'river', park: 'park', province: 'region', range: 'peak', street: 'street', country: 'globe', road: 'road', point: 'pin', water: 'water' };
  const fmtKm = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : d < 10 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`);
</script>

<article class="panel">
  <div class="hero">
    <canvas bind:this={canvas} aria-hidden="true"></canvas>
    {#if item.cat === 'list'}<button class="flag" onclick={onList}><Icon name="flag" size={14} color="#fff" />{LIST.title}</button>{/if}
  </div>
  <header>
    <h1>{item.name}</h1>
    <p class="sub">{item.sub}</p>
    {#if info.badge}<p class="badge" class:red={info.badgeRed}>{info.badge}</p>{/if}
  </header>

  <div class="actions">
    <button onclick={onSave}><span class="c" class:on={saved}><Icon name={saved ? 'saved' : 'save'} size={20} /></span><span>{saved ? 'Saved' : 'Save'}</span></button>
    <button onclick={onNearby}><span class="c"><Icon name="nearby" size={20} /></span><span>Nearby</span></button>
    <button onclick={onShare}><span class="c"><Icon name="share" size={20} /></span><span>Share</span></button>
    <button onclick={onCopy}><span class="c"><Icon name="copy" size={19} /></span><span>Copy grid ref</span></button>
  </div>

  {#if item.cat === 'list'}
    <section class="note">
      <p class="who"><span class="av">{@html LIST.avatar}</span><span><b>{LIST.owner}</b> added this to <button class="ln" onclick={onList}>{LIST.title}</button><br /><span class="when">{item.added}</span></span></p>
      <p class="nt2">{item.note}</p>
    </section>
  {/if}
  {#if info.desc}<p class="desc">{info.desc}</p>{/if}

  <ul class="rows">
    {#each info.rows as r}
      <li>
        <Icon name={r.icon} size={20} color="#1f4fd1" />
        <div>
          {#if r.label}<span class="lab">{r.label}</span>{/if}
          {#if r.list}
            {#each r.list as l}<span class="val doc">{l}</span>{/each}
          {:else}
            <span class="val">{r.value}</span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if nearby.length}
    <section class="near" id="nearby">
      <h2>Nearby</h2>
      {#each nearby as n (n.item.id)}
        <button onclick={() => onPick(n.item)}>
          <span class="nico" class:list={n.item.cat === 'list'}><Icon name={n.item.cat === 'list' ? 'flag' : TYPE_ICON[n.item.type] || 'pin'} size={16} color={n.item.cat === 'list' ? '#fff' : '#5f6368'} /></span>
          <span class="nt"><span class="nn">{n.item.name}</span><span class="ns">{n.item.sub}</span></span>
          <span class="nd">{fmtKm(n.d)}</span>
        </button>
      {/each}
    </section>
  {/if}
  <p class="foot">Lodestar map data for Esteloria from the Esteloria Survey Office and the 2024–2026 public archive releases. Coverage outside Esteloria is partial.</p>
</article>

<style>
  .panel { display: flex; flex-direction: column; }
  .hero { position: relative; height: 176px; background: #e8e6e1; overflow: hidden; flex: none; }
  canvas { width: 100%; height: 100%; display: block; }
  .flag { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 5px; border: 0; cursor: pointer; background: #7b1fa2; color: #fff; font: 600 12px var(--font); padding: 4px 10px 4px 7px; border-radius: 12px; }
  .note { padding: 14px 24px 16px; border-bottom: 1px solid #e8eaed; background: #faf5fc; }
  .who { display: flex; gap: 12px; align-items: center; margin: 0 0 10px; font: 400 13px/1.35 var(--font); color: #5f6368; }
  .who b { font-weight: 600; color: #202124; }
  .av { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; flex: none; display: block; }
  .ln { border: 0; background: none; padding: 0; font: 600 13px var(--font); color: #7b1fa2; cursor: pointer; }
  .when { font-size: 12px; color: #80868b; }
  .nt2 { margin: 0; font: 400 14.5px/1.55 var(--font); color: #3c4043; }
  header { padding: 18px 24px 6px; }
  h1 { margin: 0; font: 500 23px/1.25 var(--font); color: #202124; }
  .sub { margin: 4px 0 0; font: 400 14px/1.4 var(--font); color: #70757a; }
  .badge { display: inline-block; margin: 10px 0 0; font: 600 12.5px var(--font); color: #1e6b3a; background: #e6f4ea; padding: 3px 10px; border-radius: 12px; }
  .badge.red { color: #a52714; background: #fce8e6; }
  .actions { display: flex; justify-content: space-around; padding: 12px 8px 14px; border-bottom: 1px solid #e8eaed; }
  .actions button { display: flex; flex-direction: column; align-items: center; gap: 6px; border: 0; background: none; cursor: pointer; font: 500 12.5px var(--font); color: #1f4fd1; width: 84px; }
  .c { width: 40px; height: 40px; border-radius: 50%; border: 1px solid #dadce0; display: grid; place-items: center; color: #1f4fd1; transition: background .15s; }
  .actions button:hover .c { background: #eef2fd; }
  .c.on { background: #1f4fd1; color: #fff; border-color: #1f4fd1; }
  .desc { margin: 0; padding: 16px 24px; font: 400 14.5px/1.55 var(--font); color: #3c4043; border-bottom: 1px solid #e8eaed; }
  .rows { list-style: none; margin: 0; padding: 6px 0; border-bottom: 1px solid #e8eaed; }
  .rows li { display: flex; gap: 22px; padding: 10px 24px; align-items: flex-start; }
  .rows li :global(svg) { flex: none; margin-top: 1px; }
  .rows div { display: flex; flex-direction: column; min-width: 0; }
  .lab { font: 400 12.5px var(--font); color: #70757a; }
  .val { font: 400 14.5px/1.45 var(--font); color: #202124; }
  .doc { font-size: 13.5px; }
  .near { padding: 10px 0 6px; border-bottom: 1px solid #e8eaed; }
  h2 { margin: 4px 24px 8px; font: 500 16px var(--font); color: #202124; }
  .near button { width: 100%; display: flex; align-items: center; gap: 14px; padding: 8px 24px; border: 0; background: none; cursor: pointer; text-align: left; }
  .near button:hover { background: #f8f9fa; }
  .nico { width: 30px; height: 30px; border-radius: 50%; background: #f1f3f4; display: grid; place-items: center; flex: none; }
  .nico.list { background: #7b1fa2; }
  .nt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nn { font: 500 14px var(--font); color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ns { font: 400 12.5px var(--font); color: #70757a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nd { font: 400 12.5px var(--font); color: #70757a; flex: none; }
  .foot { margin: 0; padding: 14px 24px 28px; font: 400 12px/1.5 var(--font); color: #80868b; }
</style>
