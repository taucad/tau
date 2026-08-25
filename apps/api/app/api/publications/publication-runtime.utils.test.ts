import { describe, expect, it } from 'vitest';
import { packageVersion } from '@taucad/runtime/metadata';
import {
  detectKernelIdsFromRelativePaths,
  resolveRuntimePin,
  runtimePinFromPackageVersion,
} from '#api/publications/publication-runtime.utils.js';

describe('publication-runtime utils', () => {
  it('should detect no kernel for a bare .jscad file the runtime cannot route', () => {
    expect(detectKernelIdsFromRelativePaths(['main.jscad'])).toEqual([]);
  });

  it('should detect the publication runtime kernels', () => {
    expect(detectKernelIdsFromRelativePaths(['main.ts', 'helper.js', 'model.kcl'])).toEqual(
      expect.arrayContaining(['jscad', 'manifold', 'opencascade', 'replicad', 'zoo']),
    );
  });

  it('should derive runtime pin from semver', () => {
    expect(runtimePinFromPackageVersion('1.4.12')).toBe('~1.4.0');
  });

  it('resolveRuntimePin matches meta version pin', () => {
    expect(resolveRuntimePin()).toBe(runtimePinFromPackageVersion(packageVersion));
    expect(resolveRuntimePin()).toMatch(/^~\d+\.\d+\.0$/u);
  });
});
