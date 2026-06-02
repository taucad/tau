import { describe, expect, it } from 'vitest';
import { GeoSpecModelLoadError, createModelLoader, loadModel, parameterGroups } from '#model/index.js';

const replicadBoxCode = `
  import { makeBaseBox } from 'replicad';

  export default function main() {
    return makeBaseBox(10, 20, 30);
  }
`;
const mainFile = 'main.ts';

describe('loadModel', () => {
  it('should load direct mesh-buffer sources as geometry subjects', async () => {
    const subject = await loadModel({
      source: {
        format: 'mesh-buffer',
        name: 'triangle',
        positions: [0, 0, 0, 10, 0, 0, 0, 10, 0],
        indices: [0, 1, 2],
      },
      parameters: { variant: 'direct' },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ variant: 'direct' });
    expect(subject.provenance.source).toEqual(
      expect.objectContaining({
        kind: 'mesh-buffer',
        name: 'triangle',
      }),
    );
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });

  it('should load Replicad code through the Tau runtime as mesh evidence', { timeout: 30_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: replicadBoxCode },
      file: mainFile,
      kernel: 'replicad',
      format: 'glb',
      parameters: { width: 10 },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.provenance.parameters).toEqual({ width: 10 });
    const sortedSize = [...(subject.mesh.stats.boundingBox?.size ?? [])].sort((a, b) => a - b);
    expect(sortedSize[0]).toBeCloseTo(0.01, 5);
    expect(sortedSize[1]).toBeCloseTo(0.02, 5);
    expect(sortedSize[2]).toBeCloseTo(0.03, 5);
    expect(subject.mesh.stats.meshQuality.surfaceArea).toBeGreaterThan(0);
    expect(Math.abs(subject.mesh.stats.meshQuality.signedVolume)).toBeGreaterThan(0);
  });

  it('should throw typed diagnostics for invalid STEP sources', async () => {
    await expect(
      loadModel({
        source: new Uint8Array([1, 2, 3]),
        format: 'step',
      }),
    ).rejects.toMatchObject({
      name: 'GeoSpecModelLoadError',
      diagnostics: [
        {
          code: 'STEP_LOAD_FAILED',
          severity: 'error',
          suggestion: 'Check that the STEP bytes are valid and that the configured STEP loader can parse this source.',
        },
      ],
    });
  });

  it('should load Replicad code through the Tau runtime as STEP and BRep evidence', { timeout: 60_000 }, async () => {
    const subject = await loadModel({
      code: { [mainFile]: replicadBoxCode },
      file: mainFile,
      kernel: 'replicad',
      format: 'step',
      parameters: { width: 10 },
    });

    expect(subject.kind).toBe('geometry-subject');
    expect(subject.step?.unit).toBe('mm');
    expect(typeof subject.step?.readStrategy.bytesRead).toBe('number');
    expect(subject.brep?.validity).toEqual({ valid: true });
    expect(typeof subject.brep?.massProperties?.volume).toBe('number');
    expect(typeof subject.brep?.massProperties?.surfaceArea).toBe('number');
    expect(subject.mesh.stats.triangleCount).toBeGreaterThan(0);
  });

  it('should expose merged parameter groups for model tests', () => {
    const groups = parameterGroups(
      {
        activeGroup: 'wide',
        order: ['wide', 'narrow'],
        groups: {
          wide: { values: { base: { width: 20 } } },
          narrow: { values: { base: { width: 10 } } },
        },
      },
      { defaults: { base: { width: 5, depth: 7 } }, parameterFile: '.tau/parameters/main.ts.json' },
    );

    expect(groups).toEqual([
      {
        name: 'wide',
        active: true,
        values: { base: { width: 20, depth: 7 } },
        overrides: { base: { width: 20 } },
        provenance: {
          parameterFile: '.tau/parameters/main.ts.json',
          activeGroup: 'wide',
          groupName: 'wide',
        },
      },
      {
        name: 'narrow',
        active: false,
        values: { base: { width: 10, depth: 7 } },
        overrides: { base: { width: 10 } },
        provenance: {
          parameterFile: '.tau/parameters/main.ts.json',
          activeGroup: 'wide',
          groupName: 'narrow',
        },
      },
    ]);
  });

  it('should expose a typed model-load error for instanceof checks', async () => {
    await expect(
      loadModel({
        source: new Uint8Array([1, 2, 3]),
        format: 'step',
      }),
    ).rejects.toBeInstanceOf(GeoSpecModelLoadError);
  });

  it('should create a configured model loader with shared defaults', async () => {
    const loadTriangle = createModelLoader({
      unit: 'cm',
      format: 'mesh-buffer',
    });

    const subject = await loadTriangle({
      source: {
        format: 'mesh-buffer',
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      },
      parameters: { case: 'factory' },
    });

    expect(subject.provenance.unit).toBe('cm');
    expect(subject.provenance.parameters).toEqual({ case: 'factory' });
    expect(subject.mesh.stats.triangleCount).toBe(1);
  });
});
