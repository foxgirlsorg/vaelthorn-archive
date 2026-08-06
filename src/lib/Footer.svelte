<script>
  const year = new Date().getFullYear();
</script>

<footer class="foot">
  <div class="shell inner">
    <div class="col">
      <p class="stamp label">Office of Public Records</p>
      <p>
        Published in the public interest under the Transparency Act of 2024.
        Reproduction permitted without restriction. Release is ongoing; batches
        are added as clearance review finishes. Requests for material not yet
        online may be filed with this office.
      </p>
    </div>
    <div class="col right">
      <p class="stamp">Republic of Esteloria</p>
      <p class="stamp">TPF / 1934—2024 / liquidated</p>
      <p class="stamp copy">© {year} Vaelthorn Archive</p>
    </div>
  </div>
</footer>

<style>
  .foot {
    margin-top: 76px;
    border-top: 1px solid var(--line-soft);
    padding: 36px 0 52px;
  }
  .inner {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    flex-wrap: wrap;
  }
  .col {
    max-width: 46ch;
  }
  .col p {
    margin: 0 0 7px;
    color: var(--ink-faint);
    font-size: 13px;
    line-height: 1.55;
  }
  .label {
    color: var(--ink-dim);
  }
  .right {
    text-align: right;
  }
  .copy {
    color: var(--ink-dim);
    margin-top: 12px;
  }
  @media (max-width: 720px) {
    .right {
      text-align: left;
    }
  }
</style>
