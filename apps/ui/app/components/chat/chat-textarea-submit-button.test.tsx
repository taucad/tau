// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';

const renderButton = (properties: {
  readonly status?: string;
  readonly refusal?: string;
  readonly describedBy?: string;
  readonly onSubmit?: () => void;
  readonly onCancel?: () => void;
}) =>
  render(
    <TooltipProvider>
      <p id='reason'>Claude Test can&apos;t read images.</p>
      <ChatTextareaSubmitButton
        status={properties.status ?? 'ready'}
        isSubmitting={false}
        refusal={properties.refusal}
        describedBy={properties.describedBy}
        formattedCancelKeyCombination='Ctrl+Backspace'
        onSubmit={properties.onSubmit ?? vi.fn()}
        onCancel={properties.onCancel ?? vi.fn()}
      />
    </TooltipProvider>,
  );

describe('ChatTextareaSubmitButton', () => {
  it('should be named Send and send when nothing refuses it (F1)', async () => {
    const onSubmit = vi.fn();
    renderButton({ onSubmit });

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'false');
    expect(send).not.toHaveAttribute('aria-describedby');
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('should stay focusable while it refuses, described by the reason, and refuse to send (F14, S14)', async () => {
    const onSubmit = vi.fn();
    renderButton({ refusal: "Claude Test can't read images.", describedBy: 'reason', onSubmit });

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeEnabled();
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription("Claude Test can't read images.");
    await userEvent.tab();
    expect(send).toHaveFocus();
    await userEvent.click(send);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each(['submitted', 'streaming'])('should be named Stop, with its shortcut, while %s (F1)', async (status) => {
    const onCancel = vi.fn();
    renderButton({ status, onCancel });

    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(stop).toHaveAttribute('aria-keyshortcuts', 'Shift+Meta+Backspace');
    await userEvent.click(stop);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
