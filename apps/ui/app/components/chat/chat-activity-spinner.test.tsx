// @vitest-environment jsdom
// oxlint-disable-next-line import/no-unassigned-import -- registers DOM matchers for this test module
import '@testing-library/jest-dom/vitest';
import { Component } from 'react';
import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatActivitySpinner } from '#components/chat/chat-activity-spinner.js';

/* PL7 blueprint FP9 (D20, row 9): the liquid-metal spinner is decorative. Its chunk failing to load (a reset
 * connection on the live build) degrades the spinner to the flat one; it never takes down the chat panel. */
vi.mock('#components/geometry/loader/metal-morph-spinner.js', () => {
  throw new TypeError('Failed to fetch dynamically imported module: https://tau.new/assets/metal-morph-spinner-D7.js');
});

type BoundaryState = { readonly caught?: unknown };

/** Stands in for the chat panel's boundary (`FloatingPanelContent`), which showed "Chat Unavailable". */
class PanelBoundary extends Component<{ readonly children: ReactNode }, BoundaryState> {
  public static getDerivedStateFromError(error: unknown): BoundaryState {
    return { caught: error };
  }

  public override state: BoundaryState = {};

  public override render(): ReactNode {
    return this.state.caught === undefined ? this.props.children : <p role='alert'>Chat Unavailable</p>;
  }
}

describe('ChatActivitySpinner', () => {
  it('should fall back to the flat spinner, keeping its panel, when its chunk fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = render(
      <PanelBoundary>
        <p>Working on it</p>
        <ChatActivitySpinner />
      </PanelBoundary>,
    );

    // The rejected import settles, and React renders what follows it.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Working on it')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="chat-activity-spinner"] svg')).not.toBeNull();
  });
});
