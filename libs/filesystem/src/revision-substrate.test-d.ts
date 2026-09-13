import { describe, expectTypeOf, it } from 'vitest';
import type { RevisionId } from '#revision-tree.js';

describe('revision substrate opaque identity', () => {
  it('does not admit plain strings where authority identities are required', () => {
    expectTypeOf<RevisionId>().toExtend<string>();

    // @ts-expect-error plain strings require runtime validation before they become revision identities
    const revision: RevisionId = 'rev-unvalidated';
    expectTypeOf(revision).toEqualTypeOf<RevisionId>();
  });
});
