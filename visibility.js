(() => {
  // Only the embedded player should ignore background-tab visibility changes.
  if (!/^\/[a-z0-9]+\/embed\/?$/i.test(location.pathname)) return;

  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
  } catch { /* The embed can still play normally if the browser rejects an override. */ }

  const swallow = event => event.stopImmediatePropagation();
  window.addEventListener('visibilitychange', swallow, true);
  document.addEventListener('visibilitychange', swallow, true);
  window.addEventListener('blur', swallow, true);
})();
