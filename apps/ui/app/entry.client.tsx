// SB5: first, so its listeners catch what any module below throws before the SDK's handlers are in.
// oxlint-disable-next-line import/no-unassigned-import -- evaluated for its listeners, before every other module.
import '@taucad/ui-core/lib/early-error-buffer';
import { HydratedRouter } from 'react-router/dom';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { observeLongAnimationFrames } from '@taucad/viewer/lib/renderer-telemetry';
import { startErrorReporting } from '#lib/error-reporting.js';
import { readRouteId, routePathInstrumentation } from '#lib/sentry-context.lib.js';
import { routeClassOfRouteId } from '#lib/route-classes.js';
import { scheduleNextStepWarm } from '#lib/warm-next-step.js';
import { reactRootErrorHooks } from '#lib/react-root-errors.js';
import { projectRouteId, registerEagerRouteModules } from '#lib/eager-route-modules.js';
import * as projectRouteModule from '#routes/w.$workspace.$project/route.js';
import { installLiveBuildChecks } from '#lib/stale-build-navigation.js';
import { installStaleBuildRecovery, recoverFromSdkLoadFailure } from '#lib/stale-build-recovery.js';
import { installProjectOpenLoadTiming } from '@taucad/ui-core/lib/project-open-load-timing';
import { setProjectOpenRouteClassReader } from '@taucad/ui-core/lib/project-open-performance';
import { inspect } from '#machines/inspector.js';
import { createAppRuntime } from '#runtime/app-runtime.js';
import { heldAppRuntime, holdAppRuntime } from '#runtime/app-runtime-holder.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';
import { admittedAnalytics } from '#providers/posthog-analytics-provider.js';
import { ENV } from '#environment.config.js';
import { isRemoteHostHarness } from '#utils/remote-host-harness.js';
import { isSafeModeRequested } from '#lib/boot-signals.js';
import { desktopSafeMode } from '#lib/desktop-safe-mode.js';

/* D21: started before hydration and never stopped, so the frames that block the first paint are
 * recorded too (the observer is buffered, and the platform only reports frames over 50 ms). */
observeLongAnimationFrames();

// Local measurement only: inert unless a loopback harness injected its configuration before this ran.
installProjectOpenLoadTiming();

// RR7: each `tau.load` measure names the route class the page shows, so the loading gate splits timings by class.
setProjectOpenRouteClassReader(() => {
  const routeId = readRouteId();
  return routeId === undefined ? undefined : routeClassOfRouteId(routeId)?.id;
});

// A failed SDK load may be a chunk a deploy stopped serving: the recovery may reload into the live build.
void startErrorReporting(recoverFromSdkLoadFailure);

// TAU-UI-6: a lazy chunk a deploy stopped serving reloads the page into the live build once.
installStaleBuildRecovery();

// TAU-UI-S: notice a deploy before the next click; the root's client middleware then loads the next page as a document.
installLiveBuildChecks();

/* D5: the app runtime, created here and held, not started; `AppRuntimeProvider` starts it once after hydration. A
 * hot update keeps the held one (`import.meta.hot.data`), so development never makes a second. */
if (heldAppRuntime() === undefined) {
  /* The workspace telemetry the file-manager host builds captures through the admitted client (A1b, D15). */
  holdAppRuntime(
    createAppRuntime({
      analytics: admittedAnalytics,
      /* The remote-host harness renders no file manager (`root-layout.tsx`), so its runtime starts none. */
      idleFileManagers: isRemoteHostHarness(ENV.TAU_DEBUG, globalThis.location.pathname),
      /* D0: `?safe=1` starts this page load in safe mode, read before the runtime exists. The next navigation drops the
       * parameter, and a reload without it is a normal start. */
      safeMode: isSafeModeRequested(globalThis.location.search) || desktopSafeMode() !== undefined,
      ...(inspect === undefined ? {} : { inspect }),
    }),
  );
}

/* F11 (A15b2): the project route's module is in the entry graph, so a click on a project commits without waiting
 * for it. Before hydration, because `HydratedRouter` reads the module cache when it creates its routes. */
registerEagerRouteModules({ [projectRouteId]: projectRouteModule });

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <AppRuntimeProvider>
        {/* RR7: React Router hands each route's path to the Sentry context, for `route.pattern`. */}
        <HydratedRouter instrumentations={[routePathInstrumentation]} />
      </AppRuntimeProvider>
    </StrictMode>,
    // SB4: caught, uncaught and recoverable errors are each reported once with their component stack; a chunk a
    // deploy stopped serving goes to the recovery instead. React's console output stays.
    reactRootErrorHooks,
  );
});

// PL8 (LB9): once Home is loaded and idle, prefetch the project route's interactive tier, so opening a project
// downloads no module. Nothing under Save-Data, and only the files the warm manifest lists.
scheduleNextStepWarm({
  readRouteClass: () => {
    const routeId = readRouteId();
    return routeId === undefined ? undefined : routeClassOfRouteId(routeId);
  },
});
