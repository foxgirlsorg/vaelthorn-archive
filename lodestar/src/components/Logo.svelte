<script>
  let { size = 26 } = $props();
</script>

<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
  <rect width="64" height="64" rx="16" fill="#1f4fd1" />
  <path d="M32 6 37 27 58 32 37 37 32 58 27 37 6 32 27 27Z" fill="#fff" />
  <path d="M32 6 37 27 32 32Z M58 32 37 37 32 32Z" fill="#ffc83d" />
  <circle cx="32" cy="32" r="3.2" fill="#1f4fd1" />
</svg>
