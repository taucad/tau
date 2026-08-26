import { describe, expect, expectTypeOf, it } from 'vitest';

import * as vmSubpath from '#vm/index.js';
import type { BuiltinModule, BundleResult, VmFileSystem, VmIssue } from '#vm/index.js';

/** The four re-exported types erase at runtime; naming them keeps them checked. */
type ReExportedTypes = [BuiltinModule, BundleResult, VmFileSystem, VmIssue];

describe('vm subpath', () => {
  it('re-exports exactly the published VM contract', () => {
    expect(Object.keys(vmSubpath)).toStrictEqual(['createEsbuildModuleVm']);
    expect(vmSubpath.createEsbuildModuleVm).toBeTypeOf('function');
    expectTypeOf<ReExportedTypes>().not.toBeNever();
  });
});
