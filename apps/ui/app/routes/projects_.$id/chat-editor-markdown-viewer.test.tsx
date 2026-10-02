import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The CodeEditor and MarkdownViewerChat sub-components are heavy and
// orthogonal to what this test exercises — the contract under test is
// only that the Tabs root is keyed on `paneId`, not `filePath`, so that
// the user's Preview/Markdown selection survives a rename.

vi.mock('#components/code/code-editor.client.js', () => ({
  CodeEditor: () => <div data-testid='code-editor' />,
}));
vi.mock('#components/markdown/markdown-viewer-chat.js', () => ({
  MarkdownViewerChat: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='markdown-preview'>{children}</div>
  ),
}));
vi.mock('#routes/projects_.$id/chat-editor-breadcrumbs.js', () => ({
  ChatEditorBreadcrumbs: ({ children }: { readonly children?: React.ReactNode }) => (
    <div data-testid='breadcrumbs'>{children}</div>
  ),
}));

const { ChatEditorMarkdownViewer } = await import('#routes/projects_.$id/chat-editor-markdown-viewer.js');

const noop = (): void => undefined;

const baseProps = {
  content: '# hello',
  language: 'markdown',
  onChange: noop,
  onValidate: noop,
};

describe('ChatEditorMarkdownViewer (R21 — tabs key on paneId)', () => {
  it('should preserve the active tab selection across a filePath rename when paneId is stable', async () => {
    const { rerender } = render(<ChatEditorMarkdownViewer paneId='pane-doc' filePath='README.md' {...baseProps} />);

    // Switch from the default Markdown tab to the Preview tab
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');

    rerender(<ChatEditorMarkdownViewer paneId='pane-doc' filePath='docs/README.md' {...baseProps} />);

    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('should reset the active tab selection when paneId changes (a different tab entirely)', async () => {
    const { rerender } = render(<ChatEditorMarkdownViewer paneId='pane-a' filePath='a.md' {...baseProps} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');

    rerender(<ChatEditorMarkdownViewer paneId='pane-b' filePath='b.md' {...baseProps} />);

    expect(screen.getByRole('tab', { name: 'Markdown' })).toHaveAttribute('aria-selected', 'true');
  });
});
