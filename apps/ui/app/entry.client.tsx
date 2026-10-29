// SB5: first, so its listeners catch what any module below throws before the SDK's handlers are in.
// oxlint-disable-next-line import/no-unassigned-import -- evaluated for its listeners, before every other module.
import '#lib/early-error-buffer.js';
import { HydratedRouter } from 'react-router/dom';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { observeLongAnimationFrames } from '@taucad/viewer/lib/renderer-telemetry';
import { startErrorReporting } from '#lib/error-reporting.js';
import { reactRootErrorHooks } from '#lib/react-root-errors.js';
import { installStaleBuildRecovery, recoverFromSdkLoadFailure } from '#lib/stale-build-recovery.js';

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
    // SB4: caught, uncaught and recoverable errors are each reported once with their component stack; a chunk a
    // deploy stopped serving goes to the recovery instead. React's console output stays.
    reactRootErrorHooks,
  );
});
