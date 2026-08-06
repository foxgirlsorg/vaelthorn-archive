<script>
  import { documentsById, thumbFor } from './data.js';
  import { formatPublished } from './format.js';

  let { doc, page = 0, onclose, onnavigate, onopen } = $props();

  const MIN = 1;
  const MAX = 6;

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let dragging = $state(false);
  let copied = $state(false);
  let stage;
  let copyTimer;

  // Below 900px the panel drops below the viewer; the stage is sized to
  // 100dvh minus the toolbar so the image fills the screen and the details
  // sit just off the bottom edge, reached by scrolling.
  let mobile = $state(false);
  let topbarH = $state(0);
  let overlay;

  let start = { x: 0, y: 0, tx: 0, ty: 0 };
  let pinch = null;

  $effect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const sync = () => (mobile = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  // Reset the transform whenever the page or document changes, and on mobile
  // scroll back up to the image (a related link is clicked from the panel,
  // which sits below the fold).
  $effect(() => {
    doc.id;
    page;
    reset();
    if (overlay) overlay.scrollTop = 0;
  });

  function reset() {
    scale = 1;
    tx = 0;
    ty = 0;
  }

  function clampPan() {
    if (!stage) return;
    // At scale s the image overflows the stage by (s-1)/2 of its size on each
    // side; keep the translation inside that so it can't be dragged off-screen.
    const maxX = (stage.clientWidth * (scale - 1)) / 2;
    const maxY = (stage.clientHeight * (scale - 1)) / 2;
    tx = Math.max(-maxX, Math.min(maxX, tx));
    ty = Math.max(-maxY, Math.min(maxY, ty));
  }

  function zoomTo(next, originX, originY) {
    const clamped = Math.max(MIN, Math.min(MAX, next));
    if (stage && originX != null) {
      const rect = stage.getBoundingClientRect();
      // Keep the point under the cursor fixed while scaling.
      const px = originX - rect.left - rect.width / 2;
      const py = originY - rect.top - rect.height / 2;
      const ratio = clamped / scale;
      tx = px - (px - tx) * ratio;
      ty = py - (py - ty) * ratio;
    }
    scale = clamped;
    if (scale === 1) {
      tx = 0;
      ty = 0;
    }
    clampPan();
  }

  function onWheel(e) {
    e.preventDefault();
    zoomTo(scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (scale === 1) return;
    dragging = true;
    start = { x: e.clientX, y: e.clientY, tx, ty };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    tx = start.tx + (e.clientX - start.x);
    ty = start.ty + (e.clientY - start.y);
    clampPan();
  }

  function onPointerUp() {
    dragging = false;
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      pinch = { dist: touchDist(e), scale };
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
      zoomTo((pinch.scale * touchDist(e)) / pinch.dist, mid.x, mid.y);
    }
  }

  function touchDist(e) {
    const [a, b] = e.touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onDoubleClick(e) {
    zoomTo(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
  }

  function go(delta) {
    const next = page + delta;
    if (next >= 0 && next < doc.pages.length) onnavigate(next);
  }

  function onKey(e) {
    switch (e.key) {
      case 'Escape':
        onclose();
        break;
      case 'ArrowRight':
        go(1);
        break;
      case 'ArrowLeft':
        go(-1);
        break;
      case '+':
      case '=':
        zoomTo(scale * 1.3);
        break;
      case '-':
        zoomTo(scale / 1.3);
        break;
      case '0':
        reset();
        break;
    }
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set('doc', doc.id);
    if (doc.pages.length > 1) url.searchParams.set('page', String(page + 1));
    else url.searchParams.delete('page');
    try {
      await navigator.clipboard.writeText(url.toString());
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1800);
    } catch {
      window.prompt('Copy this link', url.toString());
    }
  }

  function relatedTitle(r) {
    return r.id ? documentsById[r.id]?.title ?? r.id : r.label;
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="overlay"
  bind:this={overlay}
  role="dialog"
  aria-modal="true"
  aria-label={doc.title}
  tabindex="-1"
>
  <div class="topbar" bind:clientHeight={topbarH}>
    <div class="ident">
      <span class="stamp code">{doc.code}</span>
      <span class="title">{doc.title}</span>
    </div>
    <div class="tools">
      <div class="zoomset">
        <button title="Zoom out (−)" onclick={() => zoomTo(scale / 1.3)} aria-label="Zoom out">−</button>
        <button class="lvl" title="Reset zoom (0)" onclick={reset}>{Math.round(scale * 100)}%</button>
        <button title="Zoom in (+)" onclick={() => zoomTo(scale * 1.3)} aria-label="Zoom in">+</button>
      </div>
      <button class="tool" onclick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
      <a class="tool" href={doc.pages[page]} target="_blank" rel="noopener">Open original</a>
    </div>
    <button class="tool close" onclick={onclose} aria-label="Close">
      <span class="x" aria-hidden="true">✕</span> close
    </button>
  </div>

  <div class="body">
    <div
      class="stage"
      style={mobile ? `height: calc(100dvh - ${topbarH}px)` : undefined}
      bind:this={stage}
      class:grabbing={dragging}
      class:zoomed={scale > 1}
      onwheel={onWheel}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      ontouchstart={onTouchStart}
      ontouchmove={onTouchMove}
      ondblclick={onDoubleClick}
      role="presentation"
    >
      <img
        src={doc.pages[page]}
        alt={`${doc.title} — page ${page + 1}`}
        draggable="false"
        style="transform: translate({tx}px, {ty}px) scale({scale});"
      />

      {#if doc.pages.length > 1}
        <button
          class="pager prev"
          onclick={() => go(-1)}
          disabled={page === 0}
          aria-label="Previous page">‹</button
        >
        <button
          class="pager next"
          onclick={() => go(1)}
          disabled={page === doc.pages.length - 1}
          aria-label="Next page">›</button
        >
        <div class="pagebar">
          <button onclick={() => go(-1)} disabled={page === 0}>‹ prev</button>
          <span class="counter stamp">page {page + 1} / {doc.pages.length}</span>
          <button onclick={() => go(1)} disabled={page === doc.pages.length - 1}
            >next ›</button
          >
        </div>
      {/if}
    </div>

    <aside class="panel">
        <p class="stamp code">{doc.code}</p>
        <h2>{doc.title}</h2>
        <p class="teaser">{doc.teaser}</p>

        <dl>
          <dt>Category</dt>
          <dd>{doc.category}</dd>
          <dt>Date on document</dt>
          <dd>{doc.originalDate}</dd>
          <dt>Date released</dt>
          <dd>{formatPublished(doc.published)}</dd>
          <dt>Pages</dt>
          <dd>{doc.pages.length}</dd>
          <dt>Classification</dt>
          <dd class="lifted">Declassified, cleared for release</dd>
        </dl>

        {#if doc.pages.length > 1}
          <div class="thumbs">
            {#each doc.pages as p, i}
              <button
                class:active={i === page}
                onclick={() => onnavigate(i)}
                aria-label={`Go to page ${i + 1}`}
              >
                <img src={thumbFor(p)} alt="" loading="lazy" />
                <span class="stamp">{i + 1}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if doc.related.length}
          <p class="stamp section">Related material</p>
          <ul class="related">
            {#each doc.related as r}
              <li>
                {#if r.id}
                  <button class="rel-doc" onclick={() => onopen(r.id)}>
                    <span class="stamp">{documentsById[r.id]?.code}</span>
                    {relatedTitle(r)}
                  </button>
                {:else}
                  <a class="rel-doc" href={r.url} target="_blank" rel="noopener">
                    <span class="stamp">External</span>
                    {r.label} ↗
                  </a>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        <p class="hint">
          Scroll to zoom · drag to pan · double-click to toggle · arrow keys to
          turn pages · Esc to close
        </p>
      </aside>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #060607;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line-soft);
    flex-shrink: 0;
  }
  .ident {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }
  .code {
    color: var(--accent);
    white-space: nowrap;
  }
  .ident .title {
    font-size: 13.5px;
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .tool,
  .zoomset {
    border: 1px solid var(--line-soft);
    color: var(--ink-faint);
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-decoration: none;
  }
  .tool {
    padding: 6px 11px;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
  }
  .tool:hover {
    color: var(--ink);
    border-color: var(--line);
  }
  .zoomset {
    display: flex;
    align-items: center;
  }
  .zoomset button {
    padding: 5px 10px;
    color: var(--ink-faint);
  }
  .zoomset button:hover {
    color: var(--ink);
  }
  .lvl {
    font-family: var(--font-mono);
    font-size: 10.5px;
    border-left: 1px solid var(--line-soft);
    border-right: 1px solid var(--line-soft);
    min-width: 54px;
  }
  .close {
    gap: 7px;
    color: var(--ink);
    border-color: var(--accent-deep);
    background: rgba(222, 97, 97, 0.1);
  }
  .close:hover {
    border-color: var(--accent);
    background: rgba(222, 97, 97, 0.18);
  }
  .close .x {
    color: var(--accent);
    font-size: 11px;
  }
  .close .key {
    color: var(--ink-faint);
    font-size: 9px;
    border: 1px solid var(--line);
    padding: 1px 4px;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .stage {
    position: relative;
    flex: 1;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    /* At 1× let a single-finger drag scroll the page down to the details;
       when zoomed we take over the gesture for panning. */
    touch-action: pan-y;
  }
  .stage.zoomed {
    cursor: grab;
    touch-action: none;
  }
  .stage.grabbing {
    cursor: grabbing;
  }
  .stage img {
    max-width: 94%;
    max-height: 94%;
    object-fit: contain;
    user-select: none;
    transform-origin: center center;
    transition: transform 0.09s linear;
  }
  .stage.grabbing img {
    transition: none;
  }
  .pager {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 62px;
    font-size: 22px;
    color: var(--ink-dim);
    background: rgba(13, 13, 15, 0.92);
    border: 1px solid var(--line);
  }
  .pager:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--accent-deep);
  }
  .pager:disabled {
    opacity: 0.2;
    cursor: default;
  }
  .prev {
    left: 14px;
  }
  .next {
    right: 14px;
  }
  .pagebar {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: stretch;
    background: rgba(13, 13, 15, 0.94);
    border: 1px solid var(--line);
  }
  .pagebar button {
    padding: 7px 14px;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }
  .pagebar button:hover:not(:disabled) {
    color: var(--ink);
    background: rgba(222, 97, 97, 0.12);
  }
  .pagebar button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .counter {
    display: flex;
    align-items: center;
    white-space: nowrap;
    padding: 0 14px;
    color: var(--ink-faint);
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
  }
  .panel {
    width: 328px;
    flex-shrink: 0;
    border-left: 1px solid var(--line-soft);
    background: var(--bg-panel);
    padding: 22px 20px 38px;
    overflow-y: auto;
  }
  .panel h2 {
    font-size: 19px;
    margin: 8px 0 11px;
  }
  .teaser {
    color: var(--ink-dim);
    font-size: 13.5px;
    margin: 0 0 20px;
  }
  dl {
    margin: 0;
    border-top: 1px solid var(--line-soft);
  }
  dt {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-faint);
    padding-top: 12px;
  }
  dd {
    margin: 3px 0 12px;
    font-size: 14px;
    border-bottom: 1px solid var(--line-soft);
    padding-bottom: 12px;
  }
  .lifted {
    color: var(--accent);
  }
  .thumbs {
    display: flex;
    gap: 8px;
    margin-top: 18px;
  }
  .thumbs button {
    position: relative;
    width: 58px;
    border: 1px solid var(--line-soft);
    padding: 0;
    line-height: 0;
  }
  .thumbs button.active {
    border-color: var(--accent);
  }
  .thumbs img {
    width: 100%;
    height: 72px;
    object-fit: cover;
    object-position: top center;
    filter: grayscale(1) brightness(0.7);
  }
  .thumbs button.active img {
    filter: grayscale(0.8) brightness(0.95);
  }
  .thumbs span {
    position: absolute;
    right: 3px;
    bottom: 3px;
    background: rgba(10, 10, 11, 0.9);
    padding: 1px 4px;
  }
  .section {
    margin: 26px 0 10px;
    color: var(--ink-dim);
  }
  .related {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rel-doc {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 100%;
    text-align: left;
    padding: 9px 11px;
    border: 1px solid var(--line-soft);
    font-size: 13px;
    color: var(--ink-dim);
    text-decoration: none;
    transition: border-color 0.12s, color 0.12s;
  }
  .rel-doc:hover {
    color: var(--ink);
    border-color: var(--line);
  }
  .hint {
    margin-top: 28px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ink-faint);
  }
  @media (max-width: 900px) {
    /* The viewer (toolbar + stage) fills the screen; the details flow below it
       and the whole overlay scrolls. The stage height is set inline from the
       measured toolbar height so the two together are exactly 100dvh. */
    .overlay {
      overflow-y: auto;
    }
    .body {
      flex: 0 0 auto;
      flex-direction: column;
    }
    .stage {
      flex: 0 0 auto;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #060607;
    }
    .panel {
      width: auto;
      flex: 0 0 auto;
      max-height: none;
      overflow: visible;
      border-left: none;
      border-top: 1px solid var(--line);
      padding: 22px 18px 40px;
    }
    .ident .title {
      display: none;
    }
    .tool {
      padding: 6px 9px;
    }
  }

  /* Phones: the toolbar drops to a second, horizontally scrollable row so the
     close button always keeps its place in the top-right corner. */
  @media (max-width: 640px) {
    .topbar {
      flex-wrap: wrap;
      row-gap: 8px;
      padding: 9px 12px;
    }
    .ident {
      order: 0;
      flex: 1;
    }
    .close {
      order: 1;
    }
    .tools {
      order: 2;
      width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 1px;
    }
    .tools::-webkit-scrollbar {
      display: none;
    }
    .pager {
      display: none;
    }
    .pagebar {
      bottom: 12px;
    }
    .pagebar button {
      padding: 9px 16px;
    }
    .panel {
      padding: 20px 14px 32px;
    }
    .thumbs img {
      height: 62px;
    }
  }
</style>
