import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { ProjectContext } from '@taucad/ui-core/contexts/project-context';
import type { ProjectContextValue } from '@taucad/ui-core/contexts/project-context';
import { FileManagerContext } from '@taucad/ui-core/contexts/file-manager-context';
import type { FileManagerContextValue } from '@taucad/ui-core/contexts/file-manager-context';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  error: vi.fn(),
  getEntry: vi.fn(),
}));

vi.mock('@taucad/files-ui/filesystem/desktop-bridge', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  desktopBridge: () => undefined,
}));
vi.mock('@taucad/ui/components/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false }) }));

const project: ProjectContextValue = {
  projectId: 'project-1',
  projectRef: { send: vi.fn() },
  editorRef: { send: mocks.send },
};
mocks.getEntry.mockImplementation(async (path: string) => (path === 'src/main.cs' ? { type: 'file' } : undefined));
const fileManager: FileManagerContextValue = {
  whenServicesReady: async () => ({ treeService: mock<FileTreeService>({ getEntry: mocks.getEntry }) }),
  writeFile: vi.fn(),
};

function renderInProject(markdown: string): void {
  render(
    <MemoryRouter initialEntries={['/w/home/project-1']}>
      <ProjectContext.Provider value={project}>
        <FileManagerContext.Provider value={fileManager}>
          <MarkdownViewerChat>{markdown}</MarkdownViewerChat>
        </FileManagerContext.Provider>
      </ProjectContext.Provider>
    </MemoryRouter>,
  );
}

describe('chat file links in Chromium', () => {
  it('should keep an unavailable host path out of the app router', async () => {
    mocks.send.mockReset();
    mocks.error.mockReset();
    renderInProject('[Top view](/Users/tester/.codex/generated_images/render.png)');
    fireEvent.click(screen.getByRole('button', { name: 'Top view' }));
    await vi.waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith('This file is unavailable in the current project.');
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(globalThis.location.pathname).not.toBe('/Users/tester/.codex/generated_images/render.png');
  });

  it('should open a project-relative file from rendered markdown', async () => {
    mocks.send.mockReset();
    renderInProject('[Source](src/main.cs)');
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    await vi.waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith({ type: 'openFile', path: 'src/main.cs', source: 'user' });
      expect(mocks.send).toHaveBeenCalledWith({ type: 'revealFileInTree', path: 'src/main.cs' });
    });
  });
});
