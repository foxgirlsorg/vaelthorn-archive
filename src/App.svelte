<script>
  import { categories, documents, documentsById, pageCount } from './lib/data.js';
  import Nav from './lib/Nav.svelte';
  import Hero from './lib/Hero.svelte';
  import Filters from './lib/Filters.svelte';
  import DocCard from './lib/DocCard.svelte';
  import Lightbox from './lib/Lightbox.svelte';
  import Footer from './lib/Footer.svelte';

  let active = $state('All');
  let query = $state('');
  let openId = $state(null);
  let page = $state(0);

  const counts = categories.reduce((acc, cat) => {
    acc[cat] =
      cat === 'All'
        ? documents.length
        : documents.filter((d) => d.category === cat).length;
    return acc;
  }, {});

  const byOldest = [...documents].sort((a, b) =>
    a.published.localeCompare(b.published)
  );
  const byNewest = [...byOldest].reverse();
  const latest = byNewest[0].published;

  let order = $state('newest'); // newest | oldest

  let visible = $derived(
    (order === 'newest' ? byNewest : byOldest).filter((d) => {
      if (active !== 'All' && d.category !== active) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [d.title, d.code, d.teaser, d.category, d.originalDate]
        .join(' ')
        .toLowerCase()
        .includes(q);
    })
  );

  // Group the results by release year so the staggered declassification reads
  // off the page.
  let batches = $derived(
    visible.reduce((acc, doc) => {
      const year = doc.published.slice(0, 4);
      const last = acc[acc.length - 1];
      if (last && last.year === year) last.docs.push(doc);
      else acc.push({ year, docs: [doc] });
      return acc;
    }, [])
  );

  let openDoc = $derived(openId ? documentsById[openId] : null);

  // Lock scrolling behind the lightbox.
  $effect(() => {
    document.body.classList.toggle('is-locked', !!openDoc);
  });

  function syncUrl(replace = false) {
    const url = new URL(window.location.href);
    if (openId) {
      url.searchParams.set('doc', openId);
      if (pageCount(documentsById[openId]) > 1 && page > 0)
        url.searchParams.set('page', String(page + 1));
      else url.searchParams.delete('page');
    } else {
      url.searchParams.delete('doc');
      url.searchParams.delete('page');
    }
    history[replace ? 'replaceState' : 'pushState']({ doc: openId, page }, '', url);
  }

  function open(id, startPage = 0) {
    if (!documentsById[id]) return;
    openId = id;
    page = startPage;
    syncUrl();
  }

  function close() {
    openId = null;
    page = 0;
    syncUrl();
  }

  function navigate(next) {
    page = next;
    syncUrl(true);
  }

  function readUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('doc');
    if (id && documentsById[id]) {
      openId = id;
      const p = Number(params.get('page') ?? 1);
      page = Number.isFinite(p)
        ? Math.min(Math.max(p - 1, 0), pageCount(documentsById[id]) - 1)
        : 0;
    } else {
      openId = null;
      page = 0;
    }
  }

  readUrl();
</script>

<svelte:window on:popstate={readUrl} />

<Nav count={documents.length} />
<Hero count={documents.length} {latest} />

<main class="shell">
  <Filters {categories} bind:active bind:query bind:order {counts} />

  {#if visible.length}
    {#each batches as batch (batch.year)}
      <section class="batch">
        <div class="batch-head">
          <span class="year">{batch.year}</span>
          <span class="rule"></span>
          <span class="stamp">{String(batch.docs.length).padStart(2, '0')} released</span>
        </div>
        <div class="grid">
          {#each batch.docs as doc (doc.id)}
            <DocCard {doc} onopen={open} />
          {/each}
        </div>
      </section>
    {/each}
  {:else}
    <p class="empty">
      No files match that request. The archive holds {documents.length} released
      documents.
    </p>
  {/if}
</main>

<Footer />

{#if openDoc}
  <Lightbox
    doc={openDoc}
    {page}
    onclose={close}
    onnavigate={navigate}
    onopen={(id) => open(id)}
  />
{/if}

<style>
  main {
    padding-bottom: 20px;
  }
  .batch {
    padding-top: 34px;
  }
  .batch-head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
  }
  .year {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.22em;
    color: var(--ink-dim);
  }
  .rule {
    flex: 1;
    height: 1px;
    background: var(--line-soft);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(288px, 1fr));
    gap: 16px;
  }
  .empty {
    padding: 70px 0;
    text-align: center;
    color: var(--ink-faint);
  }
</style>
