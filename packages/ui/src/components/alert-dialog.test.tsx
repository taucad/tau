import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '#components/alert-dialog.js';

/* T-A4.1 (D4.7): an alert dialog is bound to the dynamic viewport and scrolls its body on both axes, unless it declares
 * that it owns its scroller. */
describe('AlertDialogContent scroll bound', () => {
  it('should bound the content to the viewport and scroll it on both axes', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    expect(screen.getByRole('alertdialog')).toHaveClass(
      'max-h-[calc(100dvh-2rem)]',
      'overflow-y-auto',
      'overflow-x-auto',
    );
  });

  it("should leave the scrolling to an alert dialog that declares scroll 'contained'", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent scroll='contained'>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toHaveClass('max-h-[calc(100dvh-2rem)]');
    expect(dialog).not.toHaveClass('overflow-y-auto');
    expect(dialog).not.toHaveClass('overflow-x-auto');
  });
});
