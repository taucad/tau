import { expectTypeOf } from 'vitest';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';

import { plugin, smlibpy } from '#index.js';
import type { smlibpyKernel } from '#index.js';

const selected = plugin({
  kernels: {
    default: {
      closure: {
        pythonExecutable: '/python',
        workerPath: '/worker.py',
        pythonSha256: 'a'.repeat(64),
        workerSha256: 'b'.repeat(64),
        supportFiles: [
          { path: '/native_materials.py', sha256: 'c'.repeat(64) },
          { path: '/mechanisms.py', sha256: 'd'.repeat(64) },
          { path: '/tau_kernel/analyzer.py', sha256: 'd'.repeat(64) },
          { path: '/tau_kernel/glb.py', sha256: 'd'.repeat(64) },
          { path: '/tau_kernel/model.py', sha256: 'd'.repeat(64) },
          { path: '/tau_kernel/protocol.py', sha256: 'd'.repeat(64) },
        ],
      },
    },
  },
});

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof smlibpyKernel>]
>();

expectTypeOf(smlibpy).toEqualTypeOf(plugin);
