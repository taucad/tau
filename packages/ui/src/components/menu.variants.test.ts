import { describe, expect, it } from 'vitest';
import { menuContentVariants, menuItemVariants } from '#components/menu.variants.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

describe('menu variants', () => {
  it('composes shared menu surface chrome with menu-specific layout', () => {
    const classes = menuContentVariants().split(' ');

    expect(classes).toEqual(expect.arrayContaining(popoverSurfaceVariants({ appearance: 'menu' }).split(' ')));
    expect(classes).toEqual(expect.arrayContaining(['z-50', 'flex', 'min-w-32', 'gap-0.5', 'p-0.75']));
    expect(classes).not.toContain('rounded-[10px]');
  });

  it('keeps compact items one radius step inside the shared surface', () => {
    const classes = menuItemVariants().split(' ');

    expect(classes).toContain('rounded-sm');
    expect(classes).not.toContain('rounded-md');
  });

  it('keeps animation opt-in', () => {
    expect(menuContentVariants().split(' ')).not.toContain('data-[state=open]:animate-in');
    expect(menuContentVariants({ animated: true }).split(' ')).toContain('data-[state=open]:animate-in');
  });
});
