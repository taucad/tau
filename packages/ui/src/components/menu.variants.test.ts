import { describe, expect, it } from 'vitest';
import { menuContentVariants, menuItemVariants } from '#components/menu.variants.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';
import { cn } from '#utils/cn.js';

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
    expect(classes).toEqual(expect.arrayContaining(['hover:bg-menu-highlight', 'hover:text-foreground']));
  });

  it('keeps animation opt-in', () => {
    expect(menuContentVariants().split(' ')).not.toContain('data-[state=open]:animate-in');
    expect(menuContentVariants({ animated: true }).split(' ')).toContain('data-[state=open]:animate-in');
  });

  it('keeps destructive hover and keyboard highlight after class merging', () => {
    const classes = cn(menuItemVariants({ variant: 'destructive' })).split(' ');

    expect(classes).toEqual(
      expect.arrayContaining([
        'text-menu-destructive-foreground',
        '[&_svg]:text-menu-destructive-foreground!',
        'data-disabled:[&_svg]:text-muted-foreground/50!',
        'hover:bg-menu-highlight-destructive',
        'hover:text-menu-destructive-foreground',
        'hover:[&_svg]:text-menu-destructive-foreground!',
        'focus:bg-menu-highlight-destructive',
        'focus:text-menu-destructive-foreground',
        'focus:[&_svg]:text-menu-destructive-foreground!',
        'data-[highlighted]:bg-menu-highlight-destructive',
      ]),
    );
    expect(classes).not.toContain('focus:bg-menu-highlight');
  });
});
