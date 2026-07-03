import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ContextCompactionData } from '@taucad/chat';
import { ChatMessageContextCompaction } from '#routes/projects_.$id/chat-message-context-compaction.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card'>{children}</div>;
  },
  ChatToolCardHeader({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
  ChatToolCardIcon(): React.JSX.Element {
    return <span data-testid='chat-tool-card-icon' />;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
}));

const createCompactionData = (overrides?: Partial<ContextCompactionData>): ContextCompactionData => ({
  type: 'context-compaction',
  id: 'dat_test',
  tokensBeforeCompaction: 50_000,
  tokensAfterCompaction: 5000,
  compressionRatio: 0.1,
  messagesEvicted: 15,
  transcriptFilePath: '.tau/transcripts/chat-1.jsonl',
  ...overrides,
});

describe('ChatMessageContextCompaction', () => {
  it('should render "Summarized chat context" via the standardized ChatToolLabel verb + description', () => {
    render(<ChatMessageContextCompaction data={createCompactionData()} />);

    expect(screen.getByText('Summarized')).toBeInTheDocument();
    expect(screen.getByText('chat context')).toBeInTheDocument();
  });

  it('should render through the ChatToolCard primitive for styling consistency with other tool rows', () => {
    render(<ChatMessageContextCompaction data={createCompactionData()} />);

    expect(screen.getByTestId('chat-tool-card')).toBeInTheDocument();
    expect(screen.getByTestId('chat-tool-card-icon')).toBeInTheDocument();
  });

  it('should show compression details on hover', async () => {
    render(<ChatMessageContextCompaction data={createCompactionData()} />);

    const badge = screen.getByText('Summarized');
    await userEvent.hover(badge);

    expect(await screen.findByText('Context compaction')).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('should render failed compaction distinctly', async () => {
    render(
      <ChatMessageContextCompaction
        data={createCompactionData({
          status: 'failed',
          compressionRatio: 1,
          compactionFailureKind: 'morph_contract_error',
          failureDisposition: 'blocked_before_provider',
          debugId: 'dat_debug',
        })}
      />,
    );

    const badge = screen.getByText('Compaction blocked');
    await userEvent.hover(badge);

    expect(await screen.findByText('Context compaction blocked')).toBeInTheDocument();
    expect(screen.getByText('Morph response contract error')).toBeInTheDocument();
    expect(screen.getByText('Blocked before provider dispatch')).toBeInTheDocument();
    expect(screen.getByText('dat_debug')).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it('should render overflow retry distinctly', async () => {
    render(
      <ChatMessageContextCompaction
        data={createCompactionData({ status: 'overflow_retry_succeeded', triggerReason: 'overflow' })}
      />,
    );

    const badge = screen.getByText('Trimmed');
    await userEvent.hover(badge);

    expect(await screen.findByText('Overflow retry')).toBeInTheDocument();
    expect(screen.getByText('Provider overflow')).toBeInTheDocument();
  });

  it('should show transcript file path when present', async () => {
    render(
      <ChatMessageContextCompaction
        data={createCompactionData({ transcriptFilePath: '.tau/transcripts/test.jsonl' })}
      />,
    );

    const badge = screen.getByText('Summarized');
    await userEvent.hover(badge);

    expect(await screen.findByText('.tau/transcripts/test.jsonl')).toBeInTheDocument();
  });

  it('should not show transcript file path when null', async () => {
    render(<ChatMessageContextCompaction data={createCompactionData({ transcriptFilePath: null })} />);

    const badge = screen.getByText('Summarized');
    await userEvent.hover(badge);

    await screen.findByText('Context compaction');
    expect(screen.queryByText('Transcript')).not.toBeInTheDocument();
  });
});
