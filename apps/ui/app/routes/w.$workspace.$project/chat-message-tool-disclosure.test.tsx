// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ChatMessageToolWebSearch } from '#routes/w.$workspace.$project/chat-message-tool-web-search.js';
import { ChatMessageToolWebBrowser } from '#routes/w.$workspace.$project/chat-message-tool-web-browser.js';
import { ChatMessageToolListDirectory } from '#routes/w.$workspace.$project/chat-message-tool-list-directory.js';
import { ChatMessageToolGrep } from '#routes/w.$workspace.$project/chat-message-tool-grep.js';
import { ChatMessageToolGlobSearch } from '#routes/w.$workspace.$project/chat-message-tool-glob-search.js';
import { ChatMessageToolGetKernelResult } from '#routes/w.$workspace.$project/chat-message-tool-get-kernel-result.js';
import { ChatMessageToolScreenshot } from '#routes/w.$workspace.$project/chat-message-tool-screenshot.js';
import { ChatMessageToolTestModel } from '#routes/w.$workspace.$project/chat-message-tool-test-model.js';
import { ChatMessageToolExportGeometry } from '#routes/w.$workspace.$project/chat-message-tool-export-geometry.js';
import { ChatMessagePlanCard } from '#routes/w.$workspace.$project/chat-message-plan-card.js';

vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [false, vi.fn(), vi.fn()] }));
vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: (selector: (state: { status: string }) => unknown) => selector({ status: 'idle' }),
}));
vi.mock('#components/files/file-link.js', () => ({
  FileLink: ({ children }: { children: ReactNode }) => <a href='#file'>{children}</a>,
}));
vi.mock('#components/files/viewer-link.js', () => ({
  ViewerLink: ({ children }: { children: ReactNode }) => <a href='#viewer'>{children}</a>,
}));
vi.mock('#components/files/directory-link.js', () => ({
  DirectoryLink: ({ children }: { children: ReactNode }) => <a href='#directory'>{children}</a>,
}));
vi.mock('#components/markdown/markdown-viewer.js', () => ({
  MarkdownViewer: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const loading = { toolCallId: 'loading', state: 'input-streaming' } as const;
const input = { targetFile: 'main.scad' };

describe('tool disclosure content parity', () => {
  it.each([
    ['web search', <ChatMessageToolWebSearch key='web search' part={loading} />],
    ['web browser', <ChatMessageToolWebBrowser key='web browser' part={loading} />],
    ['directory', <ChatMessageToolListDirectory key='directory' part={loading} />],
    ['grep', <ChatMessageToolGrep key='grep' part={loading} />],
    ['glob', <ChatMessageToolGlobSearch key='glob' part={loading} />],
    ['kernel', <ChatMessageToolGetKernelResult key='kernel' part={loading} />],
    ['screenshot', <ChatMessageToolScreenshot key='screenshot' part={loading} />],
    ['test', <ChatMessageToolTestModel key='test' part={loading} />],
    ['export', <ChatMessageToolExportGeometry key='export' part={loading} />],
    ['plan', <ChatMessagePlanCard key='plan' targetFile='model.plan.md' content='' status='loading' />],
  ])('does not expose an empty loading disclosure for %s', (_name, row) => {
    render(row);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([
    ['ready', 'Compiled'],
    ['error', 'Failed to compile'],
    ['pending', 'Compile pending'],
  ] as const)('shows truthful %s kernel status without empty diagnostics', (status, verb) => {
    render(
      <ChatMessageToolGetKernelResult
        part={{ toolCallId: 'kernel', state: 'output-available', input, output: { status } }}
      />,
    );
    expect(screen.getByText(verb)).toBeInTheDocument();
    expect(screen.queryByText(/0 warnings/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not expose a disclosure for zero test results', () => {
    render(
      <ChatMessageToolTestModel
        part={{
          toolCallId: 'test',
          state: 'output-available',
          input: {},
          output: { passes: [], failures: [], passed: 0, total: 0 },
        }}
      />,
    );
    expect(screen.getByText('0 requirements')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the reported image count without a toggle when image data is unavailable', () => {
    render(
      <ChatMessageToolScreenshot
        part={{
          toolCallId: 'image',
          state: 'output-available',
          input: { ...input, mode: 'single' },
          output: { images: [{ view: 'front', dataUrl: 'offloaded:image' }] },
        }}
      />,
    );
    expect(screen.getByText('Captured').parentElement).toHaveTextContent('1 screenshot');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps a real image disclosure keyboard-operable', async () => {
    render(
      <ChatMessageToolScreenshot
        part={{
          toolCallId: 'image',
          state: 'output-available',
          input: { ...input, mode: 'single' },
          output: { images: [{ view: 'front', dataUrl: 'data:image/png;base64,AA==' }] },
        }}
      />,
    );
    const toggle = screen.getByRole('button', { name: /Captured 1 screenshot/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    await userEvent.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('img', { name: 'front view' })).toBeInTheDocument();
  });
});
