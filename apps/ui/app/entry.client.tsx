import { HydratedRouter } from 'react-router/dom';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { observeLongAnimationFrames } from '#lib/renderer-telemetry.js';

/* D21: started before hydration and never stopped, so the frames that block the first paint are
 * recorded too (the observer is buffered, and the platform only reports frames over 50 ms). */
observeLongAnimationFrames();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
