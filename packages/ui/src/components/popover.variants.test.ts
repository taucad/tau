import { describe, expect, it } from 'vitest';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

const appearances = {
  panel: ['border', 'bg-popover', 'text-popover-foreground', 'shadow-md'],
  menu: ['border-0', 'bg-popover', 'text-popover-foreground', 'shadow-menu'],
  picker: ['bg-popover', 'text-popover-foreground', 'shadow-md', 'ring-1', 'ring-foreground/10'],
  inverse: ['border', 'border-black', 'bg-black', 'text-white', 'dark:border-muted'],
} as const;

describe('popoverSurfaceVariants', () => {
  for (const [appearance, expectedClasses] of Object.entries(appearances)) {
    it(`provides invariant geometry and ${appearance} chrome`, () => {
      const classes = popoverSurfaceVariants({ appearance: appearance as keyof typeof appearances }).split(' ');

      expect(classes.filter((className) => className.startsWith('rounded-'))).toEqual(['rounded-md']);
      expect(classes).toContain('outline-hidden');
      expect(classes).toEqual(expect.arrayContaining([...expectedClasses]));
    });
  }

  it('uses the panel appearance by default', () => {
    expect(popoverSurfaceVariants().split(' ')).toEqual(
      expect.arrayContaining(['rounded-md', 'border', 'bg-popover', 'text-popover-foreground', 'shadow-md']),
    );
  });
});
