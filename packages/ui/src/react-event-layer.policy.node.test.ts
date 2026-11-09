// @vitest-environment node
/*
 * Guards charter invariant I10 for packages/ui/src: React effects never send, subscribe or
 * time, and `getSnapshot()` stays inside `select*` helpers. Today's sites are
 * held per file in react-event-layer.ceiling.json, which only goes down. Remove
 * a site and lower its line (delete it at 0); a file moved elsewhere carries
 * its line with it (charter D21). The counter is `@taucad/oxlint/react-event-layer`.
 */

import { checkReactEventLayerCeiling } from '@taucad/oxlint/react-event-layer';
import { describe, expect, it } from 'vitest';

describe('React event layer ceiling', () => {
  it('holds every file at or below its committed ceiling', () => {
    const problems = checkReactEventLayerCeiling({
      manifest: new URL('react-event-layer.ceiling.json', import.meta.url),
      directories: [new URL('.', import.meta.url)],
    });
    expect(problems, problems.join('\n')).toEqual([]);
  }, 60_000);
});
