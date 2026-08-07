<script>
  import { formatPublished } from './format.js';
  import { isEmbed } from './data.js';

  let { doc, onopen } = $props();
</script>

<article class="card notch">
  <button class="hit" onclick={() => onopen(doc.id)}>
    <span class="sr">Open {doc.title}</span>
  </button>

  <div class="thumb">
    {#if doc.thumb}
      <!-- Preview image: a scan thumbnail, or one set on a web document. -->
      <img src={doc.thumb} alt="" loading="lazy" />
    {:else}
      <!-- Web document with no preview image set. -->
      <span class="placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="34" height="34">
          <path d="M4 3h11l5 5v13H4Z" fill="none" stroke="currentColor" stroke-width="1.3" />
          <path d="M15 3v5h5" fill="none" stroke="currentColor" stroke-width="1.3" />
          <path d="M8 13h8M8 16h8M8 19h5" stroke="currentColor" stroke-width="1.3" />
        </svg>
      </span>
    {/if}
    <span class="veil"></span>
    <span class="corner" aria-hidden="true"></span>
    {#if isEmbed(doc)}
      <span class="pages stamp">WEB</span>
    {:else if doc.pages.length > 1}
      <span class="pages stamp">{doc.pages.length}P</span>
    {/if}
  </div>

  <div class="body">
    <p class="code stamp">{doc.code}</p>
    <h3>{doc.title}</h3>
    <p class="teaser">{doc.teaser}</p>
    <footer>
      <span class="stamp">{doc.originalDate}</span>
      <span class="stamp rel">rel. {formatPublished(doc.published)}</span>
    </footer>
  </div>
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--bg-raised);
    outline: 1px solid var(--line-soft);
    outline-offset: -1px;
    transition: outline-color 0.15s;
  }
  .card:hover {
    outline-color: var(--line);
  }
  .hit {
    position: absolute;
    inset: 0;
    z-index: 3;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .thumb {
    position: relative;
    aspect-ratio: 5 / 3;
    overflow: hidden;
    background: #0a0a0b;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-faint);
    background:
      repeating-linear-gradient(
        -45deg,
        transparent 0 9px,
        rgba(255, 255, 255, 0.02) 9px 10px
      );
  }
  .card:hover .placeholder,
  .card:focus-within .placeholder {
    color: var(--accent);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top center;
    filter: grayscale(1) contrast(1.08) brightness(0.62);
    transition: filter 0.25s ease;
  }
  .card:hover .thumb img,
  .card:focus-within .thumb img {
    filter: grayscale(0) contrast(1.02) brightness(1);
  }
  .veil {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 50%, rgba(10, 10, 11, 0.92));
    pointer-events: none;
  }
  .corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 14px;
    height: 14px;
    border-top: 1px solid var(--line);
    border-left: 1px solid var(--line);
    transition: border-color 0.15s;
  }
  .card:hover .corner {
    border-color: var(--accent);
  }
  .pages {
    position: absolute;
    right: 10px;
    bottom: 10px;
    color: var(--ink-dim);
  }
  .body {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 16px 18px 15px;
    border-top: 1px solid var(--line-soft);
  }
  .code {
    color: var(--accent);
    margin: 0 0 9px;
  }
  h3 {
    font-size: 17px;
    margin-bottom: 9px;
  }
  .teaser {
    color: var(--ink-dim);
    font-size: 13.5px;
    line-height: 1.5;
    margin: 0 0 16px;
    flex: 1;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding-top: 11px;
    border-top: 1px solid var(--line-soft);
  }
  .rel {
    color: var(--ink-faint);
    opacity: 0.75;
  }
</style>
