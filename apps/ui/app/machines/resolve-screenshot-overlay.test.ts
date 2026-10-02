import { describe, it, expect } from 'vitest';
import type { ActorRefFrom } from 'xstate';
import type { cadMachine } from '#machines/cad.machine.js';
import { buildScreenshotOverlayForPath, resolveScreenshotOverlay } from '#machines/resolve-screenshot-overlay.js';

type CadActorRef = ActorRefFrom<typeof cadMachine>;

/**
 * Hand-rolled stub: `resolveScreenshotOverlay` only ever calls
 * `cadRef.getSnapshot().context.file`, so we don't need a real XState actor.
 */
function stubCadRef(file: { path?: string; filename?: string } | undefined): CadActorRef {
  return { getSnapshot: () => ({ context: { file } }) } as unknown as CadActorRef;
}

describe('resolveScreenshotOverlay', () => {
  it('returns undefined when the cadRef is undefined', () => {
    expect(resolveScreenshotOverlay(undefined)).toBeUndefined();
  });

  it('returns undefined when the snapshot has no file', () => {
    expect(resolveScreenshotOverlay(stubCadRef(undefined))).toBeUndefined();
  });

  it('returns undefined when file.filename is missing even if file.path is set', () => {
    // Locks in the bug fix: we must NOT fall back to `file.path` (the project
    // mount root). If `filename` is absent, the chip should be skipped.
    expect(resolveScreenshotOverlay(stubCadRef({ path: '/projects/proj_X' }))).toBeUndefined();
  });

  it('uses file.filename (project-relative) and ignores file.path (project mount root)', () => {
    // The smoking-gun regression: previously this returned
    // { filePath: '/projects/proj_X', … } because the resolver read `file.path`.
    const overlay = resolveScreenshotOverlay(stubCadRef({ path: '/projects/proj_X', filename: 'lib/part.ts' }));

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
