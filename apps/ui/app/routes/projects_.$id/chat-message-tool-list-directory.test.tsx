// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolListDirectory } from '#routes/projects_.$id/chat-message-tool-list-directory.js';

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
  ChatToolCardListItem({
    children,
    icon: Icon,
    iconNode,
  }: {
    readonly children: React.ReactNode;
    readonly icon?: React.ComponentType<{ className?: string }>;
    readonly iconNode?: React.ReactNode;
  }): React.JSX.Element {
    const renderedIcon = iconNode ?? (Icon ? <Icon /> : undefined);
    const iconKind = iconNode ? 'node' : Icon ? 'component' : 'none';

    return (
      <div data-testid='chat-tool-card-list-item' data-icon-kind={iconKind}>
        {renderedIcon}
        <span>{children}</span>
      </div>
    );
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

vi.mock('#components/icons/file-extension-icon.js', () => ({
  FileExtensionIcon({ filename }: { readonly filename: string }): React.JSX.Element {
    return <span data-testid='file-extension-icon' data-filename={filename} />;
  },
}));

const editorSendMock = vi.fn();

vi.mock('#components/files/file-link.js', () => ({
  FileLink({ children, path }: { readonly children: React.ReactNode; readonly path: string }): React.JSX.Element {
    return (
      <span
        data-testid='file-link'
        data-path={path}
        onClick={() => {
          editorSendMock({ type: 'openFile', path, source: 'user', lineNumber: 1, column: 1 });
        }}
      >
        {children}
      </span>
    );
  },
}));

vi.mock('#components/files/directory-link.js', () => ({
  DirectoryLink({ children, path }: { readonly children: React.ReactNode; readonly path: string }): React.JSX.Element {
    return (
      <span
        data-testid='directory-link'
        data-path={path}
        onClick={() => {
          editorSendMock({ type: 'revealFileInTree', path, expandTarget: true });
        }}
      >
        {children}
      </span>
    );
  },
}));

type ListDirectoryInvocation = ToolInvocation<typeof toolName.listDirectory>;
type ListDirectoryOutputAvailable = Extract<ListDirectoryInvocation, { state: 'output-available' }>;
type ListDirectoryEntry = ListDirectoryOutputAvailable['output']['entries'][number];

const textEntry = (name: string, size: number, lineCount: number): ListDirectoryEntry => ({
  name,
  type: 'file',
  size,
  contentKind: 'text',
  lineCount,
});

const binaryEntry = (name: string, size: number): ListDirectoryEntry => ({
  name,
  type: 'file',
  size,
  contentKind: 'binary',
});

const buildOutputPart = (overrides: {
  readonly path: string;
  readonly entries: readonly ListDirectoryEntry[];
}): ListDirectoryOutputAvailable => ({
  toolCallId: 'tc_1',
  state: 'output-available',
  input: { path: overrides.path },
  output: {
    path: overrides.path,
    entries: [...overrides.entries],
  },
});

afterEach(() => {
  cleanup();
  editorSendMock.mockReset();
});

describe('ChatMessageToolListDirectory — mixed listing dual-rendering contract', () => {
  it('renders Folder rows wrapped in DirectoryLink and extension-iconed file rows wrapped in FileLink in the same pass', () => {
    const part = buildOutputPart({
      path: '',
      entries: [
        { name: '.tau', type: 'dir', size: 1 },
        textEntry('main.ts', 1024, 100),
        binaryEntry('preview.glb', 1_363_149),
      ],
    });

    render(<ChatMessageToolListDirectory part={part} />);

    const directoryLinks = screen.getAllByTestId('directory-link');
    expect(directoryLinks.map((node) => node.dataset['path'])).toEqual(['.tau']);

    const fileLinks = screen.getAllByTestId('file-link');
    expect(fileLinks.map((node) => node.dataset['path'])).toEqual(['main.ts', 'preview.glb']);

    const fileExtensionIcons = screen.getAllByTestId('file-extension-icon');
    expect(fileExtensionIcons.map((node) => node.dataset['filename'])).toEqual(['main.ts', 'preview.glb']);
    expect(screen.getByText(/100 lines, 1KB/)).toBeInTheDocument();
    expect(screen.getByText(/binary, 1.3MB/)).toBeInTheDocument();

    const items = screen.getAllByTestId('chat-tool-card-list-item');
    expect(items[0]?.dataset['iconKind']).toBe('component');
    expect(items[1]?.dataset['iconKind']).toBe('node');
    expect(items[2]?.dataset['iconKind']).toBe('node');
  });

  it('fires openFile when a file row is clicked (no expandTarget)', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const part = buildOutputPart({
      path: 'src/utils',
      entries: [textEntry('helpers.ts', 100, 3)],
    });

    render(<ChatMessageToolListDirectory part={part} />);

    await user.click(screen.getByTestId('file-link'));

    expect(editorSendMock).toHaveBeenCalledTimes(1);
    expect(editorSendMock).toHaveBeenCalledWith({
      type: 'openFile',
      path: 'src/utils/helpers.ts',
      source: 'user',
      lineNumber: 1,
      column: 1,
    });
  });

  it('fires revealFileInTree with expandTarget:true when a directory row is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const part = buildOutputPart({
      path: 'src',
      entries: [{ name: 'utils', type: 'dir', size: 3 }],
    });

    render(<ChatMessageToolListDirectory part={part} />);

    const directoryRowLink = screen
      .getAllByTestId('directory-link')
      .find((node) => node.dataset['path'] === 'src/utils');
    expect(directoryRowLink).toBeDefined();
    if (!directoryRowLink) {
      return;
    }

    await user.click(directoryRowLink);

    expect(editorSendMock).toHaveBeenCalledWith({
      type: 'revealFileInTree',
      path: 'src/utils',
      expandTarget: true,
    });
  });

  it('renders the header path as a DirectoryLink for non-root listings', () => {
    const part = buildOutputPart({
      path: 'src/utils',
      entries: [textEntry('a.ts', 1, 1)],
    });

    render(<ChatMessageToolListDirectory part={part} />);

    const description = screen.getByTestId('chat-tool-description');
    const headerLink = within(description).getByTestId('directory-link');
    expect(headerLink.dataset['path']).toBe('src/utils');
    expect(headerLink.textContent).toBe('src/utils (1 items)');
  });

  it('renders the header path as plain text for root (empty path) listings', () => {
    const part = buildOutputPart({
      path: '',
      entries: [textEntry('a.ts', 1, 1)],
    });

    render(<ChatMessageToolListDirectory part={part} />);

    const description = screen.getByTestId('chat-tool-description');
    expect(within(description).queryByTestId('directory-link')).toBeNull();
    expect(description.textContent).toBe('/ (1 items)');
  });

  it('joins root paths as basenames and nested paths with slash', () => {
    const rootPart = buildOutputPart({
      path: '',
      entries: [{ name: 'foo', type: 'dir', size: 0 }, textEntry('bar.ts', 0, 1)],
    });

    const { unmount } = render(<ChatMessageToolListDirectory part={rootPart} />);

    expect(screen.getByTestId('directory-link').dataset['path']).toBe('foo');
    expect(screen.getByTestId('file-link').dataset['path']).toBe('bar.ts');

    unmount();

    const nestedPart = buildOutputPart({
      path: 'a/b',
      entries: [{ name: 'c', type: 'dir', size: 0 }, textEntry('d.ts', 0, 1)],
    });

    render(<ChatMessageToolListDirectory part={nestedPart} />);

    const directoryLinks = screen.getAllByTestId('directory-link');
    const fileLinks = screen.getAllByTestId('file-link');
    expect(directoryLinks.map((node) => node.dataset['path'])).toEqual(['a/b', 'a/b/c']);
    expect(fileLinks.map((node) => node.dataset['path'])).toEqual(['a/b/d.ts']);
  });
});
