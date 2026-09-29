// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { ChatMarkdownHyperlink, chatFileHref } from '#components/markdown/chat-markdown-hyperlink.js';
import { MarkdownViewerChat } from '#components/markdown/markdown-viewer-chat.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  getEntry: vi.fn(),
  writeFile: vi.fn(),
  read: vi.fn(),
  error: vi.fn(),
  bridge: undefined as undefined | { generatedImages: { read: (path: string) => Promise<unknown> } },
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'project-1', editorRef: { send: mocks.send } }),
}));
vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => ({
    whenServicesReady: async () => ({ treeService: { getEntry: mocks.getEntry } }),
    writeFile: mocks.writeFile,
  }),
}));
vi.mock('#filesystem/desktop-bridge.js', () => ({
  desktopBridge: () => mocks.bridge,
  nodeHomeRoot: () => '/Users/tester/Tau/home',
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectFileSystemConfig: async () => ({ backend: 'node', providerBasePath: 'project-1' }),
}));
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: mocks.error } }));
vi.mock('#hooks/use-theme.js', () => ({ useTheme: () => ({ isHighContrast: false }) }));

beforeEach(() => {
  mocks.send.mockReset();
  mocks.getEntry.mockReset();
  mocks.writeFile.mockReset();
  mocks.read.mockReset();
  mocks.error.mockReset();
  mocks.bridge = undefined;
});

function renderLink(href: string): void {
  render(
    <MemoryRouter initialEntries={['/w/home/project-1']}>
      <ChatMarkdownHyperlink href={href}>View file</ChatMarkdownHyperlink>
    </MemoryRouter>,
  );
}

describe('chatFileHref', () => {
  it('should classify rooted, relative, and file URLs but leave web and app links alone', () => {
    expect(chatFileHref('src/model.ts')).toBe('src/model.ts');
    expect(chatFileHref('/Users/tester/image.png')).toBe('/Users/tester/image.png');
    expect(chatFileHref('file:///Users/tester/image%20one.png')).toBe('/Users/tester/image one.png');
    expect(chatFileHref('https://example.com/image.png')).toBeUndefined();
    expect(chatFileHref('#image.png')).toBeUndefined();
    expect(chatFileHref('/legal/privacy')).toBeUndefined();
    expect(chatFileHref('/robots.txt')).toBeUndefined();
    expect(chatFileHref('notes.txt')).toBe('notes.txt');
    expect(chatFileHref('/broken%ZZ.png')).toBeUndefined();
  });
});

describe('ChatMarkdownHyperlink', () => {
  it('should open and reveal a browser project file without changing the route', async () => {
    mocks.getEntry.mockResolvedValue({ type: 'file' });
    renderLink('src/model.ts');
    await userEvent.click(screen.getByRole('button', { name: 'View file' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'openFile', path: 'src/model.ts', source: 'user' });
    expect(mocks.send).toHaveBeenCalledWith({ type: 'revealFileInTree', path: 'src/model.ts' });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('should import a desktop generated image into Files, then open it', async () => {
    mocks.getEntry.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue({ path: 'run-1/top.png', bytes: new Uint8Array([1, 2]) });
    mocks.bridge = { generatedImages: { read: mocks.read } };
    renderLink('/Users/tester/.codex/generated_images/run-1/top.png');
    await userEvent.click(screen.getByRole('button', { name: 'View file' }));
    await vi.waitFor(() => {
      expect(mocks.writeFile).toHaveBeenCalledWith('.tau/generated-images/run-1/top.png', new Uint8Array([1, 2]), {
        source: 'user',
      });
    });
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'openFile',
      path: '.tau/generated-images/run-1/top.png',
      source: 'user',
      readOnly: true,
    });
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'revealFileInTree',
      path: '.tau/generated-images/run-1/top.png',
    });
  });

  it('should resolve an absolute path inside a desktop project without importing it', async () => {
    mocks.getEntry.mockResolvedValue({ type: 'file' });
    mocks.bridge = { generatedImages: { read: mocks.read } };
    renderLink('/Users/tester/Tau/home/project-1/main.cs');
    await userEvent.click(screen.getByRole('button', { name: 'View file' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'openFile', path: 'main.cs', source: 'user' });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('should keep unavailable browser host paths out of the app router', async () => {
    renderLink('/Users/tester/.codex/generated_images/run-1/top.png');
    await userEvent.click(screen.getByRole('button', { name: 'View file' }));
    await vi.waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith('This file is unavailable in the current project.');
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('should preserve ordinary HTTPS links', () => {
    renderLink('https://example.com/render.png');
    expect(screen.getByRole('link', { name: 'View file' })).toHaveAttribute('href', 'https://example.com/render.png');
  });

  it('should preserve application routes', () => {
    renderLink('/legal/privacy');
    expect(screen.getByRole('link', { name: 'View file' })).toHaveAttribute('href', '/legal/privacy');
  });

  it('should route links from rendered chat markdown through the same Workbench action', async () => {
    mocks.getEntry.mockResolvedValue({ type: 'file' });
    render(
      <MemoryRouter>
        <MarkdownViewerChat>[View file](src/main.cs)</MarkdownViewerChat>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View file' }));
    expect(mocks.send).toHaveBeenCalledWith({ type: 'openFile', path: 'src/main.cs', source: 'user' });
  });

  it('should render a file URL as a Workbench action and import its generated image', async () => {
    mocks.getEntry.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue({ path: 'run-1/top.png', bytes: new Uint8Array([3]) });
    mocks.bridge = { generatedImages: { read: mocks.read } };
    render(
      <MemoryRouter>
        <MarkdownViewerChat>[Top view](file:///Users/tester/.codex/generated_images/run-1/top.png)</MarkdownViewerChat>
      </MemoryRouter>,
    );
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
