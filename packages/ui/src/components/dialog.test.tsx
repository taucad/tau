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

/* T-A4.1 (D4.7): a dialog is bound to the dynamic viewport and scrolls its body on both axes, unless it declares that
 * it owns its scroller. */
describe('DialogContent scroll bound', () => {
  it('should bound the content to the viewport and scroll it on both axes', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Preferences</DialogTitle>
          <DialogDescription>Change how Tau behaves.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-y-auto', 'overflow-x-auto');
  });

  it("should leave the scrolling to a dialog that declares scroll 'contained'", () => {
    render(
      <Dialog open>
        <DialogContent scroll='contained'>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Its panes scroll on their own.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveClass('max-h-[calc(100dvh-2rem)]');
    expect(dialog).not.toHaveClass('overflow-y-auto');
    expect(dialog).not.toHaveClass('overflow-x-auto');
  });
});
