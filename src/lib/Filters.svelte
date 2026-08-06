<script>
  let {
    categories,
    active = $bindable(),
    query = $bindable(),
    order = $bindable(),
    counts
  } = $props();
</script>

<div class="filters">
  <div class="tabs" role="tablist" aria-label="Filter by category">
    {#each categories as cat}
      <button
        role="tab"
        aria-selected={active === cat}
        class:active={active === cat}
        onclick={() => (active = cat)}
      >
        <span class="label">{cat}</span>
        <span class="n">{String(counts[cat] ?? 0).padStart(2, '0')}</span>
      </button>
    {/each}
  </div>
  <div class="right">
    <button
      class="order"
      onclick={() => (order = order === 'newest' ? 'oldest' : 'newest')}
      title="Reverse the release order"
    >
      <span class="arrow" aria-hidden="true">{order === 'newest' ? '↓' : '↑'}</span>
      {order === 'newest' ? 'newest first' : 'oldest first'}
    </button>
    <label class="search">
      <span class="stamp prompt">›</span>
      <input type="search" placeholder="search" bind:value={query} />
    </label>
  </div>
</div>

<style>
  .filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding: 22px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border: 1px solid var(--line-soft);
  }
  .tabs button {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 7px 14px;
    border-right: 1px solid var(--line-soft);
    color: var(--ink-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    transition: color 0.12s, background 0.12s;
  }
  .tabs button:last-child {
    border-right: none;
  }
  .tabs button:hover {
    color: var(--ink);
  }
  .tabs button.active {
    color: var(--ink);
    background: var(--accent-soft);
    box-shadow: inset 0 -1px 0 var(--accent);
  }
  .n {
    font-size: 9.5px;
    opacity: 0.6;
  }
  .right {
    display: flex;
    align-items: stretch;
    gap: 8px;
    margin-left: auto; /* stays right-aligned when it wraps to its own row */
  }
  .order {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 13px;
    border: 1px solid var(--line-soft);
    color: var(--ink-faint);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    transition: color 0.12s, border-color 0.12s;
  }
  .order:hover {
    color: var(--ink);
    border-color: var(--line);
  }
  .arrow {
    color: var(--accent);
    font-size: 12px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line-soft);
    padding: 6px 12px;
    min-width: 220px;
  }
  .prompt {
    color: var(--accent);
    letter-spacing: 0;
  }
  .search input {
    border: none;
    background: none;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 11.5px;
    letter-spacing: 0.1em;
    outline: none;
    width: 100%;
  }
  .search input::placeholder {
    color: var(--ink-faint);
    text-transform: uppercase;
  }
  @media (max-width: 640px) {
    .filters {
      gap: 12px;
    }
    .right {
      width: 100%;
    }
    .search {
      flex: 1;
      min-width: 0;
    }
    /* One scrollable row rather than ragged wrapped rows. */
    .tabs {
      width: 100%;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tabs::-webkit-scrollbar {
      display: none;
    }
    .tabs button {
      flex: 0 0 auto;
      padding: 8px 13px;
    }
  }
</style>
