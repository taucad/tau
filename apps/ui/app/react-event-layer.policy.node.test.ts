// @vitest-environment node
/*
 * Holds the React event layer in apps/ui/app: effects that send, subscribe or
 * run timers, and `getSnapshot()` reads in components and hooks outside `select*` helpers,
 * move to actors. Today's sites are held per file in react-event-layer.ceiling.json, which only goes down. Remove
 * a site and lower its line (delete it at 0); a file moved elsewhere carries
 * its line with it. The counter is `@taucad/oxlint/react-event-layer`.
 *
 * The graphics-scope rows the inventory names are held at zero since G12 (charter D17, I10): the record stores, the
 * project machine, the view settings host and the layout controller. The entries and workbench record hosts keep
 * their ceiling until the layout and navigation charter (R12), and the rest of the app keeps its ratchet.
 *
 * The three instruments, the section-view e2e bridge, the Onshape render profile route and the chat debug probes,
 * are held at zero with named exceptions at their exact counts (app state orchestration charter D15, inventory rows
 * X1 to X3). A new probe in one of them is a deliberate one-line edit here.
 */

// Test-only tooling import: kept out of the Nx graph so lint-rule churn in libs/oxlint does not invalidate this
// project's test and typecheck cache; nx.json lists the helper as a `test` and `typecheck` input instead.
// nx-ignore-next-line
import { checkReactEventLayerCeiling } from '@taucad/oxlint/react-event-layer';
import { describe, expect, it } from 'vitest';

describe('React event layer ceiling', () => {
  it('should hold every file at or below its committed ceiling', () => {
    const problems = checkReactEventLayerCeiling({
      manifest: new URL('react-event-layer.ceiling.json', import.meta.url),
      directories: [new URL('.', import.meta.url)],
      zero: {
        scope: [
          new URL('chat-clients/debug-probes.tsx', import.meta.url),
          new URL('components/geometry/debug/section-view-test-bridge.tsx', import.meta.url),
          new URL('machines/project.machine.ts', import.meta.url),
          new URL('routes/[__e2e].onshape-render-profile/route.tsx', import.meta.url),
          new URL('routes/w.$workspace.$project/view-settings-sync-host.tsx', import.meta.url),
          new URL('routes/w.$workspace.$project/workbench-layout-controller.ts', import.meta.url),
          new URL('workbench-records/', import.meta.url),
        ],
        exceptions: {
          'apps/ui/app/chat-clients/debug-probes.tsx': {
            sites: 4,
            reason: 'instrument: debug-only probes (inventory X3)',
          },
          'apps/ui/app/components/geometry/debug/section-view-test-bridge.tsx': {
            sites: 17,
            reason: 'instrument: e2e bridge on globalThis.__TAU_SECTION_VIEW_TEST__ (inventory X1)',
          },
          'apps/ui/app/routes/[__e2e].onshape-render-profile/route.tsx': {
            sites: 9,
            reason: 'instrument: profiling route under the e2e prefix (inventory X2)',
          },
        },
      },
    });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
