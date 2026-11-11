// @vitest-environment node
/*
 * Holds the React event layer in packages/ui/src: effects that send, subscribe or
 * run timers, and `getSnapshot()` reads outside `select*` helpers, move to actors. Today's sites are
 * held per file in react-event-layer.ceiling.json, which only goes down. Remove
 * a site and lower its line (delete it at 0); a file moved elsewhere carries
 * its line with it. The counter is `@taucad/oxlint/react-event-layer`.
 */

// Test-only tooling import: kept out of the Nx graph so lint-rule churn in libs/oxlint does not invalidate this
// project's test and typecheck cache; nx.json lists the helper as a `typecheck` input and this project's
// project.json lists it as a `test` input instead.
// nx-ignore-next-line
import { checkReactEventLayerCeiling } from '@taucad/oxlint/react-event-layer';
import { describe, expect, it } from 'vitest';

describe('React event layer ceiling', () => {
  it('should hold every file at or below its committed ceiling', () => {
    const problems = checkReactEventLayerCeiling({
      manifest: new URL('react-event-layer.ceiling.json', import.meta.url),
      directories: [new URL('.', import.meta.url)],
    });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
