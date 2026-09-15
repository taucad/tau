import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

const useThemeMock = vi.hoisted(() => vi.fn());
const streamdownPropsMock = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-theme.js', () => ({ useTheme: useThemeMock }));
vi.mock('streamdown', () => ({
  defaultRehypePlugins: { sanitize: vi.fn() },
  defaultRemarkPlugins: {},
  Streamdown: ({ children, shikiTheme, ...properties }: { children: ReactNode; shikiTheme: readonly string[] }) => {
    streamdownPropsMock(properties);
    return (
      <div data-testid='streamdown' data-shiki-theme={shikiTheme.join(',')}>
        {children}
      </div>
    );
  },
}));

describe('MarkdownViewer', () => {
  beforeEach(() => {
    useThemeMock.mockReturnValue({ isHighContrast: false });
    streamdownPropsMock.mockClear();
  });

  it('should switch Streamdown to its high-contrast light and dark pair', () => {
    const view = render(<MarkdownViewer>content</MarkdownViewer>);
    expect(screen.getByTestId('streamdown')).toHaveAttribute('data-shiki-theme', 'github-light,github-dark');

    useThemeMock.mockReturnValue({ isHighContrast: true });
    view.rerender(<MarkdownViewer>updated content</MarkdownViewer>);

    expect(screen.getByTestId('streamdown')).toHaveAttribute(
      'data-shiki-theme',
      'github-light-high-contrast,github-dark-high-contrast',
    );
  });

  it('should forward the latest Streamdown options and install the feature plugins', () => {
    render(
      <MarkdownViewer caret='circle' lineNumbers={false} normalizeHtmlIndentation>
        content
      </MarkdownViewer>,
    );

    /* oxlint-disable typescript/no-unsafe-assignment -- Vitest asymmetric matchers intentionally use any. */
    expect(streamdownPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        caret: 'circle',
        lineNumbers: false,
        normalizeHtmlIndentation: true,
        plugins: expect.objectContaining({
          code: expect.anything(),
          cjk: expect.anything(),
          math: expect.anything(),
          mermaid: expect.anything(),
        }),
      }),
    );
    /* oxlint-enable typescript/no-unsafe-assignment */
  });
});
