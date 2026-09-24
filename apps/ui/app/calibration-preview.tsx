import { createRoot } from 'react-dom/client';
import { ColorProvider } from '#hooks/use-color.js';
import { RenderingProfile } from '#routes/[__e2e].onshape-render-profile/route.js';
import '#styles/global.css';

createRoot(document.querySelector('#root')!).render(
  <ColorProvider>
    <RenderingProfile />
  </ColorProvider>,
);
