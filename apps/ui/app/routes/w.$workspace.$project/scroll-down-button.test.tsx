// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrollDownButton } from '#routes/w.$workspace.$project/scroll-down-button.js';

describe('ScrollDownButton', () => {
  it('is reachable only while there is chat content below the reader', async () => {
    const scroll = vi.fn();
    const view = render(<ScrollDownButton hasContent isVisible={false} onScrollToBottom={scroll} />);
    expect(screen.queryByRole('button', { name: 'Scroll to bottom', hidden: true })).not.toBeInTheDocument();

    view.rerender(<ScrollDownButton hasContent isVisible onScrollToBottom={scroll} />);
    await userEvent.click(screen.getByRole('button', { name: 'Scroll to bottom' }));
    expect(scroll).toHaveBeenCalledOnce();

    view.rerender(<ScrollDownButton hasContent={false} isVisible onScrollToBottom={scroll} />);
    expect(screen.queryByRole('button', { name: 'Scroll to bottom', hidden: true })).not.toBeInTheDocument();
  });
});
