import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as entry from '#index.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('@taucad/python-kernel-core', () => {
  it('exports the backend-neutral Python kernel helpers and no plugin', () => {
    expect(entry).not.toHaveProperty('plugin');
    expect(Object.keys(entry).toSorted()).toEqual([
      'PythonWorkerError',
      'bindPythonKernel',
      'createPythonSeal',
      'createPythonSession',
      'createPythonWorkspaceMirror',
      'definePythonKernelAdopter',
      'pyprojectPath',
      'pythonArtifactSchema',
      'pythonClosureSchema',
      'pythonIssueSchema',
      'pythonKernelModules',
      'pythonKernelOptionsSchema',
      'pythonLaunchSet',
      'pythonLibraryVersionMismatches',
      'pythonOptionsFromClosure',
      'pythonProtocolVersion',
      'pythonReadySchema',
      'pythonResponseSchema',
      'pythonSupportModules',
    ]);
  });

  it('lists exactly the tau_kernel modules the package ships', () => {
    const shipped = readdirSync(join(packageRoot, 'python', 'tau_kernel'))
      .filter((name) => name.endsWith('.py'))
      .map((name) => `tau_kernel/${name}`)
      .toSorted();

    expect([...entry.pythonKernelModules].toSorted()).toEqual(shipped);
  });
});
