/**
 * R2 — `extractInlineFileSystem` behaviour for opaque {@link RuntimeFileSystem} handles.
 */

import { describe, it, expect } from 'vitest';

import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { extractInlineFileSystem, wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

describe('extractInlineFileSystem (R2)', () => {
  it('should return undefined when fs is undefined', () => {
    expect(extractInlineFileSystem(undefined)).toBeUndefined();
  });

  it('should return the underlying RuntimeFileSystemBase for inline fs created via fromMemoryFs', async () => {
    const pathA = '/a.txt';
    const opaque = fromMemoryFs({ [pathA]: 'x' });
    const base = extractInlineFileSystem(opaque);
    expect(base).toBeDefined();
    await expect(base!.readFile(pathA, 'utf8')).resolves.toBe('x');
  });

  it('should throw a TypeError with expected message for channel bridged opaque fs', async () => {
    const pair = new MessageChannel();
    const channelFs = wrapAsRuntimeFileSystem({
      kind: 'channel',
      port: pair.port2,
      dispose(): void {
        pair.port2.close();
      },
    });

    expect(() => extractInlineFileSystem(channelFs)).toThrow(TypeError);
    try {
      extractInlineFileSystem(channelFs);
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).message).toBe(`extractInlineFileSystem: expected inline fs, received 'channel'`);
    }
    pair.port1.close();
  });
});

/**
 * Per-binding-fresh contract — pins the spec/instance harmonisation
 * documented in
 * `docs/research/runtime-filesystem-spec-instance-harmonisation.md`.
 *
 * Every `extractInlineFileSystem(opaque)` invocation must mint a fresh
 * `RuntimeFileSystemBase`. Two `RuntimeClient`s materialised from the
 * same module-level `fromMemoryFs(seed)` value therefore observe
 * isolated state — eliminating the cross-contamination class of bugs
 * by construction (the docs Replicad-reference vase-in-hollow-box
 * regression is the original symptom).
 */
describe('extractInlineFileSystem — per-binding-fresh contract', () => {
  it('should produce isolated RuntimeFileSystemBase instances seeded from the same fromMemoryFs() value', async () => {
    const seedPath = '/seed.ts';
    const opaque = fromMemoryFs({ [seedPath]: 'export default 1;' });

    const fsA = extractInlineFileSystem(opaque);
    const fsB = extractInlineFileSystem(opaque);

    expect(fsA).toBeDefined();
    expect(fsB).toBeDefined();
    /* The two bases are distinct objects — `extractInlineFileSystem`
     * mints a new instance per call rather than aliasing one captured
     * live `RuntimeFileSystemBase`. */
    expect(fsA).not.toBe(fsB);

    /* Both inherit the seeded files. */
    await expect(fsA!.readFile(seedPath, 'utf8')).resolves.toBe('export default 1;');
    await expect(fsB!.readFile(seedPath, 'utf8')).resolves.toBe('export default 1;');

    /* Mutations on A are invisible to B and vice versa — the structural
     * fix that closes the docs Replicad-reference cross-contamination. */
    const sharedKey = '/main.ts';
    await fsA!.writeFile(sharedKey, 'A');
    await fsB!.writeFile(sharedKey, 'B');
    await expect(fsA!.readFile(sharedKey, 'utf8')).resolves.toBe('A');
    await expect(fsB!.readFile(sharedKey, 'utf8')).resolves.toBe('B');
  });

  it('should defensively snapshot seed files at fromMemoryFs() call time, not at create() call time', async () => {
    const seedKey = '/seed.ts';
    const extraKey = '/extra.ts';
    const seeds: Record<string, string> = { [seedKey]: 'initial' };
    const opaque = fromMemoryFs(seeds);

    /* Mutating the supplied seed object after wrapping must not affect
     * future `create()` invocations — the spec captures a snapshot. */
    seeds[seedKey] = 'mutated';
    seeds[extraKey] = 'should not appear';

    const fs = extractInlineFileSystem(opaque)!;
    await expect(fs.readFile(seedKey, 'utf8')).resolves.toBe('initial');
    await expect(fs.exists(extraKey)).resolves.toBe(false);
  });

  it('should produce an isolated base even when the spec has no seed files', async () => {
    const opaque = fromMemoryFs();

    const fsA = extractInlineFileSystem(opaque)!;
    const fsB = extractInlineFileSystem(opaque)!;

    await fsA.writeFile('/a.ts', 'A');
    await expect(fsB.exists('/a.ts')).resolves.toBe(false);
  });
});
