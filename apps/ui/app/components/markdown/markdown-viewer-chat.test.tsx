import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { ProjectContext } from '@taucad/ui-core/contexts/project-context';
import type { ProjectContextValue } from '@taucad/ui-core/contexts/project-context';
import { FileManagerContext } from '@taucad/ui-core/contexts/file-manager-context';
import type { FileManagerContextValue } from '@taucad/ui-core/contexts/file-manager-context';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getEntry: vi.fn(),
  read: vi.fn(),
  bridge: undefined as undefined | { generatedImages: { read: (path: string) => Promise<unknown> } },
}));

vi.mock('#hooks/use-theme.js', () => ({
  useTheme: () => ({ isHighContrast: false, theme: 'light' }),
}));
vi.mock('@taucad/files-ui/filesystem/desktop-bridge', () => ({
  desktopBridge: () => mocks.bridge,
  nodeHomeRoot: () => '/Users/tester/Tau/home',
}));
vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({
  getProjectFileSystemConfig: async () => ({ backend: 'node', providerBasePath: 'project-1' }),
}));

beforeEach(() => {
  mocks.send.mockReset();
  mocks.getEntry.mockReset();
  mocks.read.mockReset();
  mocks.bridge = undefined;
});

const rows = Array.from({ length: 30 }, (_, index) => `| Row ${index} | Value ${index} |`).join('\n');
const tableMarkdown = `| Function | Parts |\n| --- | --- |\n${rows}\n`;

const tableScroller = (container: HTMLElement): HTMLElement => {
  const table = container.querySelector<HTMLElement>('[data-streamdown="table"]');
  if (!table?.parentElement) {
    throw new Error('Expected a rendered markdown table');
  }

  return table.parentElement;
};

const project: ProjectContextValue = {
  projectId: 'project-1',
  projectRef: { send: vi.fn() },
  editorRef: { send: mocks.send },
};
const fileManager: FileManagerContextValue = {
  whenServicesReady: async () => ({ treeService: mock<FileTreeService>({ getEntry: mocks.getEntry }) }),
  writeFile: vi.fn(),
};

function renderInProject(markdown: string): void {
  render(
    <MemoryRouter>
      <ProjectContext.Provider value={project}>
        <FileManagerContext.Provider value={fileManager}>
          <MarkdownViewerChat>{markdown}</MarkdownViewerChat>
        </FileManagerContext.Provider>
      </ProjectContext.Provider>
    </MemoryRouter>,
  );
}

describe('MarkdownViewerChat', () => {
  it.each([false, true])('should render tables at full height (streaming fade: %s)', (isStreamingFade) => {
    const view = render(<MarkdownViewerChat isStreamingFade={isStreamingFade}>{tableMarkdown}</MarkdownViewerChat>);

    expect(view.container.querySelectorAll('[data-streamdown="table"] tbody tr')).toHaveLength(30);
    expect(tableScroller(view.container).style.maxHeight).toBe('');
  });

  it('should route links from rendered chat markdown through the Workbench action', async () => {
    mocks.getEntry.mockResolvedValue({ type: 'file' });
    renderInProject('[View file](src/main.cs)');
    await userEvent.click(screen.getByRole('button', { name: 'View file' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'openFile', path: 'src/main.cs', source: 'user' });
  });

  it('should render a file URL as a Workbench action and import its generated image', async () => {
    mocks.getEntry.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue({ path: 'run-1/top.png', bytes: new Uint8Array([3]) });
    mocks.bridge = { generatedImages: { read: mocks.read } };
    renderInProject('[Top view](file:///Users/tester/.codex/generated_images/run-1/top.png)');
    await userEvent.click(screen.getByRole('button', { name: 'Top view' }));
    expect(mocks.read).toHaveBeenCalledWith('/Users/tester/.codex/generated_images/run-1/top.png');
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'openFile',
      path: '.tau/generated-images/run-1/top.png',
      source: 'user',
      readOnly: true,
    });
  });
});
