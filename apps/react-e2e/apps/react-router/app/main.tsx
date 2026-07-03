import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { RuntimeClient } from './runtime-client';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RuntimeClient />,
  },
]);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

createRoot(rootElement).render(<RouterProvider router={router} />);
