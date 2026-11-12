// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CoachMark } from '#components/coach-mark.js';
import { popoverSurfaceVariants } from '#components/popover.variants.js';

function Harness({ onEscape }: { readonly onEscape?: () => void }): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLButtonElement | undefined>(undefined);
  return (
    <>
      <button
        type='button'
        ref={(node) => {
          setAnchor(node ?? undefined);
        }}
      >
        Export
      </button>
      <label>
        Search
        <input />
      </label>
      <CoachMark anchor={anchor} label='Tour tip 5 of 5: Export and make it' onEscape={onEscape}>
        <p>Export writes the formats this model offers.</p>
        <button type='button'>Next</button>
      </CoachMark>
    </>
  );
}

describe('CoachMark', () => {
  it('is a labelled dialog that is not modal and wears the popover surface', () => {
    render(<Harness />);

    const tip = screen.getByRole('dialog', { name: 'Tour tip 5 of 5: Export and make it' });
    expect(tip).not.toHaveAttribute('aria-modal');
    expect(tip).toHaveAttribute('tabindex', '-1');
    expect(tip).toHaveClass(...popoverSurfaceVariants().split(' '));
    expect(tip.className).not.toMatch(/animate|transition/u);
  });

  it('renders nothing without an anchor', () => {
    render(
      <CoachMark anchor={undefined} label='Tip'>
        Body
      </CoachMark>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('never takes focus when it appears', () => {
    render(<Harness />);

    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(false);
  });

  it('does nothing when the person presses outside it', async () => {
    const onEscape = vi.fn();
    const user = userEvent.setup();
    render(<Harness onEscape={onEscape} />);

    await user.click(screen.getByRole('textbox', { name: 'Search' }));
    await user.click(document.body);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onEscape).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Search' })).not.toHaveFocus();
  });

  it('leaves an Escape pressed in a text box outside the tip untouched', () => {
    const onEscape = vi.fn();
    render(<Harness onEscape={onEscape} />);
    const field = screen.getByRole('textbox', { name: 'Search' });
    field.focus();

    const isNotCancelled = fireEvent.keyDown(field, { key: 'Escape' });

    expect(isNotCancelled).toBe(true);
    expect(onEscape).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('handles Escape when focus is inside the tip', () => {
    const onEscape = vi.fn();
    render(<Harness onEscape={onEscape} />);
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();

    const isNotCancelled = fireEvent.keyDown(next, { key: 'Escape' });

    expect(isNotCancelled).toBe(false);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('portals into the document of its anchor', () => {
    const frame = document.implementation.createHTMLDocument('popped out');
    const anchor = frame.createElement('span');
    frame.body.append(anchor);

    render(
      <CoachMark anchor={anchor} label='Tip in another window'>
        Body
      </CoachMark>,
    );

    expect(frame.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
