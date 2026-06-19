import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { FileEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import { AtReferenceChip } from '#components/chat/at-reference-chip.js';
import { AtReferenceProvider } from '#components/chat/at-reference-context.js';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';

type FileFileEntry = Extract<FileEntry, { type: 'file' }>;
type DirectoryFileEntry = Extract<FileEntry, { type: 'dir' }>;

vi.mock('#components/files/file-link.js', () => ({
  FileLink: ({ children, path }: { children: React.ReactNode; path: string }) => (
    <a data-testid='file-link' data-path={path}>
      {children}
    </a>
  ),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: { send: vi.fn() },
    projectId: 'test-project',
  }),
}));

function createEntry(path: string, partial: Partial<FileEntry> = {}): FileEntry {
  const name = partial.name ?? path.split('/').pop()!;
  const size = partial.size ?? 0;
  const isLoaded = partial.isLoaded ?? true;
  const mtimeMs = partial.mtimeMs ?? 0;

  if (partial.type === 'dir') {
    const dirPartial = partial as Partial<DirectoryFileEntry>;
    return {
      path,
      name,
      type: 'dir',
      size,
      isLoaded,
      mtimeMs,
      isDirectoryResolved: dirPartial.isDirectoryResolved,
    };
  }

  const filePartial = partial as Partial<FileFileEntry>;
  if (filePartial.contentKind === 'binary') {
    return {
      path,
      name,
      type: 'file',
      size,
      isLoaded,
      mtimeMs,
      contentKind: 'binary',
    };
  }

  return {
    path,
    name,
    type: 'file',
    size,
    isLoaded,
    mtimeMs,
    contentKind: 'text',
    lineCount: filePartial.lineCount ?? 1,
  };
}

function createMockTreeService(entries: FileEntry[] = []): FileTreeService {
  const tree = new Map<string, FileEntry>(entries.map((entry) => [entry.path, entry]));
  return {
    getTreeSnapshot: () => tree,
    getEntry: vi.fn(async (path: string) => tree.get(path)),
  } as unknown as FileTreeService;
}

function createChats(items: Array<{ id: string; name: string }>): Chat[] {
  return items.map((c) => ({
    id: c.id,
    name: c.name,
    resourceId: 'r1',
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  }));
}

function renderChip(path: string, treeService?: FileTreeService, chats: Chat[] = []) {
  return render(
    <AtReferenceProvider treeService={treeService} chats={chats}>
      <AtReferenceChip data-at-reference={path} />
    </AtReferenceProvider>,
  );
}

describe('AtReferenceChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render file chip with FileLink for existing file', () => {
    const treeService = createMockTreeService([createEntry('src/app.ts', { name: 'app.ts', type: 'file' })]);

    renderChip('src/app.ts', treeService);

    expect(screen.getByText('app.ts')).toBeInTheDocument();
    expect(screen.getByTestId('file-link')).toHaveAttribute('data-path', 'src/app.ts');
  });

  it('should render folder chip with FileLink for existing folder', () => {
    const treeService = createMockTreeService([createEntry('src/components', { name: 'components', type: 'dir' })]);

    renderChip('src/components', treeService);

    expect(screen.getByText('components')).toBeInTheDocument();
    expect(screen.getByTestId('file-link')).toBeInTheDocument();
  });

  it('should render chat chip for valid transcript path', () => {
    const chats = createChats([{ id: 'chat-123', name: 'Design Discussion' }]);

    renderChip('.tau/transcripts/chat-123.jsonl', createMockTreeService(), chats);

    expect(screen.getByText('Design Discussion')).toBeInTheDocument();
  });

  it('should render plain text for unknown transcript path', () => {
    renderChip('.tau/transcripts/missing-chat.jsonl', createMockTreeService());

    expect(screen.getByText('@.tau/transcripts/missing-chat.jsonl')).toBeInTheDocument();
    expect(screen.queryByTestId('file-link')).not.toBeInTheDocument();
  });

  it('should render plain text for unknown file path', () => {
    renderChip('does/not/exist.ts', createMockTreeService());

    expect(screen.getByText('@does/not/exist.ts')).toBeInTheDocument();
    expect(screen.queryByTestId('file-link')).not.toBeInTheDocument();
  });

  it('should not pass onRemove to ContextChip (read-only)', () => {
    const treeService = createMockTreeService([createEntry('src/app.ts', { name: 'app.ts', type: 'file' })]);

    renderChip('src/app.ts', treeService);

    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('should render fallback mark when no data-at-reference attribute', () => {
    const { container } = render(
      <AtReferenceProvider treeService={createMockTreeService()} chats={[]}>
        <AtReferenceChip>highlighted text</AtReferenceChip>
      </AtReferenceProvider>,
    );

    expect(container.querySelector('mark')).toBeInTheDocument();
    expect(screen.getByText('highlighted text')).toBeInTheDocument();
  });

  it('should render skill chip when data-slash-command is set', () => {
    render(
      <AtReferenceProvider treeService={createMockTreeService()} chats={[]}>
        <AtReferenceChip data-slash-command='create-policy' />
      </AtReferenceProvider>,
    );

    expect(screen.getByText('/create-policy')).toBeInTheDocument();
    expect(screen.queryByTestId('file-link')).not.toBeInTheDocument();
  });

  it('should render fallback mark when neither data attribute is present', () => {
    const { container } = render(
      <AtReferenceProvider treeService={createMockTreeService()} chats={[]}>
        <AtReferenceChip>some text</AtReferenceChip>
      </AtReferenceProvider>,
    );

    expect(container.querySelector('mark')).toBeInTheDocument();
    expect(screen.getByText('some text')).toBeInTheDocument();
  });

  it('should resolve file asynchronously via getEntry when not in lazy tree snapshot', async () => {
    const entry = createEntry('deep/file.ts', { name: 'file.ts' });
    const treeService = createMockTreeService();
    vi.mocked(treeService.getEntry).mockResolvedValue(entry);

    renderChip('deep/file.ts', treeService);

    expect(screen.getByText('@deep/file.ts')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('file.ts')).toBeInTheDocument();
    });
    expect(screen.getByTestId('file-link')).toHaveAttribute('data-path', 'deep/file.ts');
  });
});
