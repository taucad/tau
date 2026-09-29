import { describe, expectTypeOf, it } from 'vitest';
import type { DescribeInput, EvaluateInput, ResolveInput } from '@taucad/runtime/kernel';

describe('@taucad/runtime/kernel entry path authoring', () => {
  it('exposes one entryPath name across kernel evaluation phases', () => {
    expectTypeOf<ResolveInput['entryPath']>().toEqualTypeOf<string>();
    expectTypeOf<DescribeInput['entryPath']>().toEqualTypeOf<string>();
    expectTypeOf<EvaluateInput<undefined>['entryPath']>().toEqualTypeOf<string>();
  });
});
