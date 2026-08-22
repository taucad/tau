import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ChatEditorBinaryWarning } from '#routes/w.$workspace.$project/chat-editor-binary-warning.js';

describe('ChatEditorBinaryWarning', () => {
  it('should render warning copy explaining the file is binary or unsupported encoding', () => {
    render(<ChatEditorBinaryWarning onForceOpen={vi.fn()} />);

    expect(screen.getByText(/binary or uses an unsupported text encoding/i)).toBeInTheDocument();
  });

  it('should render an Open Anyway action', () => {
    render(<ChatEditorBinaryWarning onForceOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: /open anyway/i })).toBeInTheDocument();
  });

  it('should fire onForceOpen when Open Anyway is clicked', async () => {
    const user = userEvent.setup();
    const onForceOpen = vi.fn();
    render(<ChatEditorBinaryWarning onForceOpen={onForceOpen} />);

    await user.click(screen.getByRole('button', { name: /open anyway/i }));

    expect(onForceOpen).toHaveBeenCalledOnce();
  });
});
