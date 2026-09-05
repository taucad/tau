import { describe, expect, it } from 'vitest';
import { compactionFailureKindForError } from '#api/chat/utils/compaction-errors.js';

describe('compaction failure kinds', () => {
  it('recognizes a newly catalogued failure kind without a second guard edit', () => {
    expect(compactionFailureKindForError({ failureKind: 'state_update_failed' })).toBe('state_update_failed');
  });
});
