import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  error: vi.fn(),
  getEntry: vi.fn(async (path: string) => (path === 'src/main.cs' ? { type: 'file' } : undefined)),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'project-1', editorRef: { send: mocks.send } }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => ({ whenServicesReady: async () => ({ treeService: { getEntry: mocks.getEntry } }) }),
}));
vi.mock('#filesystem/desktop-bridge.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  desktopBridge: () => undefined,
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: mocks.error } }));
vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false }) }));

describe('chat file links in Chromium', () => {
  it('should keep an unavailable host path out of the app router', async () => {
    mocks.send.mockReset();
    mocks.error.mockReset();
    render(
      <MemoryRouter initialEntries={['/w/home/project-1']}>
        <MarkdownViewerChat>[Top view](/Users/tester/.codex/generated_images/render.png)</MarkdownViewerChat>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Top view' }));
    await vi.waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith('This file is unavailable in the current project.');
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(globalThis.location.pathname).not.toBe('/Users/tester/.codex/generated_images/render.png');
  });

  it('should open a project-relative file from rendered markdown', async () => {
    mocks.send.mockReset();
    render(
      <MemoryRouter initialEntries={['/w/home/project-1']}>
        <MarkdownViewerChat>[Source](src/main.cs)</MarkdownViewerChat>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    await vi.waitFor(() => {
      expect(mocks.send).toHaveBeenCalledWith({ type: 'openFile', path: 'src/main.cs', source: 'user' });
      expect(mocks.send).toHaveBeenCalledWith({ type: 'revealFileInTree', path: 'src/main.cs' });
    });
  });
});
