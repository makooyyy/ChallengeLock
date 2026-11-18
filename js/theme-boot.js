// Classic script, runs before first paint: applies the saved theme without a flash.
// Extracted from index.html so the page can ship a strict Content-Security-Policy.
try {
  const saved = JSON.parse(localStorage.getItem('dlr.v1') || '{}')?.theme;
  document.documentElement.dataset.theme = ['light', 'dark'].includes(saved)
    ? saved
    : matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}
