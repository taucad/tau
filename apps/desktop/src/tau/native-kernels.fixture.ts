// Fixtures of the desktop's native-kernel tests: the frame main posts once the payload store is seeded, naming
// closures whose launch-index rows the kernel option mappers accept. Nothing on disk backs them.
import type { ReceiptFile } from '@taucad/runtime/preparation/node';

import { nativeKernelsFrameType } from '#tau/native-kernels-frame.js';
import type { NativeKernelSlot, NativeKernelsFrame } from '#tau/native-kernels-frame.js';

const row = (path: string, digit: string): ReceiptFile => ({
  path,
  byteLength: 1,
  sha256: digit.repeat(64),
  mode: 0o755,
});

/** Where the fixture's closures claim to live. */
export const fixtureStore = '/store/closures/sha256';

const picogkSlot: NativeKernelSlot = {
  kernel: 'picogk',
  package: '@taucad/picogk',
  extensions: ['cs'],
  closure: {
    package: '@taucad/picogk',
    dependency: 'runtime',
    root: `${fixtureStore}/${'c'.repeat(64)}`,
    closureIntegrity: 'sha256-Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2M=',
    files: [
      row('dotnet/dotnet', '5'),
      row('dotnet/host/fxr/10.0.11/libhostfxr.dylib', '6'),
      row('dotnet/shared/Microsoft.NETCore.App/10.0.11/libhostpolicy.dylib', '7'),
      row('tau-worker/PicoGK.dll', '8'),
      row('tau-worker/Tau.PicoGK.Worker.dll', '9'),
      row('tau-worker/picogk.26.2.dylib', 'a'),
    ],
  },
};

/**
 * The frame main posts for a store holding a sealed Build123d closure and, when `picogk` is set, a sealed PicoGK one.
 * @param options - Which closures the store holds.
 * @returns The frame.
 */
export const nativeKernelsFixture = (options: { readonly picogk: boolean }): NativeKernelsFrame => ({
  type: nativeKernelsFrameType,
  kernels: [
    {
      kernel: 'build123d',
      package: '@taucad/build123d',
      extensions: ['py'],
      closure: {
        package: '@taucad/build123d',
        dependency: 'engine',
        root: `${fixtureStore}/${'b'.repeat(64)}`,
        closureIntegrity: 'sha256-YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=',
        files: [
          row('python/bin/python3', '1'),
          row('tau-worker/analyzer.py', '2'),
          row('tau-worker/glb.py', '3'),
          row('tau-worker/worker.py', '4'),
        ],
      },
    },
    ...(options.picogk ? [picogkSlot] : []),
  ],
});
