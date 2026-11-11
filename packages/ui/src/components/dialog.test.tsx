import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '#components/dialog.js';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '#components/sheet.js';

describe('Dialog close button', () => {
  it('should render the close control as a ghost icon button that keeps its dialog-close slot', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>Change how Tau behaves.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const close = screen.getByRole('button', { name: 'Close' });

    expect(close).toHaveAttribute('data-slot', 'dialog-close');
    expect(close).toHaveClass('size-7', 'hover:bg-accent/50', 'text-muted-foreground', 'top-2.5', 'right-2.5');
    expect(close).not.toHaveClass('opacity-70');
  });

  it('should give a sheet the same close control', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the list.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    const close = screen.getByRole('button', { name: 'Close' });

    expect(close).toHaveAttribute('data-slot', 'sheet-close');
    expect(close).toHaveClass('size-7', 'hover:bg-accent/50', 'text-muted-foreground');
  });
});
