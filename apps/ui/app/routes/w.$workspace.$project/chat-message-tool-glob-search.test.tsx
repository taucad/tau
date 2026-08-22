// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolGlobSearch } from '#routes/w.$workspace.$project/chat-message-tool-glob-search.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card'>{children}</div>;
  },
  ChatToolCardHeader({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-header'>{children}</div>;
  },
  ChatToolCardIcon(): React.JSX.Element {
    return <span data-testid='chat-tool-card-icon' />;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-title'>{children}</div>;
  },
  ChatToolCardContent({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-content'>{children}</div>;
  },
  ChatToolCardList({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-list'>{children}</div>;
  },
  ChatToolCardListItem({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-list-item'>{children}</div>;
  },
}));

vi.mock('#components/chat/chat-tool-text.js', () => ({
  ChatToolDescription({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <span data-testid='chat-tool-description'>{children}</span>;
  },
}));

vi.mock('#components/chat/chat-tool-label.js', () => ({
  ChatToolLabel({
    verb,
    children,
  }: {
    readonly verb: React.ReactNode;
    readonly children?: React.ReactNode;
  }): React.JSX.Element {
    return (
      <span data-testid='chat-tool-label'>
        <span data-testid='chat-tool-verb'>{verb}</span>
        {children ? <> {children}</> : undefined}
      </span>
    );
  },
}));

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError({ errorText }: { readonly errorText: string }): React.JSX.Element {
    return <div data-testid='chat-tool-error'>{errorText}</div>;
  },
}));

type GlobInvocation = ToolInvocation<typeof toolName.globSearch>;
type GlobOutputAvailable = Extract<GlobInvocation, { state: 'output-available' }>;

const buildOutputPart = (entries: GlobOutputAvailable['output']['entries']): GlobOutputAvailable => ({
  toolCallId: 'tc_glob_1',
  state: 'output-available',
  input: { pattern: '**/*' },
  output: {
    files: entries.map((entry) => entry.path),
    entries,
    totalFiles: entries.length,
  },
});

afterEach(() => {
  cleanup();
});

describe('ChatMessageToolGlobSearch metadata rendering', () => {
  it('should render text and binary metadata beside matched paths', () => {
    const part = buildOutputPart([
      { path: 'src/main.ts', isDirectory: false, size: 4096, contentKind: 'text', lineCount: 142 },
      { path: 'preview.glb', isDirectory: false, size: 1_363_149, contentKind: 'binary' },
    ]);

    render(<ChatMessageToolGlobSearch part={part} />);

    expect(screen.getByText(/src\/main\.ts/)).toBeInTheDocument();
    expect(screen.getByText(/142 lines, 4KB/)).toBeInTheDocument();
    expect(screen.getByText(/preview\.glb/)).toBeInTheDocument();
    expect(screen.getByText(/binary, 1.3MB/)).toBeInTheDocument();
  });

  it('should render an empty state when no entries match', () => {
    render(<ChatMessageToolGlobSearch part={buildOutputPart([])} />);

    expect(screen.getByText('No files found')).toBeInTheDocument();
  });
});
