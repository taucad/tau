// @vitest-environment node

/**
 * Replicad — STEP `?raw` / `with { type: 'text' }` round-trip.
 *
 * Locks in that the in-browser esbuild bundler's query-suffix and TC39
 * import-attribute support actually round-trip a STEP file through replicad's
 * `importSTEP` and produce the expected geometry. Both syntaxes are exercised
 * end-to-end so they cannot regress independently.
 *
 * Fixture: `fixtures/cube.step` is a 10 mm cube spanning [-5, 5] in each
 * axis. After meshing through OCCT we expect a bounding box of 10x10x10 mm
 * (0.01 m in glTF spec units) centred at the origin.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { describe, it } from 'vitest';
import { replicadKernel } from '#replicad.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import { assertSuccess, createGeometryTestHelpers, createTestGeometry } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const fixturesDirectory = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'fixtures');
const cubeStepPath = path.join(fixturesDirectory, 'cube.step');
const cubeStepContent = fs.readFileSync(cubeStepPath, 'utf8');

const expectedSize: [number, number, number] = [0.01, 0.01, 0.01];
const expectedCenter: [number, number, number] = [0, 0, 0];
const tolerance = 0.0005;

const geometryHelpers = createGeometryTestHelpers();
const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });

// ---------------------------------------------------------------------------
// Source variants — same geometry, different bundler syntax
// ---------------------------------------------------------------------------

/** Vite-style `?raw` query suffix (the case in the original screenshot). */
const viteRawSource = `
  import { importSTEP as importStep } from 'replicad';
  import cubeStep from './lib/cube.step?raw';

  export const defaultParams = {};

  export default async function main() {
    const stepBlob = new Blob([cubeStep], { type: 'model/step' });
    return await importStep(stepBlob);
  }
`;

/** TC39 `with { type: 'text' }` import-attribute syntax. */
const tc39TextAttributeSource = `
  import { importSTEP as importStep } from 'replicad';
  import cubeStep from './lib/cube.step' with { type: 'text' };

  export const defaultParams = {};

  export default async function main() {
    const stepBlob = new Blob([cubeStep], { type: 'model/step' });
    return await importStep(stepBlob);
  }
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Replicad — STEP raw-import bundler round-trip', { timeout: 120_000 }, () => {
  for (const { label, source } of [
    { label: 'Vite-style `?raw` query suffix', source: viteRawSource },
    { label: "TC39 `with { type: 'text' }` import attribute", source: tc39TextAttributeSource },
  ]) {
    it(`should import the cube.step fixture via ${label} and produce a 10 mm cube`, async () => {
      const result = await createTestGeometry({
        runtime,
        files: { 'main.ts': source, 'lib/cube.step': cubeStepContent },
        mainFile: 'main.ts',
        parameters: {},
      });

      assertSuccess(result, `replicad createGeometry — ${label}`);

      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
      await geometryHelpers.expectBoundingBoxSize(result, expectedSize, tolerance);
      await geometryHelpers.expectBoundingBoxCenter(result, expectedCenter, tolerance);
    });
  }

  it('should bundle the ?raw asset as a JS string starting with `ISO-10303-21;`', async () => {
    // Validate esbuild's `text` loader contract from inside the bundled module:
    // the default export must be a string and start with the canonical STEP magic,
    // otherwise main() throws and createGeometry surfaces the error to the test.
    // Belt-and-braces alongside the bbox tests above.
    const guardedSource = `
      import { importSTEP as importStep } from 'replicad';
      import cubeStep from './lib/cube.step?raw';

      export const defaultParams = {};

      export default async function main() {
        if (typeof cubeStep !== 'string') {
          throw new Error('Expected cubeStep to be a string but got ' + typeof cubeStep);
        }
        if (!cubeStep.startsWith('ISO-10303-21;')) {
          throw new Error('Expected cubeStep to start with ISO-10303-21; but got ' + cubeStep.slice(0, 32));
        }
        const stepBlob = new Blob([cubeStep], { type: 'model/step' });
        return await importStep(stepBlob);
      }
    `;

    const result = await createTestGeometry({
      runtime,
      files: { 'main.ts': guardedSource, 'lib/cube.step': cubeStepContent },
      mainFile: 'main.ts',
      parameters: {},
    });

    // `assertSuccess` fails loudly with the thrown error message if the loader contract breaks.
    assertSuccess(result, 'replicad createGeometry — ?raw text-loader contract');
    await geometryHelpers.expectValidGltf(result);
  });
});
