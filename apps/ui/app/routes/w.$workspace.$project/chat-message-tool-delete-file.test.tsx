// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolDeleteFile } from '#routes/w.$workspace.$project/chat-message-tool-delete-file.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({
    children,
    status,
  }: {
    readonly children: React.ReactNode;
    readonly status?: string;
  }): React.JSX.Element {
    return (
      <div data-testid='chat-tool-card' data-status={status ?? ''}>
        {children}
      </div>
    );
  },
  ChatToolCardHeader({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-header'>{children}</div>;
  },
  ChatToolCardIcon({ tone }: { readonly tone?: string }): React.JSX.Element {
    return <span data-testid='chat-tool-card-icon' data-tone={tone ?? ''} />;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-title'>{children}</div>;
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

vi.mock('#components/ui/tooltip.js', () => ({
  Tooltip({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <span data-testid='tooltip'>{children}</span>;
  },
  TooltipTrigger({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <span data-testid='tooltip-trigger'>{children}</span>;
  },
  TooltipContent({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <span data-testid='tooltip-content'>{children}</span>;
  },
}));

type DeleteInvocation = ToolInvocation<typeof toolName.deleteFile>;
type DeleteOutputAvailable = Extract<DeleteInvocation, { state: 'output-available' }>;
type DeleteInputAvailable = Extract<DeleteInvocation, { state: 'input-available' }>;
type DeleteOutputError = Extract<DeleteInvocation, { state: 'output-error' }>;

const buildOutputPart = (targetFile: string): DeleteOutputAvailable => ({
  toolCallId: 'tc_1',
  state: 'output-available',
  input: { targetFile },
  output: { message: 'deleted' },
});

const buildInputPart = (targetFile: string): DeleteInputAvailable => ({
  toolCallId: 'tc_1',
  state: 'input-available',
  input: { targetFile },
});

const buildErrorPart = (errorText: string): DeleteOutputError => ({
  toolCallId: 'tc_1',
  state: 'output-error',
  input: { targetFile: 'lib/skids.ts' },
  errorText,
});

afterEach(() => {
  cleanup();
});

describe('ChatMessageToolDeleteFile — verb + description typography', () => {
  it('should render "Deleted <filename>" with verb and description split for completed state', () => {
    const part = buildOutputPart('lib/skids.ts');

    render(<ChatMessageToolDeleteFile part={part} />);

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Deleted');
    const description = screen.getByTestId('chat-tool-description');
    expect(description.textContent).toContain('skids.ts');

    const card = screen.getByTestId('chat-tool-card');
    expect(card.dataset['status']).toBe('ready');

    // The leading icon is a static (untoned) Trash2; no tone class applied.
    expect(screen.getByTestId('chat-tool-card-icon').dataset['tone']).toBe('');
  });

  it('should render "Deleting <filename>" while the tool input is streaming with status loading', () => {
    const part = buildInputPart('lib/skids.ts');

    render(<ChatMessageToolDeleteFile part={part} />);

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Deleting');
    expect(screen.getByTestId('chat-tool-description').textContent).toContain('skids.ts');

    const card = screen.getByTestId('chat-tool-card');
    expect(card.dataset['status']).toBe('loading');
  });

  it('should expose the full path via tooltip when filename differs from target path', () => {
    const part = buildOutputPart('apps/ui/app/lib/skids.ts');

    render(<ChatMessageToolDeleteFile part={part} />);

    expect(screen.getByTestId('tooltip-content').textContent).toBe('apps/ui/app/lib/skids.ts');
    expect(screen.getByTestId('chat-tool-description').textContent).toContain('skids.ts');
  });

  it('should render the shared ChatToolError component on output-error state', () => {
    render(<ChatMessageToolDeleteFile part={buildErrorPart('boom')} />);

    expect(screen.getByTestId('chat-tool-error').textContent).toBe('boom');
  });
});
