import { describe, expect, it } from 'vitest';
import { nestedActionVariants } from '#components/nested-action.variants.js';

describe('nestedActionVariants', () => {
  it('should expose the shared hover and open treatment', () => {
    expect(nestedActionVariants()).toContain('hover:bg-nested-action-hover');
    expect(nestedActionVariants()).toContain('data-[state=open]:bg-nested-action-hover');
  });
});
