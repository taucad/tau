import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import type { LoadModelOptions } from '#model/types.js';

const packageRoot = resolve(import.meta.dirname, '../..');
const distributionSmokeIt = process.env['GEOSPEC_DIST_SMOKE'] === '1' ? it : it.skip;

type DistributionModelModule = {
  loadModel(options: LoadModelOptions): Promise<GeometrySubject>;
};

describe('built GeoSpec package output', () => {
  distributionSmokeIt(
    'should load STEP evidence from built dist with the copied native WASM',
    { timeout: 30_000 },
    async () => {
      const distributionModelEntry = resolve(packageRoot, 'dist/model/index.mjs');
      const copiedWasm = resolve(packageRoot, 'dist/native/opencascade/geospec_opencascade_single.wasm');
      const cubeStep = resolve(packageRoot, '../runtime/src/kernels/replicad/__fixtures__/cube.step');

      await expect(access(copiedWasm)).resolves.toBeUndefined();
      const { loadModel } = (await import(pathToFileURL(distributionModelEntry).href)) as DistributionModelModule;
      const subject = await loadModel({
        source: new Uint8Array(await readFile(cubeStep)),
        format: 'step',
      });

      expect(subject.provenance.loader).toBe('opencascade-step');
      expect(subject.brep?.validity).toMatchObject({ valid: true });
      expect(subject.brep?.massProperties?.volume).toBeCloseTo(1000, 6);
    },
  );
});
