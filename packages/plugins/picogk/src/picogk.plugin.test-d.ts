import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, picogk } from '#index.js';

import type { picogkKernel } from '#index.js';

const selected = plugin({
  kernels: {
    default: {
      workerExecutable: '/worker',
      workerSha256: 'a'.repeat(64),
      trustFile: '/trust.json',
      resourceFiles: [{ path: '/resource', sha256: 'b'.repeat(64), label: 'resource' }],
    },
  },
});

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof picogkKernel>]
>();

expectTypeOf(picogk).toEqualTypeOf(plugin);
