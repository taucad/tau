import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ChatEditorTooLargeWarning } from '#routes/w.$workspace.$project/chat-editor-too-large-warning.js';

describe('ChatEditorTooLargeWarning', () => {
  it('should render the file size in megabytes when size is over 1 MiB', () => {
    render(<ChatEditorTooLargeWarning size={5 * 1024 * 1024} limit={2 * 1024 * 1024} onOpenAnyway={vi.fn()} />);

    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
  });

  it('should render the file size in kilobytes when size is below 1 MiB', () => {
    render(<ChatEditorTooLargeWarning size={4096} limit={1024} onOpenAnyway={vi.fn()} />);

    expect(screen.getByText(/4 KB/)).toBeInTheDocument();
    expect(screen.getByText(/1 KB/)).toBeInTheDocument();
  });

  it('should render an Open Anyway action', () => {
    render(<ChatEditorTooLargeWarning size={1} limit={0} onOpenAnyway={vi.fn()} />);

    expect(screen.getByRole('button', { name: /open anyway/i })).toBeInTheDocument();
  });

  it('should fire onOpenAnyway when Open Anyway is clicked', async () => {
    const user = userEvent.setup();
    const onOpenAnyway = vi.fn();
    render(<ChatEditorTooLargeWarning size={1} limit={0} onOpenAnyway={onOpenAnyway} />);

    await user.click(screen.getByRole('button', { name: /open anyway/i }));

    expect(onOpenAnyway).toHaveBeenCalledOnce();
  });
});
