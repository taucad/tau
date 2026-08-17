import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import type { ImportResult } from 'occt-import-js';
import { OcctLoader } from '#loaders/occt.loader.js';

// Expose the protected mapToGlb seam without touching the WASM parse step.
class TestableOcctLoader extends OcctLoader {
  public async mapToGlbPublic(parseResult: ImportResult): Promise<Uint8Array<ArrayBuffer>> {
    return this.mapToGlb(parseResult, { format: 'step' });
  }
}

const emptyResult = (rootName: string | undefined): ImportResult =>
  ({
    success: true,
    root: { name: rootName!, meshes: [], children: [] },
    meshes: [],
  }) satisfies ImportResult;

const sceneName = async (glb: Uint8Array<ArrayBuffer>): Promise<string> => {
  const document = await new NodeIO().readBinary(glb);
  return document.getRoot().listScenes()[0]?.getName() ?? '';
};

describe('OcctLoader mapToGlb', () => {
  it('should not throw and leave the scene name unset when root.name is undefined', async () => {
    const loader = new TestableOcctLoader();
    const glb = await loader.mapToGlbPublic(emptyResult(undefined));
    expect(await sceneName(glb)).toBe('');
  });

  it('should set the scene name from a trimmed root.name', async () => {
    const loader = new TestableOcctLoader();
    const glb = await loader.mapToGlbPublic(emptyResult('  Part  '));
    expect(await sceneName(glb)).toBe('Part');
  });
});
