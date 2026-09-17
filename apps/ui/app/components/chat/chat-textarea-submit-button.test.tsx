// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ChatTextareaSubmitButton } from '#components/chat/chat-textarea-submit-button.js';

const renderButton = (properties: { isDisabled: boolean; describedBy?: string }) =>
  render(
    <TooltipProvider>
      <p id='reason'>Claude Test can&apos;t read images.</p>
      <ChatTextareaSubmitButton
        status='ready'
        isSubmitting={false}
        formattedCancelKeyCombination='Ctrl+Backspace'
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        {...properties}
      />
    </TooltipProvider>,
  );

describe('ChatTextareaSubmitButton', () => {
  it('should be disabled and described by the block reason it is given (S14)', () => {
    renderButton({ isDisabled: true, describedBy: 'reason' });

    const send = screen.getByRole('button');
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription("Claude Test can't read images.");
  });

  it('should carry no description of its own when nothing blocks it', () => {
    renderButton({ isDisabled: false });

    const send = screen.getByRole('button');
    expect(send).toBeEnabled();
    expect(send).not.toHaveAttribute('aria-describedby');
  });
});
