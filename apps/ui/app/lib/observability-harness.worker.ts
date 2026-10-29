// A real worker exception, observed by the host's Worker error channel.
globalThis.addEventListener('message', () => {
  throw new Error('Observability harness worker error');
});
