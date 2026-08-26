// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolFileEdit } from '#routes/w.$workspace.$project/chat-message-tool-edit-file.js';

vi.mock('#components/chat/chat-tool-card.js', () => ({
  ChatToolCard({
    children,
    status,
    isCollapsible,
    variant,
  }: {
    readonly children: React.ReactNode;
    readonly status?: string;
    readonly isCollapsible?: boolean;
    readonly variant?: string;
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

vi.mock('#components/files/file-link.js', () => ({
  FileLink({ children, path }: { readonly children: React.ReactNode; readonly path: string }): React.JSX.Element {
    return (
      <a data-testid='file-link' data-path={path} href={`#${path}`}>
        {children}
      </a>
    );
  },
}));

vi.mock('#components/chat/chat-tool-file-operation.js', () => ({
  CollapsibleFileOperation({
    targetFile,
    diffStats,
  }: {
    readonly targetFile: string;
    readonly diffStats?: { linesAdded: number; linesRemoved: number };
  }): React.JSX.Element {
    return (
      <div
        data-testid='collapsible-file-operation'
        data-target-file={targetFile}
        data-lines-added={diffStats?.linesAdded ?? ''}
        data-lines-removed={diffStats?.linesRemoved ?? ''}
      />
    );
  },
}));

vi.mock('#components/copy-button.js', () => ({
  CopyButton(): React.JSX.Element {
    return <button data-testid='copy-button' type='button' />;
  },
}));

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError({ errorText }: { readonly errorText: string }): React.JSX.Element {
    return <div data-testid='chat-tool-error'>{errorText}</div>;
  },
}));

type EditFileInvocation = ToolInvocation<typeof toolName.editFile>;
type EditFileOutputAvailable = Extract<EditFileInvocation, { state: 'output-available' }>;

const buildOutputPart = (overrides: {
  readonly targetFile: string;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly originalContent?: string;
  readonly modifiedContent?: string;
}): EditFileOutputAvailable => ({
  toolCallId: 'tc_1',
  state: 'output-available',
  input: { targetFile: overrides.targetFile, codeEdit: 'noop' },
  output: {
    diffStats: {
      linesAdded: overrides.linesAdded,
      linesRemoved: overrides.linesRemoved,
      originalContent: overrides.originalContent ?? 'unchanged',
      modifiedContent: overrides.modifiedContent ?? overrides.originalContent ?? 'unchanged',
    },
  },
});

afterEach(() => {
  cleanup();
});

describe('ChatMessageToolFileEdit — no-op edit rendering', () => {
  it('should render an inline minimal ChatToolCard with "Edit attempted, no changes" when diffStats is 0/0', () => {
    const part = buildOutputPart({ targetFile: 'main.scad', linesAdded: 0, linesRemoved: 0 });

    render(<ChatMessageToolFileEdit part={part} />);

    expect(screen.getByTestId('chat-tool-verb').textContent).toBe('Edit attempted, no changes');

    const card = screen.getByTestId('chat-tool-card');
    expect(card.dataset['variant']).toBe('minimal');
    expect(card.dataset['status']).toBe('ready');
    expect(card.dataset['collapsible']).toBe('false');

    // Filename surfaces via FileLink so the user can still jump to the file
    const fileLink = screen.getByTestId('file-link');
    expect(fileLink.dataset['path']).toBe('main.scad');
    expect(fileLink.textContent).toBe('main.scad');

    // No CollapsibleFileOperation in the no-op path
    expect(screen.queryByTestId('collapsible-file-operation')).toBeNull();

    // Success state — leading icon stays untoned (no destructive/warning ramp)
    expect(screen.getByTestId('chat-tool-card-icon').dataset['tone']).toBe('');
  });

  it('should render the existing CollapsibleFileOperation when the diff has actual changes', () => {
    const part = buildOutputPart({
      targetFile: 'main.scad',
      linesAdded: 3,
      linesRemoved: 1,
      originalContent: 'a\nb\nc',
      modifiedContent: 'a\nx\ny\nz\nc',
    });

    render(<ChatMessageToolFileEdit part={part} />);

    const collapsible = screen.getByTestId('collapsible-file-operation');
    expect(collapsible.dataset['targetFile']).toBe('main.scad');
    expect(collapsible.dataset['linesAdded']).toBe('3');
    expect(collapsible.dataset['linesRemoved']).toBe('1');

    // The no-op inline card must NOT render in the changed-diff path
    expect(screen.queryByTestId('chat-tool-card')).toBeNull();
    expect(screen.queryByText('Edit attempted, no changes')).toBeNull();
  });
});
