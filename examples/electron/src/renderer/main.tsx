import { createRoot } from 'react-dom/client';

import { App } from './app.js';
import './tailwind.css';

const container = document.querySelector('#root');
if (!container) {
  throw new Error('Renderer root element missing');
}

createRoot(container).render(<App />);
