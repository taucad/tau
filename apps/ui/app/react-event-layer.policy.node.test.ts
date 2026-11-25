// @vitest-environment node
/*
 * Holds the React event layer in apps/ui/app: effects that send, subscribe or
 * run timers, and `getSnapshot()` reads in components and hooks outside `select*` helpers,
 * move to actors. Today's sites are held per file in react-event-layer.ceiling.json, which only goes down. Remove
 * a site and lower its line (delete it at 0); a file moved elsewhere carries
 * its line with it. The counter is `@taucad/oxlint/react-event-layer`.
 *
 * The graphics-scope rows the inventory names are held at zero since G12 (charter D17, I10): the record stores, the
 * project machine and the layout controller; the view settings host was deleted in A7c, when the project runtime took
 * its flush. The entries and workbench record hosts keep
 * their ceiling until the layout and navigation charter (R12), and the rest of the app keeps its ratchet.
 *
 * The three instruments, the section-view e2e bridge, the Onshape render profile route and the chat debug probes,
 * are held at zero with named exceptions at their exact counts (app state orchestration charter D15, inventory rows
 * X1 to X3). A new probe in one of them is a deliberate one-line edit here.
 *
 * The app state orchestration programme's zero scope (charter D15, I16; plan § 4 A10): its scoped files, the modules
 * and machines it created or rewrote, the whole of `runtime/` and `workbench-records/`, and the files later lanes
 * added to the ownership ratchet. One boundary keeps a site: `project-route-intent.tsx` reports each committed route
 * to focus, and the router's commit is its only source (boundary 1). Boundary 2, the runtime's start after hydration
 * in `runtime/app-runtime-provider.tsx`, is not a counted site; the ownership ratchet holds it. A new boundary needs a
 * ruling, and a file added to the programme's paths joins this list; the second row fails a ratchet file left out.
 * The library machines and runtime that moved to `apps/libs/project-library` (#2500) are held at zero there by that
 * library's empty ceiling, as is the revision clients' lease in `apps/libs/revisions-ui`.
 */

// Test-only tooling import: kept out of the Nx graph so lint-rule churn in libs/oxlint does not invalidate this
// project's test and typecheck cache; nx.json lists the helper as a `test` and `typecheck` input instead.
// nx-ignore-next-line
import { checkReactEventLayerCeiling } from '@taucad/oxlint/react-event-layer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The zero scope's files and directories (`URL`s ending in `/` are directories). */
const zeroScope = [
  new URL('chat-clients/debug-probes.tsx', import.meta.url),
  new URL('components/geometry/debug/section-view-test-bridge.tsx', import.meta.url),
  new URL('hooks/chat-session-store.fixture.tsx', import.meta.url),
  new URL('hooks/use-file-manager.tsx', import.meta.url),
  new URL('hooks/use-project-manager.tsx', import.meta.url),
  new URL('hooks/use-project.tsx', import.meta.url),
  new URL('hooks/use-projects.ts', import.meta.url),
  new URL('hooks/use-revision-status.ts', import.meta.url),
  new URL('hooks/use-sessions.tsx', import.meta.url),
  new URL('hooks/use-wait-start.ts', import.meta.url),
  new URL('lib/frame-hint-draft.ts', import.meta.url),
  new URL('lib/frame-hint.ts', import.meta.url),
  new URL('machines/focus.machine.ts', import.meta.url),
  new URL('machines/focus.route-state.ts', import.meta.url),
  new URL('machines/github-credential-renewal.machine.ts', import.meta.url),
  new URL('machines/project-session.machine.ts', import.meta.url),
  new URL('machines/project.machine.ts', import.meta.url),
  new URL('machines/session-file-check.machine.ts', import.meta.url),
  new URL('machines/sessions.machine.ts', import.meta.url),
  new URL('routes/[__e2e].onshape-render-profile/route.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/chat-viewer-dockview.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/chat-workbench-dockview.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/focused-project-view.session.ts', import.meta.url),
  new URL('routes/w.$workspace.$project/focused-project-view.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/project-live-sessions.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/project-route-intent.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/project-route.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/project-sync-placeholder.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/project-workspace-context.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/workbench-checkout-root.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/workbench-layout-controller.shim.ts', import.meta.url),
  new URL('routes/w.$workspace.$project/workbench-layout-controller.ts', import.meta.url),
  new URL('routes/w.$workspace.$project/workbench-record-host.tsx', import.meta.url),
  new URL('routes/w.$workspace.$project/workspace-frame.tsx', import.meta.url),
  new URL('runtime/', import.meta.url),
  new URL('services/sessions-store.ts', import.meta.url),
  new URL('workbench-records/', import.meta.url),
];

describe('React event layer ceiling', () => {
  it('should hold every file at or below its committed ceiling', () => {
    const problems = checkReactEventLayerCeiling({
      manifest: new URL('react-event-layer.ceiling.json', import.meta.url),
      directories: [new URL('.', import.meta.url)],
      zero: {
        scope: zeroScope,
        exceptions: {
          'apps/ui/app/routes/w.$workspace.$project/project-route-intent.tsx': {
            sites: 1,
            reason:
              'boundary: the committed route reported to focus; the router commit is its one source (charter D15, boundary 1)',
          },
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

  it('should hold every apps/ui/app file in the ownership ratchet inside the zero scope', () => {
    const ratchet = JSON.parse(
      readFileSync(new URL('app-state-ownership.ratchet.json', import.meta.url), 'utf8'),
    ) as Readonly<Record<'components' | 'modules', Readonly<{ files: readonly string[] }>>>;
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const scoped = zeroScope.map((entry) => fileURLToPath(entry).slice(root.length));
    const outside = [...ratchet.components.files, ...ratchet.modules.files]
      .filter((file) => file.startsWith('apps/ui/app/'))
      .filter((file) => !scoped.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry)));
    expect(outside).toEqual([]);
  });
});
