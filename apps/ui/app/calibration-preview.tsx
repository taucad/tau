import { createRoot } from 'react-dom/client';
import { ColorProvider } from '#hooks/use-color.js';
import { RenderingProfile } from './routes/[__e2e].onshape-render-profile/route';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <ColorProvider>
    <RenderingProfile />
  </ColorProvider>,
);
