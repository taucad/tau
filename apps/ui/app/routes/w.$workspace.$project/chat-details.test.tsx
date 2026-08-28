// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectSend: vi.fn(),
  updateName: vi.fn(),
  updateDescription: vi.fn(),
  updateTags: vi.fn(),
  projectSnapshot: {
    context: {
      project: {
        name: 'Desk lamp',
        description: 'A compact task light',
        tags: ['lighting'],
        assets: { main: { entryPath: 'main.ts' } },
      },
    },
  },
  fileManagerSnapshot: { context: { backendType: 'memory' } },
}));

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown }, selector: (state: unknown) => unknown) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectRef: { getSnapshot: () => mocks.projectSnapshot, send: mocks.projectSend },
    updateName: mocks.updateName,
    updateDescription: mocks.updateDescription,
    updateTags: mocks.updateTags,
  }),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    fileManagerRef: { getSnapshot: () => mocks.fileManagerSnapshot },
    activeWorkspaceName: undefined,
  }),
}));

vi.mock('#components/ui/input-tags.js', () => ({
  Tags: ({ children, onTagsChange }: { children: React.ReactNode; onTagsChange: (tags: string[]) => void }) => (
    <div>
      {children}
      <button
        type='button'
        onClick={() => {
          onTagsChange(['lighting', 'lighting', 'print']);
        }}
      >
        Change tags
      </button>
    </div>
  ),
  TagsTrigger: () => <button type='button'>Add tags</button>,
}));

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: ({
    selectedFile,
    title,
    onSelect,
  }: {
    selectedFile: string;
    title: string;
    onSelect: (path: string) => void;
  }) => (
    <button
      type='button'
      aria-label={title}
      onClick={() => {
        onSelect('src/next.ts');
      }}
    >
      {selectedFile}
    </button>
  ),
}));

vi.mock('#routes/w.$workspace.$project/chat-details-usage.js', () => ({
  ChatDetailsUsage: () => <section aria-label='Chat usage' />,
}));

const { DetailsPanelBody } = await import('#routes/w.$workspace.$project/chat-details.js');

describe('DetailsPanelBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups project, storage, and usage information into named sections', () => {
    render(<DetailsPanelBody />);

    expect(screen.getByRole('region', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Storage' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chat usage' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Desk lamp');
    expect(screen.getByLabelText('Description')).toHaveValue('A compact task light');
    expect(screen.getByRole('button', { name: 'Select Main File' })).toHaveTextContent('main.ts');
  });

  it('preserves immediate updates, tag deduplication, and main-file selection', () => {
    render(<DetailsPanelBody />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Desk light' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Main File' }));

    expect(mocks.updateName).toHaveBeenCalledWith('Desk light');
    expect(mocks.updateDescription).toHaveBeenCalledWith('Updated');
    expect(mocks.updateTags).toHaveBeenCalledWith(['lighting', 'print']);
    expect(mocks.projectSend).toHaveBeenCalledWith({ type: 'setMainFile', path: 'src/next.ts' });
  });
});
