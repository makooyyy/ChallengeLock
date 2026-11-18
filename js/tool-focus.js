// Restore keyboard focus when a tool panel re-renders its controls.
export function rememberFocus(panel) {
  const active = document.activeElement;
  if (!panel?.contains(active)) return () => {};
  const id = active.id,
    entry = Object.entries(active.dataset || {}).find(
      ([key]) => key.startsWith('build') || key.startsWith('ban'),
    );
  const selector = id
    ? '#' + CSS.escape(id)
    : entry
      ? '[data-' +
        entry[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) +
        '="' +
        CSS.escape(entry[1]) +
        '"]'
      : null;
  return () => {
    if (selector) panel.querySelector(selector)?.focus({ preventScroll: true });
  };
}
export function revealResult(panel) {
  const target = panel.querySelector('.lab-result');
  if (!target) return;
  target.tabIndex = -1;
  if (innerWidth <= 1000) {
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }
}
