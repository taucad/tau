import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '#components/sheet.js';

/* T-A4.1 (D4.7): a side sheet scrolls its body on both axes, unless it declares that it owns its scroller. */
describe('SheetContent scroll bound', () => {
  it.each(['right', 'left', 'top', 'bottom'] as const)('should scroll a %s sheet on both axes', (side) => {
    render(
      <Sheet open>
        <SheetContent side={side}>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveClass('max-h-dvh', 'overflow-y-auto', 'overflow-x-auto');
  });

  it("should leave the scrolling to a sheet that declares scroll 'contained'", () => {
    render(
      <Sheet open>
        <SheetContent scroll='contained'>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    const sheet = screen.getByRole('dialog');
    expect(sheet).not.toHaveClass('overflow-y-auto');
    expect(sheet).not.toHaveClass('overflow-x-auto');
  });
});
