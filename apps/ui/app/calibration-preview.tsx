import { createRoot } from 'react-dom/client';
import { ViewerEnvironmentProvider, defaultViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { RenderingProfile } from '#routes/[__e2e].onshape-render-profile/route.js';
import '#styles/global.css';

createRoot(document.querySelector('#root')!).render(
  <ViewerEnvironmentProvider value={defaultViewerEnvironment}>
    <KeyboardProvider>
      <RenderingProfile />
    </KeyboardProvider>
  </ViewerEnvironmentProvider>,
);
