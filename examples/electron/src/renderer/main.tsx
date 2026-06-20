import { createRoot } from 'react-dom/client';

import { App } from './app.js';

const container = document.querySelector('#root');
if (!container) {
  throw new Error('Renderer root element missing');
}

/* `StrictMode` intentionally double-invokes effects in development
 * builds. The example's bootstrap effect requests fresh kernel + filesystem
 * `MessagePort` pairs from main on every mount — under `StrictMode` the
 * second mount races the first, and both terminate non-deterministically
 * when the host IPC handler ships only one port pair per `taucad:
 * connect-kernel` request. Skipping `StrictMode` keeps the e2e
 * deterministic; the example only exercises the runtime topology, not React
 * concurrency. */
createRoot(container).render(<App />);
