import { test, expect } from 'vitest';
import { hello } from '#index.js';

test('hello', () => {
  expect(hello).toBe('world');
});
