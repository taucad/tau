import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { assertKernelRosterCoverage } from '@taucad/runtime-testing/roster';
import { kernelConfigurations } from '@taucad/types/constants';
import { describe, it } from 'vitest';

import { runtime } from '#runtime.definition.js';

describe('runtime-e2e runtime', () => {
  it('should cover the product catalog, naming why each absent kernel is out of this suite', async () => {
    assertKernelRosterCoverage({
      runtime: await resolveRuntimeDefinition(runtime, undefined),
      catalog: kernelConfigurations,
      omitted: {
        openscad: 'scope: the e2e runtime lists only esbuild, replicad, middleware and tscircuit',
        zoo: 'credentialed: the e2e fixture has no Zoo proxy token',
        build123d: 'native: the e2e runtime is portable; the CLI, GeoSpec and desktop runtimes list build123d()',
        smlibpy: 'native: the e2e runtime is portable; the CLI, GeoSpec and desktop runtimes list smlibpy()',
        picogk: 'native: the e2e runtime is portable; the CLI, GeoSpec and desktop runtimes list picogk()',
      },
    });
  });
});
