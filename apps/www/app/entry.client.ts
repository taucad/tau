// Let the server-rendered document paint before loading React's hydration runtime.
// Native links and disclosures remain usable while the enhancement downloads.
let started = false;
function hydrate(): void {
  if (started) {
    return;
  }
  started = true;
  removeEventListener('pointerdown', hydrate, true);
  removeEventListener('keydown', hydrate, true);
  // async-iife: bootstrap -- The entry module owns the single hydration bootstrap.
  void loadHydration();
}
async function loadHydration(): Promise<void> {
  try {
    const { hydrateDocument } = await import('#app/hydrate.client.js');
    hydrateDocument();
  } catch (error) {
    console.error('Marketing enhancement failed to load', error);
  }
}
addEventListener('pointerdown', hydrate, { once: true, capture: true });
addEventListener('keydown', hydrate, { once: true, capture: true });
requestAnimationFrame(() => {
  if ('requestIdleCallback' in globalThis) {
    requestIdleCallback(hydrate, { timeout: 1000 });
  } else {
    setTimeout(hydrate, 0);
  }
});
