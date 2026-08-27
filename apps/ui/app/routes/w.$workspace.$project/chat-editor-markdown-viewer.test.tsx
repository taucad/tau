import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('#components/code/code-editor.client.js', () => ({
  CodeEditor: () => <div data-testid='code-editor' />,
}));
vi.mock('#components/markdown/markdown-viewer-chat.js', () => ({
  MarkdownViewerChat: ({ children }: { readonly children: React.ReactNode }) => (
    <div data-testid='markdown-preview'>{children}</div>
  ),
}));
const { ChatEditorMarkdownViewer } = await import('#routes/w.$workspace.$project/chat-editor-markdown-viewer.js');

const noop = (): void => undefined;

const baseProps = {
  content: '# hello',
  language: 'markdown',
  onChange: noop,
  onValidate: noop,
};

describe('ChatEditorMarkdownViewer', () => {
  it('should render preview by default without inline tabs', () => {
    render(<ChatEditorMarkdownViewer paneId='pane-doc' filePath='README.md' {...baseProps} />);

    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('# hello');
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-editor')).not.toBeInTheDocument();
  });

  it('should render the source editor when controlled by the pane view', () => {
    render(<ChatEditorMarkdownViewer paneId='pane-doc' filePath='README.md' viewId='source' {...baseProps} />);

    expect(screen.getByTestId('code-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
  });
});
