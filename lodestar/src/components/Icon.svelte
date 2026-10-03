<script>
  import { ICONS } from '../lib/icons.js';
  let { name, size = 20, color = 'currentColor', title = '' } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill={color} aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined}>
  {#if title}<title>{title}</title>{/if}
  <path d={ICONS[name] || ICONS.pin} />
</svg>
