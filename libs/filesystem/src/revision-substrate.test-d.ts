import { describe, expectTypeOf, it } from 'vitest';
import type { MaterializedWorkspaceId } from '#workspace-identity.js';
import type { RevisionBranchName } from '#revision-authority.js';
import type { RevisionId } from '#revision-tree.js';

describe('revision substrate opaque identities', () => {
  it('does not admit plain strings where authority identities are required', () => {
    expectTypeOf<RevisionId>().toExtend<string>();
    expectTypeOf<MaterializedWorkspaceId>().toExtend<string>();
    expectTypeOf<RevisionBranchName>().toExtend<string>();

    // @ts-expect-error plain strings require runtime validation before they become revision identities
    const revision: RevisionId = 'rev-unvalidated';
    // @ts-expect-error plain strings require runtime validation before they become workspace identities
    const workspace: MaterializedWorkspaceId = 'workspace-unvalidated';
    // @ts-expect-error plain strings require runtime validation before they become branch names
    const branch: RevisionBranchName = 'main';
    expectTypeOf(revision).toEqualTypeOf<RevisionId>();
    expectTypeOf(workspace).toEqualTypeOf<MaterializedWorkspaceId>();
    expectTypeOf(branch).toEqualTypeOf<RevisionBranchName>();
  });
});
