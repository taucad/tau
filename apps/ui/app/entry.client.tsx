import { HydratedRouter } from 'react-router/dom';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { observeLongAnimationFrames } from '@taucad/viewer/lib/renderer-telemetry';
import { startErrorReporting } from '#lib/error-reporting.js';
import {
  installStaleBuildRecovery,
  recoverFromCaughtError,
  recoverFromSdkLoadFailure,
} from '#lib/stale-build-recovery.js';

/* D21: started before hydration and never stopped, so the frames that block the first paint are
 * recorded too (the observer is buffered, and the platform only reports frames over 50 ms). */
observeLongAnimationFrames();

// A failed SDK load may be a chunk a deploy stopped serving: the recovery may reload into the live build.
void startErrorReporting(recoverFromSdkLoadFailure);

// TAU-UI-6: a lazy chunk a deploy stopped serving reloads the page into the live build once.
installStaleBuildRecovery();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      // Every boundary hands a chunk a deploy stopped serving to the recovery; the log stays as React's default.
      // Uncaught errors keep React's default, which reaches the global listeners and error reporting.
      onCaughtError(error, errorInfo) {
        recoverFromCaughtError(error);
        console.error(error, errorInfo.componentStack);
      },
    },
  );
});
