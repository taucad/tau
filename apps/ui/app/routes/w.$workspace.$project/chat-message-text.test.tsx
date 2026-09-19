// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TextUIPart } from 'ai';

vi.mock('#components/markdown/markdown-viewer-chat.js', () => ({
  MarkdownViewerChat: ({
    children,
    isStreaming,
    isStreamingFade,
  }: {
    readonly children: string;
    readonly isStreaming: boolean;
    readonly isStreamingFade: boolean;
  }) => (
    <div data-testid='markdown' data-streaming={isStreaming} data-streaming-fade={isStreamingFade}>
      {children}
    </div>
  ),
}));

const { ChatMessageText } = await import('#routes/w.$workspace.$project/chat-message-text.js');

const part = (state: TextUIPart['state']): TextUIPart => ({ type: 'text', text: 'response', state });

describe('ChatMessageText', () => {
  it('enables fade only for the active unfinished prose part', () => {
    const view = render(<ChatMessageText part={part('streaming')} isMessageActive />);
    expect(screen.getByTestId('markdown')).toHaveAttribute('data-streaming-fade', 'true');

    view.rerender(<ChatMessageText part={part('done')} isMessageActive />);
    expect(screen.getByTestId('markdown')).toHaveAttribute('data-streaming-fade', 'false');

    view.rerender(<ChatMessageText part={part('streaming')} isMessageActive={false} />);
    expect(screen.getByTestId('markdown')).toHaveAttribute('data-streaming-fade', 'false');
  });
});
