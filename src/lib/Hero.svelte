<script>
  import { formatShort } from './format.js';

  let { count, latest } = $props();
</script>

<section class="hero" id="top">
  <div class="shell">
    <p class="stamp kicker">Release log / last updated {formatShort(latest)}</p>
    <h1>The TPF archive, opened to the public.</h1>
    <div class="statement">
      <p>
        The Purifying Flame was founded by royal decree in 1482. In 1934 it was
        absorbed into the state as the TPF Research and Detainment Division. In
        January 2024 the TPF was liquidated in full, and what remained of its
        archive passed to this office.
      </p>
      <p>
        This office also publishes material outside that transfer: records kept
        by the Vaelthorn network itself, released with the consent of those named
        in them. Such material was never part of the TPF's own archive.
      </p>
      <p>
        Files are cleared in batches and go online as review finishes, so this
        is not the whole archive.
      </p>
      <p class="sig stamp">Vaelthorn's office of Public Records, Republic of Esteloria</p>
    </div>
    <dl class="figures">
      <div><dt>Online</dt><dd>{String(count).padStart(3, '0')}</dd></div>
      <div><dt>Earliest</dt><dd>1482</dd></div>
      <div><dt>Liquidated</dt><dd>01.2024</dd></div>
      <div>
        <dt>Next batch</dt>
        <dd class="pending">in review</dd>
      </div>
    </dl>
  </div>
</section>

<style>
  .hero {
    padding: 76px 0 54px;
    border-bottom: 1px solid var(--line-soft);
  }
  .kicker {
    color: var(--accent);
    margin: 0 0 24px;
  }
  h1 {
    font-size: clamp(26px, 3.6vw, 40px);
    max-width: 21ch;
    margin-bottom: 30px;
  }
  .statement {
    max-width: 60ch;
    color: var(--ink-dim);
    font-size: 14.5px;
  }
  .statement p {
    margin: 0 0 14px;
  }
  .sig {
    color: var(--ink-faint);
    margin-top: 18px;
  }
  .figures {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0;
    margin: 46px 0 0;
    border: 1px solid var(--line-soft);
  }
  .figures > div {
    padding: 14px 18px;
    border-right: 1px solid var(--line-soft);
  }
  .figures > div:last-child {
    border-right: none;
  }
  dt {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  dd {
    margin: 4px 0 0;
    font-family: var(--font-mono);
    font-size: 19px;
    letter-spacing: 0.02em;
  }
  .pending {
    color: var(--accent);
    font-size: 15px;
    padding: 2px 0;
  }
  @media (max-width: 640px) {
    .hero {
      padding: 48px 0 36px;
    }
    .figures > div {
      border-bottom: 1px solid var(--line-soft);
    }
  }
</style>

