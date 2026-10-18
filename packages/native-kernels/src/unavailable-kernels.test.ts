import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { afterEach, describe, expect, it } from 'vitest';

import { unavailableKernelIssue, unavailableKernelsPlugin } from '#unavailable-kernels.js';
import type { UnavailableNativeKernel } from '#unavailable-kernels.js';

const build123d: UnavailableNativeKernel = {
  kernel: 'build123d',
  package: '@taucad/build123d',
  extensions: ['py'],
  reason: 'not-prepared',
  byteLength: 162_320_195,
};

const picogk: UnavailableNativeKernel = {
  kernel: 'picogk',
  package: '@taucad/picogk',
  extensions: ['cs'],
  reason: 'unsupported-target',
  byteLength: 0,
  detail: '@taucad/picogk declares no runtime variant for this host (linux-x64-glibc; failing axis: os).',
};

/** The issue `KERNEL_NOT_PREPARED` carries for `main.py`, exactly as every surface returns it. */
const notPrepared = {
  code: 'KERNEL_NOT_PREPARED',
  type: 'kernel',
  severity: 'error',
  message:
    'build123d handles ".py" but its runtime (162 MB) is not prepared on this machine. Call prepare_kernel with { "kernel": "build123d" } (or run `tau prepare build123d`), then evaluate again.',
  details: {
    kernel: 'build123d',
    package: '@taucad/build123d',
    extension: '.py',
    byteLength: 162_320_195,
    prepare: { tool: 'prepare_kernel', input: { kernel: 'build123d' } },
  },
};

describe('unavailable native kernels', () => {
  const clients: Array<{ shutdown: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(async (client) => client.shutdown()));
  });

  it('should name the kernel, its package, the download and the exact call that prepares it', () => {
    expect(unavailableKernelIssue(build123d, 'parts/main.py')).toEqual(notPrepared);
    expect(unavailableKernelIssue(picogk, 'main.cs')).toEqual({
      code: 'KERNEL_CAPABILITY_MISSING',
      type: 'kernel',
      severity: 'error',
      message: `picogk handles ".cs" but cannot run on this machine. ${picogk.detail ?? ''}`,
      details: { kernel: 'picogk', package: '@taucad/picogk', extension: '.cs', reason: 'unsupported-target' },
    });
  });

  it("should answer with the host's own refusal when it gives one, and quote an extensionless entry as empty", () => {
    const refusal = 'Quit Tau and open it again to restore the build123d runtime.';

    expect(unavailableKernelIssue({ ...build123d, refusal }, 'Makefile')).toMatchObject({
      code: 'KERNEL_NOT_PREPARED',
      message: refusal,
      details: { extension: '' },
    });
    expect(unavailableKernelIssue({ ...picogk, refusal }, 'main.cs')).toMatchObject({
      code: 'KERNEL_CAPABILITY_MISSING',
      message: refusal,
    });
    expect(unavailableKernelIssue({ ...picogk, detail: undefined }, 'main.cs').message).toBe(
      'picogk handles ".cs" but cannot run on this machine.',
    );
  });

  it('should compose nothing when every native kernel is composed', () => {
    expect(unavailableKernelsPlugin([])).toBeUndefined();
  });

  it('should answer describe, evaluate, render and export of an unprepared file with the refusal', async () => {
    const runtime: AnyRuntimeDefinition = defineRuntime({ plugins: [unavailableKernelsPlugin([build123d, picogk])!] });
    const client = createRuntimeClient<AnyRuntimeDefinition>({
      transport: inProcessTransport({
        runtime,
        fileSystem: fromMemoryFs({ 'main.py': 'from build123d import Box\n', 'main.cs': 'class Model {}\n' }),
      }),
    });
    clients.push(client);

    const description = await client.describe({ source: { path: 'main.py' } });
    const document = client.open({ source: { path: 'main.py' }, watch: false });
    const rendering = await document.view().rendering();
    const exported = await document.export('glb');
    const unsupported = await client
      .open({ source: { path: 'main.cs' }, watch: false })
      .view()
      .rendering();

    expect(description).toMatchObject({ success: false, issues: [notPrepared] });
    expect(rendering).toMatchObject({ superseded: false, rendering: { success: false, issues: [notPrepared] } });
    expect(exported).toMatchObject({ success: false, issues: [notPrepared] });
    expect(unsupported).toMatchObject({
      rendering: {
        success: false,
        issues: [{ code: 'KERNEL_CAPABILITY_MISSING', details: { reason: 'unsupported-target' } }],
      },
    });
  });
});
