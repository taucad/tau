import { describe, expectTypeOf, it } from 'vitest';
import type { CreateGeometryInput, GetDependenciesInput, GetParametersInput } from '@taucad/runtime/kernel';

describe('@taucad/runtime/kernel entry path authoring', () => {
  it('exposes one entryPath name across kernel evaluation phases', () => {
    expectTypeOf<GetDependenciesInput['entryPath']>().toEqualTypeOf<string>();
    expectTypeOf<GetParametersInput['entryPath']>().toEqualTypeOf<string>();
    expectTypeOf<CreateGeometryInput['entryPath']>().toEqualTypeOf<string>();
  });
});
