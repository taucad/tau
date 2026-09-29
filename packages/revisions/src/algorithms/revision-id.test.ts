import { describe, expect, expectTypeOf, it } from 'vitest';
import { revisionId as projectRevisionId } from '@taucad/project-core/revision-id';
import type { RevisionId as ProjectRevisionId } from '@taucad/project-core/revision-id';
import { revisionId } from '@taucad/revisions/algorithms';
import type { RevisionId } from '@taucad/revisions/algorithms';

describe('shared revision identity', () => {
  it('should retain one nominal definition and the existing public constructor', () => {
    expectTypeOf<RevisionId>().toEqualTypeOf<ProjectRevisionId>();
    expect(revisionId).toBe(projectRevisionId);
    for (const value of ['a1b2c3', 'revision:project-1.2', 'A'.repeat(256)]) {
      expect(revisionId(value)).toBe(value);
      expect(projectRevisionId(value)).toBe(value);
    }
  });
});
