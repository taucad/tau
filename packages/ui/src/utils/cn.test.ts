import { describe, expect, it } from 'vitest';
import { cn } from '#utils/cn.js';

describe('cn', () => {
  it('lets the touch row height replace a numeric height or size', () => {
    expect(cn('h-8 px-4', 'size-touch-row')).toBe('px-4 size-touch-row');
    expect(cn('min-h-10', 'min-h-touch-row')).toBe('min-h-touch-row');
  });
});
