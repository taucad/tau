import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeyShortcut } from '#components/key-shortcut.js';

/*
 * Keyboard hints are for keyboards (I7). Tailwind emits `pointer-coarse:` after the `md:` breakpoint,
 * so the coarse-pointer rule wins over the wide-screen `inline-flex` on a touch tablet.
 */
describe('KeyShortcut', () => {
  it.each(['default', 'ghost', 'tooltip'] as const)(
    'should hide the %s chip on phones and on coarse pointers',
    (variant) => {
      render(
        <KeyShortcut variant={variant} className='ml-2 shrink-0'>
          ⌘K
        </KeyShortcut>,
      );

      expect(screen.getByText('⌘K')).toHaveClass('hidden', 'md:inline-flex', 'pointer-coarse:hidden', 'ml-2');
    },
  );
});
