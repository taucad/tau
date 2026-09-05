import { describe, expect, it } from 'vitest';

import {
  actionDigest,
  canonicalizeComputeAction,
  contentDigest,
  digestAction,
  digestContent,
  digestScene,
  sceneDigest,
} from '#digest.js';
import type { ComputeAction } from '#types.js';

const expectedHelloDigest = 'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

const createAction = (): ComputeAction => ({
  schemaVersion: 1,
  namespace: 'test.kernel',
  producer: {
    id: 'test-kernel',
    version: '1.2.3',
    implementationAssets: [],
  },
  operation: 'mesh',
  inputs: [],
  arguments: { quality: 'preview', chordTolerance: 0.1 },
  environment: null,
  codec: { id: 'application/test', version: '1' },
});

describe('SHA-256 digests', () => {
  it('hashes bytes with a stable lowercase representation', async () => {
    await expect(digestContent({ bytes: new TextEncoder().encode('hello') })).resolves.toBe(expectedHelloDigest);
  });

  it('hashes actions independently of object insertion order', async () => {
    const first = createAction();
    const second: ComputeAction = {
      ...first,
      arguments: { chordTolerance: 0.1, quality: 'preview' },
    };

    await expect(digestAction({ action: first })).resolves.toBe(await digestAction({ action: second }));
    expect(canonicalizeComputeAction(first)).toBe(canonicalizeComputeAction(second));
  });

  it('hashes scene values through the same canonical byte boundary', async () => {
    await expect(digestScene({ value: { frame: 3, visible: true } })).resolves.toMatch(/^sha256:[\da-f]{64}$/);
  });

  it.each([contentDigest, actionDigest, sceneDigest])('validates externally supplied branded digests', (parse) => {
    expect(parse({ value: expectedHelloDigest })).toBe(expectedHelloDigest);
    expect(() => parse({ value: expectedHelloDigest.toUpperCase() })).toThrow(TypeError);
    expect(() => parse({ value: 'sha256:1234' })).toThrow(TypeError);
  });
});
