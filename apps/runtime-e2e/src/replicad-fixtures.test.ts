/**
 * Replicad kernel regression tests driven by real `@taucad/tau-examples`
 * fixtures. These moved out of `packages/runtime` so the runtime library no
 * longer depends on tau-examples (which would form a project cycle
 * tau-examples → geospec → runtime → tau-examples). They run entirely against
 * the public `@taucad/runtime` surface.
 */
import { describe, it } from 'vitest';
import { replicad as replicadKernel } from '@taucad/runtime/kernels/replicad';
import { assertSuccess, createTestGeometry, createGeometryTestHelpers } from '@taucad/runtime/testing';
import { exampleFixtures } from '#replicad.test-fixtures.js';

const geometryHelpers = createGeometryTestHelpers();

const createGeometry = async (
  input: Omit<Parameters<typeof createTestGeometry>[0], 'definition'>,
): ReturnType<typeof createTestGeometry> => createTestGeometry({ definition: replicadKernel, ...input });

// Longer suite verifying opencascadejs bindings to replicad are all present.
// Kept skipped (as it was in packages/runtime) — enable for a full sweep.
describe.skip('replicad kernel — all example models', () => {
  for (const fixture of exampleFixtures) {
    it(`produces valid geometry for ${fixture.name}`, async () => {
      const result = await createGeometry({
        files: fixture.files,
        mainFile: fixture.mainFile,
        options: { workerOptions: { wasm: 'single' } },
      });

      assertSuccess(result);
      await geometryHelpers.expectValidGltf(result);
      await geometryHelpers.expectMeshCount(result, 1);
    });
  }
});
