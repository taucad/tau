// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { fileUnchangedMarker } from '@taucad/chat/constants';
import { ChatMessageToolReadFile } from '#routes/w.$workspace.$project/chat-message-tool-read-file.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({
    children,
    status,
    variant,
    isCollapsible,
  }: {
    readonly children: React.ReactNode;
    readonly status?: string;
    readonly variant?: string;
    readonly isCollapsible?: boolean;
  }): React.JSX.Element {
    return (
      <div
        data-testid='chat-tool-card'
        data-status={status ?? ''}
        data-variant={variant ?? ''}
        data-collapsible={isCollapsible === false ? 'false' : 'true'}
      >
        {children}
      </div>
    );
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
}));

vi.mock('#components/chat/chat-tool-text.js', () => ({
  ChatToolDescription({
    children,
    className,
  }: {
    readonly children: React.ReactNode;
    readonly className?: string;
  }): React.JSX.Element {
    return (
      <span data-testid='chat-tool-description' data-classname={className ?? ''}>
        {children}
      </span>
    );
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

vi.mock('#components/files/file-link.js', () => ({
  FileLink({
    children,
    path,
    lineNumber,
  }: {
    readonly children: React.ReactNode;
    readonly path: string;
    readonly lineNumber?: number;
  }): React.JSX.Element {
    return (
      <span data-testid='file-link' data-path={path} data-line={String(lineNumber ?? 1)}>
        {children}
      </span>
    );
  },
}));

type ReadFileInvocation = ToolInvocation<typeof toolName.readFile>;
type ReadFileOutputAvailable = Extract<ReadFileInvocation, { state: 'output-available' }>;

const buildOutputPart = (overrides: {
  readonly targetFile: string;
  readonly content: string;
  readonly totalLines?: number;
  readonly size?: number;
  readonly offset?: number;
  readonly limit?: number;
}): ReadFileOutputAvailable => ({
  toolCallId: 'tc_read_1',
  state: 'output-available',
  input: {
    targetFile: overrides.targetFile,
    ...(overrides.offset !== undefined && { offset: overrides.offset }),
    ...(overrides.limit !== undefined && { limit: overrides.limit }),
  },
  output: {
    content: overrides.content,
    size: overrides.size ?? new TextEncoder().encode(overrides.content).byteLength,
    contentKind: 'text',
    totalLines: overrides.totalLines ?? overrides.content.split('\n').length,
    startLine: overrides.offset ?? 1,
  },
});

afterEach(() => {
  cleanup();
});

describe('ChatMessageToolReadFile — cached re-read signal', () => {
  it('should render the standard Read verb when the output content does not match fileUnchangedMarker', () => {
    const part = buildOutputPart({
      targetFile: 'src/foo.ts',
      content: '   1\tconst x = 1;\n   2\tconst y = 2;\n',
      totalLines: 2,
    });

    render(<ChatMessageToolReadFile part={part} />);

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Read');
    const description = screen.getByTestId('chat-tool-description');
    expect(description.dataset['classname']).toBe('');
    expect(description.textContent).toContain('L1-L2');
    expect(description.textContent).not.toContain('of 2');
  });

  it('should render the returned line range without the total line count suffix', () => {
    const part = buildOutputPart({
      targetFile: 'node_modules/libcascade/index.d.ts',
      content: Array.from({ length: 80 }, (_, index) => `   ${101 + index}\tline ${index}`).join('\n'),
      totalLines: 226_592,
      offset: 101,
      limit: 80,
    });

    render(<ChatMessageToolReadFile part={part} />);

    expect(screen.getByTestId('chat-tool-description').textContent).toContain('L101-L180');
    expect(screen.getByTestId('chat-tool-description').textContent).not.toContain('of 226592');
    expect(screen.getByTestId('file-link').dataset['line']).toBe('101');
  });

  it('should render the Re-read, cached verb with a dimmed body when the output content begins with fileUnchangedMarker.prefix', () => {
    const cachedContent = fileUnchangedMarker.build('tc_read_first');
    const part = buildOutputPart({
      targetFile: 'src/foo.ts',
      content: cachedContent,
      totalLines: 120,
    });

    render(<ChatMessageToolReadFile part={part} />);

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Re-read, cached');
    const description = screen.getByTestId('chat-tool-description');
    expect(description.dataset['classname']).toContain('text-muted-foreground');
    const fileLink = screen.getByTestId('file-link');
    expect(fileLink.dataset['path']).toBe('src/foo.ts');
  });
});
