import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorTool } from '#routes/w.$workspace.$project/chat-error-tool.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

describe('ChatErrorTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should continue the interrupted chat when Try again is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ChatErrorTool
        description='Tool call failed after a partial response.'
        helpUrl='https://docs.example.test/tool'
      />,
    );

    expect(screen.getByText('Processing Error')).toBeInTheDocument();
    expect(screen.getByText('Tool call failed after a partial response.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveAttribute('href', 'https://docs.example.test/tool');
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
