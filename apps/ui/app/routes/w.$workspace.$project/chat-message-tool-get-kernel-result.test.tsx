// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import type { KernelIssue } from '@taucad/runtime';
import { ChatMessageToolGetKernelResult } from '#routes/w.$workspace.$project/chat-message-tool-get-kernel-result.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card'>{children}</div>;
  },
  ChatToolCardHeader({
    children,
    className,
  }: {
    readonly children: React.ReactNode;
    readonly className?: string;
  }): React.JSX.Element {
    return (
      <div data-testid='chat-tool-card-header' data-classname={className ?? ''}>
        {children}
      </div>
    );
  },
  ChatToolCardIcon({ tone }: { readonly tone?: string }): React.JSX.Element {
    return <span data-testid='chat-tool-card-icon' data-tone={tone ?? ''} />;
  },
  ChatToolCardTitle({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div data-testid='chat-tool-card-title'>{children}</div>;
  },
  ChatToolCardContent({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <div>{children}</div>;
  },
  ChatToolCardList({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <ul>{children}</ul>;
  },
  ChatToolCardListItem({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return <li>{children}</li>;
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

vi.mock('#components/files/file-link.js', () => ({
  FileLink({ children, path }: { readonly children: React.ReactNode; readonly path: string }): React.JSX.Element {
    return (
      <a data-testid='file-link' data-path={path} href={`#${path}`}>
        {children}
      </a>
    );
  },
}));

vi.mock('#components/files/viewer-link.js', () => ({
  ViewerLink({ children, path }: { readonly children: React.ReactNode; readonly path: string }): React.JSX.Element {
    return (
      <a data-testid='viewer-link' data-path={path} href={`#${path}`}>
        {children}
      </a>
    );
  },
}));

vi.mock('#components/markdown/markdown-viewer.js', () => ({
  MarkdownViewer({ children }: { readonly children: string }): React.JSX.Element {
    return <span>{children}</span>;
  },
}));

type KernelInvocation = ToolInvocation<typeof toolName.getKernelResult>;
type KernelOutputAvailable = Extract<KernelInvocation, { state: 'output-available' }>;
type KernelInputAvailable = Extract<KernelInvocation, { state: 'input-available' }>;

const buildOutputPart = (targetFile: string, output: KernelOutputAvailable['output']): KernelOutputAvailable => ({
  toolCallId: 'tc_1',
  state: 'output-available',
  input: { targetFile },
  output,
});

const buildInputPart = (targetFile: string): KernelInputAvailable => ({
  toolCallId: 'tc_1',
  state: 'input-available',
  input: { targetFile },
});

afterEach(() => {
  cleanup();
});

describe('ChatMessageToolGetKernelResult — file-aware titles', () => {
  it('should render "Compiled <filename>" with a ViewerLink on success and an untoned leading icon', () => {
    const part = buildOutputPart('lib/skids.ts', { status: 'ready' });

    render(<ChatMessageToolGetKernelResult part={part} />);

    const title = screen.getByTestId('chat-tool-card-title');
    expect(title.textContent).toContain('Compiled');
    expect(title.textContent).toContain('lib/skids.ts');

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Compiled');
    expect(screen.getByTestId('chat-tool-description').textContent).toContain('lib/skids.ts');

    const link = screen.getByTestId('viewer-link');
    expect(link.dataset['path']).toBe('lib/skids.ts');

    // Success states deliberately stay muted — the leading icon carries no
    // tone so only failures (red) draw the eye.
    const header = screen.getByTestId('chat-tool-card-header');
    expect(header.dataset['classname']).toBe('');
    expect(screen.getByTestId('chat-tool-card-icon').dataset['tone']).toBe('');
  });

  it('should render "Failed to compile <filename>" with the icon toned destructive (not the header)', () => {
    const issues: KernelIssue[] = [
      {
        severity: 'error',
        code: 'RUNTIME',
        message: 'This shape has not type, it is null',
        location: { fileName: 'lib/skids.ts', startLineNumber: 46, startColumn: 34, endLineNumber: 46, endColumn: 34 },
      },
    ];
    const part = buildOutputPart('lib/skids.ts', { status: 'error', kernelIssues: issues });

    render(<ChatMessageToolGetKernelResult part={part} />);

    const title = screen.getByTestId('chat-tool-card-title');
    expect(title.textContent).toContain('Failed to compile');
    expect(title.textContent).toContain('lib/skids.ts');

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Failed to compile');
    expect(screen.getByTestId('chat-tool-description').textContent).toContain('lib/skids.ts');

    const headerLinks = screen.getAllByTestId('viewer-link').filter((link) => link.dataset['path'] === 'lib/skids.ts');
    expect(headerLinks.length).toBeGreaterThan(0);

    const header = screen.getByTestId('chat-tool-card-header');
    expect(header.dataset['classname']).toBe('');
    // Header icon is the only colored element (icon at index 0; per-issue icons follow in the list).
    const icons = screen.getAllByTestId('chat-tool-card-icon');
    expect(icons[0]?.dataset['tone']).toBe('destructive');
  });

  it('should render "Compiled <filename> with N warning(s)" with an untoned leading icon (warnings are not failures)', () => {
    const issues: KernelIssue[] = [
      {
        severity: 'warning',
        code: 'RUNTIME',
        message: 'Possible numerical precision issue',
        location: { fileName: 'lib/skids.ts', startLineNumber: 12, startColumn: 4, endLineNumber: 12, endColumn: 4 },
      },
    ];
    const part = buildOutputPart('lib/skids.ts', { status: 'ready', kernelIssues: issues });

    render(<ChatMessageToolGetKernelResult part={part} />);

    const title = screen.getByTestId('chat-tool-card-title');
    expect(title.textContent).toContain('Compiled');
    expect(title.textContent).toContain('lib/skids.ts');
    expect(title.textContent).toContain('with 1 warning');
    expect(title.textContent).not.toContain('warnings');

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Compiled');
    const description = screen.getByTestId('chat-tool-description');
    expect(description.textContent).toContain('lib/skids.ts');
    expect(description.textContent).toContain('with 1 warning');

    const header = screen.getByTestId('chat-tool-card-header');
    expect(header.dataset['classname']).toBe('');
    const icons = screen.getAllByTestId('chat-tool-card-icon');
    expect(icons[0]?.dataset['tone']).toBe('');
  });

  it('should render "Compiled <filename> with N warnings" when multiple warnings are present', () => {
    const issues: KernelIssue[] = [
      {
        severity: 'warning',
        code: 'RUNTIME',
        message: 'Warning A',
        location: { fileName: 'lib/skids.ts', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
      },
      {
        severity: 'warning',
        code: 'RUNTIME',
        message: 'Warning B',
        location: { fileName: 'lib/skids.ts', startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 1 },
      },
    ];
    const part = buildOutputPart('lib/skids.ts', { status: 'ready', kernelIssues: issues });

    render(<ChatMessageToolGetKernelResult part={part} />);

    const title = screen.getByTestId('chat-tool-card-title');
    expect(title.textContent).toContain('with 2 warnings');
  });

  it('should render "Compiling <filename>..." while loading when targetFile is known', () => {
    const part = buildInputPart('lib/skids.ts');

    render(<ChatMessageToolGetKernelResult part={part} />);

    const title = screen.getByTestId('chat-tool-card-title');
    expect(title.textContent).toContain('Compiling');
    expect(title.textContent).toContain('lib/skids.ts');

    const link = screen.getByTestId('viewer-link');
    expect(link.dataset['path']).toBe('lib/skids.ts');
  });
});
