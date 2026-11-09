import { describe, expect, it } from 'vitest';
import { safeguardPatternOf } from '#harness/safeguard-pattern.js';

describe('safeguardPatternOf', () => {
  it.each([
    ['read_file:abc123:def456', 'identical_error'],
    ['read_file:abc123:-', 'identical_error'],
    ['read_file:abc123:any-result', 'identical_call'],
    ['per_target_edit:main.ts:4', 'per_target_edit'],
    ['ping_pong:read_file:abc|edit_file:def', 'ping_pong'],
    ['empty_result:grep:abc123', 'empty_result'],
    ['same_error_different_args:edit_file:EDIT_NOT_FOUND', 'same_error_different_args'],
    ['output-limit:run-1:1:0', 'output_limit'],
  ])('should read %s as %s', (safeguardId, pattern) => {
    expect(safeguardPatternOf(safeguardId)).toBe(pattern);
  });
});
