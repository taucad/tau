import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, build123d } from '#index.js';
import type { build123dKernel } from '#index.js';

const selected = plugin({
  kernels: {
    default: {
      pythonExecutable: '/python',
      workerPath: '/worker.py',
      trustFile: '/trust.json',
      pythonSha256: 'a'.repeat(64),
      workerSha256: 'b'.repeat(64),
      supportFiles: [
        { path: '/analyzer.py', sha256: 'c'.repeat(64) },
        { path: '/glb.py', sha256: 'd'.repeat(64) },
      ],
    },
  },
});

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof build123dKernel>]
>();

expectTypeOf(build123d).toEqualTypeOf(plugin);
