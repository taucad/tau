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
          new URL('machines/project.machine.ts', import.meta.url),
          new URL('routes/w.$workspace.$project/view-settings-sync-host.tsx', import.meta.url),
          new URL('routes/w.$workspace.$project/workbench-layout-controller.ts', import.meta.url),
          new URL('workbench-records/', import.meta.url),
        ],
      },
    });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
