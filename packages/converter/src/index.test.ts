import { describe, expect, it } from 'vitest';
import { converter } from '~/index.js';

describe('converter', () => {
  it('should return a string', () => {
    expect(converter()).toBe('converter');
  });
});
