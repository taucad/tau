/* Fixture: test files may import runtime testing helpers. */

import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { expect, test } from 'vitest';

test('fixture', () => {
  expect(typeof createTestRuntimeClient).toBe('function');
});
