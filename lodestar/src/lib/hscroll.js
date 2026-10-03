// A horizontal strip that scrolls with a mouse too (use:hscroll={onEdges}): a mouse wheel turned up
// or down scrolls it sideways, and it can be dragged; a drag is not taken as a click on what is
// under it. Touch screens and trackpads scroll it as they always do. onEdges({ left, right }) is
// told whether there is more to see either way (for arrow buttons), and again as that changes.
export function hscroll(el, onEdges = null) {
  const edges = () => onEdges && onEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  const ro = new ResizeObserver(edges);
  ro.observe(el);
  el.addEventListener('scroll', edges, { passive: true });
  edges();
  const wheel = (e) => {
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // (trackpads scroll sideways themselves)
    const before = el.scrollLeft;
    el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    if (el.scrollLeft !== before) e.preventDefault(); // at either end the page gets the wheel back
  };
  let drag = null, dragged = false;
  const down = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth) return;
    drag = { x: e.clientX, left: el.scrollLeft, id: e.pointerId }; dragged = false;
  };
  const move = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!dragged && Math.abs(dx) < 5) return; // a click wobbles a little
    if (!dragged) { dragged = true; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; }
    el.scrollLeft = drag.left - dx;
  };
  const up = () => { drag = null; el.style.cursor = ''; };
  const click = (e) => { if (dragged) { e.preventDefault(); e.stopPropagation(); dragged = false; } };
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('click', click, true);
  return {
    update(fn) { onEdges = fn; edges(); },
    destroy() {
      ro.disconnect(); el.removeEventListener('scroll', edges);
      el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('click', click, true);
    },
  };
}
