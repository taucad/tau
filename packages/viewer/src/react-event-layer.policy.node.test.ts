// @vitest-environment node
/*
 * Holds the React event layer in packages/viewer/src at zero (react-policy 5.5): no effect sends, subscribes or runs a
 * timer, and no component or hook reads `getSnapshot()` outside a `select*` helper. The three named exceptions below
 * are the boundaries where a prop or React context is the only source of a value; each sends it as one event from one
 * effect and names its boundary in a comment. The ceiling manifest stays empty. The counter is
 * `@taucad/oxlint/react-event-layer`.
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
        scope: [new URL('.', import.meta.url)],
        exceptions: {
          'packages/viewer/src/model-viewer.tsx': {
            sites: 1,
            reason: "The standalone viewer's artifact prop, sent as updateArtifact or clearArtifact (inventory C10).",
          },
          'packages/viewer/src/hooks/use-graphics.tsx': {
            sites: 1,
            reason:
              "The viewer environment's theme, accent and contrast from React context, sent as viewerEnvironmentChanged (G8).",
          },
          'packages/viewer/src/parameters/use-field-edits.ts': {
            sites: 1,
            reason: "A parameter field's authority prop, sent as observed (programme control, G12).",
          },
        },
      },
    });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
