<script>
  let { count } = $props();
</script>

<header class="nav">
  <div class="shell inner">
    <a class="brand" href="#top">
      <span class="wordmark">VAELTHORN</span>
      <span class="sub stamp">archive</span>
    </a>
    <div class="meta">
      <span class="stamp">{String(count).padStart(3, '0')} files</span>
      <span class="sep" aria-hidden="true"></span>
      <span class="stamp accent">declassified</span>
    </div>
  </div>
</header>

<style>
  .nav {
    position: sticky;
    top: 0;
    z-index: 40;
    background: rgba(10, 10, 11, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line-soft);
  }
  .inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    height: 54px;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: 10px;
    text-decoration: none;
  }
  .wordmark {
    font-family: var(--font-mono);
    font-size: 12.5px;
    letter-spacing: 0.26em;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .sep {
    width: 1px;
    height: 12px;
    background: var(--line);
  }
  .accent {
    color: var(--accent);
  }
  @media (max-width: 720px) {
    .meta {
      display: none;
    }
  }
</style>
