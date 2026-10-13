import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { connectHost } from '#app/host-bridge.js';
import { ViewerPage } from '#app/viewer-page.jsx';
import '#app/styles.css';

const root = document.querySelector('#root');
if (root === null) {
  throw new Error('The viewer page has no #root element.');
}

try {
  const bridge = await connectHost();
  createRoot(root).render(
    <StrictMode>
      <ViewerPage bridge={bridge} />
    </StrictMode>,
  );
} catch (error) {
  root.textContent = `The Tau viewer could not reach its host: ${error instanceof Error ? error.message : String(error)}`;
}
