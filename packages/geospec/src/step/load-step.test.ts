import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadStep } from '#step/index.js';
import type { GeoSpecNativeStepReadResult, GeoSpecOpenCascadeStepModule } from '#step/types.js';

const cubeStepPath = join(import.meta.dirname, '../../../runtime/src/kernels/replicad/__fixtures__/cube.step');
const trianglePayload = {
  triangles: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  brep: {
    validity: { valid: true },
    topologyCounts: { faces: 1 },
  },
  diagnostics: [],
};

const createResult = (payload: unknown, success = true): GeoSpecNativeStepReadResult => ({
  success,
  evidenceJson: () => JSON.stringify(payload),
  delete: vi.fn(),
});

describe('loadStep', () => {
  it(
    'should load STEP evidence through the GeoSpec OpenCascade native stream importer',
    { timeout: 30_000 },
    async () => {
      const subject = await loadStep({
        source: cubeStepPath,
        name: 'cube.step',
      });

      expect(subject.kind).toBe('geometry-subject');
      expect(subject.provenance.loader).toBe('opencascade-step');
      expect(subject.step?.readStrategy).toEqual(
        expect.objectContaining({
          strategy: 'native-stream',
          nativeReadStream: true,
          copiedToEmscriptenFs: false,
        }),
      );
      expect(subject.brep?.validity).toEqual({ valid: true });
      expect(subject.brep?.massProperties?.surfaceArea).toBeCloseTo(600, 6);
      expect(subject.brep?.massProperties?.volume).toBeCloseTo(1000, 6);
      expect(subject.mesh.stats.triangleCount).toBe(12);
    },
  );

  it('should fail when no GeoSpec OpenCascade STEP reader is available', async () => {
    const bytes = await readFile(cubeStepPath);

    await expect(
      loadStep({
        source: new Uint8Array(bytes),
        openCascade: {},
      }),
    ).rejects.toThrow('GeoSpec OpenCascade STEP reader is unavailable');
  });

  it('should report native parse diagnostics without using another importer', async () => {
    const reader = {
      readText: vi.fn(() =>
        createResult(
          {
            diagnostics: [
              {
                code: 'GEOSPEC_STEP_PARSE_FAILED',
                severity: 'error',
                message: 'mock native STEP parser failed',
              },
            ],
          },
          false,
        ),
      ),
    };
    const openCascade: GeoSpecOpenCascadeStepModule = {};
    openCascade.GeoSpecStepStreamReader = reader;

    await expect(
      loadStep({
        source: new TextEncoder().encode('ISO-10303-21; HEADER; ENDSEC; END-ISO-10303-21;'),
        openCascade,
      }),
    ).rejects.toThrow('mock native STEP parser failed');
    expect(reader.readText).toHaveBeenCalledOnce();
  });

  it('should use GeoSpec filesystem fallback when explicitly requested', async () => {
    const writeFile = vi.fn();
    const unlink = vi.fn();
    const readFileNative = vi.fn(() => createResult(trianglePayload));
    const reader = {
      readText: vi.fn(() => createResult({ diagnostics: [] })),
      readFile: readFileNative,
    };
    const openCascade: GeoSpecOpenCascadeStepModule = {};
    openCascade.GeoSpecStepStreamReader = reader;
    openCascade.FS = {
      writeFile,
      unlink,
    };

    const subject = await loadStep({
      source: new Uint8Array(await readFile(cubeStepPath)),
      streaming: 'filesystem',
      openCascade,
    });

    expect(subject.step?.readStrategy).toEqual(
      expect.objectContaining({
        strategy: 'filesystem',
        nativeReadStream: false,
        copiedToEmscriptenFs: true,
      }),
    );
    expect(reader.readText).not.toHaveBeenCalled();
    expect(readFileNative).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalledOnce();
    expect(unlink).toHaveBeenCalledOnce();
  });
});
