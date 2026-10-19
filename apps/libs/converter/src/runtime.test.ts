import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { assertKernelRosterCoverage } from '@taucad/runtime-testing/roster';
import { kernelConfigurations } from '@taucad/types/constants';
import { describe, it } from 'vitest';

import { converterRuntime } from '#runtime.js';

// The converter imports and exports files; it runs no project, so every catalog kernel is deliberately absent.
const importOnly = 'import-only runtime: the converter transcodes files and runs no CAD project';

describe('converterRuntime', () => {
  it('should leave every catalog kernel out, by name, as an import-only runtime', async () => {
    assertKernelRosterCoverage({
      runtime: await resolveRuntimeDefinition(converterRuntime, undefined),
      catalog: kernelConfigurations,
      omitted: {
        picogk: importOnly,
        picovoxel: importOnly,
        build123d: importOnly,
        openscad: importOnly,
        replicad: importOnly,
        manifold: importOnly,
        zoo: importOnly,
        jscad: importOnly,
        opencascadejs: importOnly,
        smlib: importOnly,
        smlibpy: importOnly,
        tscircuit: importOnly,
      },
    });
  });
});
