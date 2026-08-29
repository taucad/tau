import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';

const useThemeMock = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-theme.js', () => ({ useTheme: useThemeMock }));
vi.mock('streamdown', () => ({
  defaultRehypePlugins: { sanitize: vi.fn() },
  defaultRemarkPlugins: {},
  Streamdown: ({ children, shikiTheme }: { children: ReactNode; shikiTheme: readonly string[] }) => (
    <div data-testid='streamdown' data-shiki-theme={shikiTheme.join(',')}>
      {children}
    </div>
  ),
}));

describe('MarkdownViewer', () => {
  beforeEach(() => {
    useThemeMock.mockReturnValue({ isHighContrast: false });
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
});
