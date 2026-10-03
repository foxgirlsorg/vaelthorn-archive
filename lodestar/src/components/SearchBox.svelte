<script>
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';

  let { query = $bindable(''), results = [], recent = [], selectedName = '', onPick, onClear, onMenu } = $props();
  let focused = $state(false);
  let active = $state(-1);
  let input;

  const list = $derived(query.trim() ? results : recent);
  const open = $derived(focused && list.length > 0);

  $effect(() => { query; active = -1; });

  function key(e) {
    if (e.key === 'ArrowDown') { active = Math.min(list.length - 1, active + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(-1, active - 1); e.preventDefault(); }
    else if (e.key === 'Enter') {
      const it = list[active >= 0 ? active : 0];
      if (it) pick(it);
    } else if (e.key === 'Escape') { input.blur(); }
  }
  function pick(it) {
    onPick(it);
    focused = false;
    input.blur();
  }
  const ICON = { city: 'city', town: 'town', village: 'village', hamlet: 'village', list: 'flag', hospital: 'hospital', landmark: 'landmark', peak: 'peak', lake: 'lake', river: 'river', park: 'park', region: 'region', street: 'street', food: 'food', grocery: 'grocery', shop: 'shop', health: 'pharmacy', education: 'school', money: 'bank', fuel: 'fuel', hotel: 'hotel', worship: 'church', civic: 'townhall', culture: 'museum', leisure: 'sports' };
</script>

<div class="search" class:open>
  <div class="bar">
    <button class="ib" onclick={onMenu} aria-label="Menu"><Icon name="menu" size={22} color="#5f6368" /></button>
    <input
      bind:this={input}
      bind:value={query}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 150)}
      onkeydown={key}
      placeholder={selectedName || 'Search Lodestar Maps'}
      aria-label="Search Lodestar Maps"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="search"
    />
    {#if query || selectedName}
      <button class="ib" onclick={() => { query = ''; onClear(); }} aria-label="Clear"><Icon name="close" size={20} color="#5f6368" /></button>
    {:else}
      <span class="ib logo"><Logo size={24} /></span>
    {/if}
  </div>
  {#if open}
    <ul class="results" role="listbox">
      {#if !query.trim()}<li class="hdr">Recent</li>{/if}
      {#each list as it, i (it.id)}
        <li role="option" aria-selected={i === active}>
          <button class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => pick(it)}>
            <span class="ico" class:list={it.cat === 'list' && query.trim()}><Icon name={query.trim() ? ICON[it.cat] || 'pin' : 'history'} size={18} color={it.cat === 'list' && query.trim() ? '#fff' : '#5f6368'} /></span>
            <span class="txt"><span class="nm">{it.name}</span><span class="sb">{it.sub}</span></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search { position: relative; width: 100%; background: #fff; border-radius: 24px; box-shadow: 0 2px 4px rgba(0,0,0,.2), 0 -1px 0 rgba(0,0,0,.02); }
  .search.open { border-radius: 24px 24px 12px 12px; }
  .bar { display: flex; align-items: center; height: 48px; padding: 0 4px; }
  input { flex: 1; min-width: 0; border: 0; outline: 0; font: 400 16px var(--font); color: #202124; background: transparent; padding: 0 6px; height: 100%; }
  input::placeholder { color: #70757a; }
  .ib { width: 40px; height: 40px; border: 0; background: none; border-radius: 50%; display: grid; place-items: center; cursor: pointer; flex: none; }
  .ib:hover { background: #f1f3f4; }
  .logo:hover { background: none; }
  .results { list-style: none; margin: 0; padding: 4px 0 8px; border-top: 1px solid #e8eaed; max-height: min(60vh, 440px); overflow: auto; }
  .hdr { font: 500 12px var(--font); color: #70757a; padding: 6px 18px 4px; text-transform: uppercase; letter-spacing: .06em; }
  .results button { width: 100%; display: flex; align-items: center; gap: 12px; padding: 7px 16px; border: 0; background: none; text-align: left; cursor: pointer; }
  .results button:hover, .results button.active { background: #f1f3f4; }
  .ico { width: 32px; height: 32px; border-radius: 50%; background: #f1f3f4; display: grid; place-items: center; flex: none; }
  .ico.list { background: #7b1fa2; }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .nm { font: 500 15px var(--font); color: #202124; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sb { font: 400 13px var(--font); color: #70757a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
