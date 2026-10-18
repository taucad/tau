import { describe, expect, it } from 'vitest';

import { pythonKernelModules, pythonKernelOptionsSchema, pythonSupportModules } from '#python-kernel.js';

const sha = (digit: string): string => digit.repeat(64);
const file = (path: string, digit = 'b') => ({ path, sha256: sha(digit) });

const options = (supportFiles: ReadonlyArray<{ path: string; sha256: string }>) => ({
  pythonExecutable: '/closure/python/bin/python3',
  workerPath: '/closure/tau-worker/worker.py',
  pythonSha256: sha('a'),
  workerSha256: sha('c'),
  supportFiles,
});

const coreFiles = pythonKernelModules.map((module) => file(`/closure/tau-worker/${module}`));

describe('pythonSupportModules', () => {
  it('lists the kernel support modules, then every tau_kernel module, but not the entry', () => {
    expect(pythonSupportModules({ workerModules: ['worker.py', 'helpers.py'] })).toEqual([
      'helpers.py',
      'tau_kernel/analyzer.py',
      'tau_kernel/glb.py',
      'tau_kernel/model.py',
      'tau_kernel/protocol.py',
    ]);
  });
});

describe('pythonKernelOptionsSchema', () => {
  const schema = pythonKernelOptionsSchema({ supportModules: ['helpers.py'] });

  it('accepts the kernel and tau_kernel support modules in any order, with defaulted bounds', () => {
    const parsed = schema.parse(options([...coreFiles.toReversed(), file('/closure/tau-worker/helpers.py')]));

    expect(parsed).toMatchObject({ requestTimeout: 0, maxArtifactBytes: Number.MAX_SAFE_INTEGER });
    expect(parsed.runtimePath).toBeUndefined();
  });

  it('accepts a kernel with no support modules of its own', () => {
    expect(pythonKernelOptionsSchema({ supportModules: [] }).safeParse(options(coreFiles)).success).toBe(true);
  });

  it('refuses a missing module, a stray module, a relative path and a malformed digest', () => {
    const missing = schema.safeParse(
      options([...coreFiles.slice(1), file('/closure/tau-worker/helpers.py'), file('/x/other.py')]),
    );
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe(
      'Support files must contain helpers.py, tau_kernel/analyzer.py, tau_kernel/glb.py, tau_kernel/model.py, tau_kernel/protocol.py',
    );
    expect(schema.safeParse(options(coreFiles)).success).toBe(false);
    expect(
      schema.safeParse({ ...options([...coreFiles, file('/closure/tau-worker/helpers.py')]), workerPath: 'worker.py' })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ ...options([...coreFiles, file('/closure/tau-worker/helpers.py')]), pythonSha256: 'abc' })
        .success,
    ).toBe(false);
  });
});
