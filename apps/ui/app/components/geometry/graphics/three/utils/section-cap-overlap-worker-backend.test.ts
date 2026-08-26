// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClipper2TsBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.js';
import { createSectionCapWorkerBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-overlap-worker-backend.js';
import type {
  CapPolygonBooleanBackend,
  CapPolygonBooleanBackendInfo,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';

const fakeBackend = (info: CapPolygonBooleanBackendInfo): CapPolygonBooleanBackend => ({
  info,
  intersection: () => ({ multiPolygon: [], diagnostics: [] }),
  union: () => ({ multiPolygon: [], diagnostics: [] }),
  difference: () => ({ multiPolygon: [], diagnostics: [] }),
  dispose: () => undefined,
});

describe('section cap overlap worker backend selection', () => {
  it('should prefer the initialized clipper2-wasm backend', async () => {
    const operations = await createSectionCapWorkerBooleanOperations({
      createWasmBackend: async () =>
        fakeBackend({
          name: 'clipper2-wasm',
          version: '0.4.0',
          target: 'wasm',
          initializationTime: 4,
        }),
    });

    expect(operations.info).toEqual({
      name: 'clipper2-wasm',
      version: '0.4.0',
      target: 'wasm',
      initializationTime: 4,
    });
  });

  it('should fall back to clipper2-ts when clipper2-wasm initialization fails', async () => {
    const operations = await createSectionCapWorkerBooleanOperations({
      createWasmBackend: async () => {
        throw new Error('expected wasm init failure');
      },
      createFallbackBackend: createClipper2TsBackend,
    });

    expect(operations.info).toMatchObject({
      name: 'clipper2-ts',
      version: '2.0.1-17',
      target: 'js',
      fallbackFrom: 'clipper2-wasm',
      initError: 'expected wasm init failure',
    });
  });
});
