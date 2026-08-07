import { describe, it, expect } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { buildScreenshotOverlayForPath, resolveScreenshotOverlay } from '#machines/resolve-screenshot-overlay.js';

type CadActorRef = ActorRefFrom<typeof cadMachine>;

/**
 * Hand-rolled stub: `resolveScreenshotOverlay` only ever calls
 * `cadRef.getSnapshot().context.entryPath`, so we don't need a real XState actor.
 */
function stubCadRef(entryPath: string | undefined): CadActorRef {
  return { getSnapshot: () => ({ context: { entryPath } }) } as unknown as CadActorRef;
}

describe('resolveScreenshotOverlay', () => {
  it('returns undefined when the cadRef is undefined', () => {
    expect(resolveScreenshotOverlay(undefined)).toBeUndefined();
  });

  it('returns undefined when the snapshot has no entry path', () => {
    expect(resolveScreenshotOverlay(stubCadRef(undefined))).toBeUndefined();
  });

  it('uses the project-relative entry path', () => {
    const overlay = resolveScreenshotOverlay(stubCadRef('lib/part.ts'));

    expect(overlay).toEqual({
      filePath: 'lib/part.ts',
      iconKey: 'typescript',
    });
  });
});

describe('buildScreenshotOverlayForPath', () => {
  it('resolves the typescript icon for a `.ts` entry path', () => {
    expect(buildScreenshotOverlayForPath('lib/part.ts')).toEqual({
      filePath: 'lib/part.ts',
      iconKey: 'typescript',
    });
  });

  it('returns an undefined iconKey for an extension with no mapping', () => {
    const overlay = buildScreenshotOverlayForPath('README');
    expect(overlay.filePath).toBe('README');
    expect(overlay.iconKey).toBeUndefined();
  });
});
