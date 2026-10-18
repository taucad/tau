import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeViewer, maxHighlightedCodeLength } from '#components/code/code-viewer.js';

const useThemeMock = vi.hoisted(() => vi.fn());
const codeToHtmlMock = vi.hoisted(() =>
  vi.fn((_: string, options: { theme: string }) => `<output>${options.theme}</output>`),
);

vi.mock('#hooks/use-theme.js', () => ({ useTheme: useThemeMock }));
vi.mock('#lib/shiki.lib.js', () => ({ getHighlighter: vi.fn(async () => ({ codeToHtml: codeToHtmlMock })) }));

/** Milliseconds. */
const highlightCleanupWait = 200;

describe('CodeViewer', () => {
  beforeEach(() => {
    useThemeMock.mockReturnValue({ theme: 'light', isHighContrast: false });
    codeToHtmlMock.mockClear();
  });

  it('should select the high-contrast Shiki palette when contrast is enhanced', async () => {
    useThemeMock.mockReturnValue({ theme: 'dark', isHighContrast: true });

    render(<CodeViewer text='const answer = 42;' language='typescript' />);

    expect(await screen.findByText('github-dark-high-contrast')).toBeInTheDocument();
    expect(codeToHtmlMock).toHaveBeenCalledWith('const answer = 42;', {
      lang: 'typescript',
      theme: 'github-dark-high-contrast',
    });
  });

  it('should cancel stale throttled highlights when code changes or the viewer unmounts', async () => {
    const { rerender, unmount } = render(<CodeViewer text='first' language='typescript' />);
    await waitFor(() => {
      expect(codeToHtmlMock).toHaveBeenCalledWith('first', { lang: 'typescript', theme: 'github-light' });
    });

    rerender(<CodeViewer text='stale' language='typescript' />);
    rerender(<CodeViewer text='latest' language='typescript' />);
    await waitFor(() => {
      expect(codeToHtmlMock).toHaveBeenCalledWith('latest', { lang: 'typescript', theme: 'github-light' });
    });
    expect(codeToHtmlMock).not.toHaveBeenCalledWith('stale', expect.anything());

    rerender(<CodeViewer text='after-unmount' language='typescript' />);
    unmount();
    await new Promise((resolve) => {
      setTimeout(resolve, highlightCleanupWait);
    });
    expect(codeToHtmlMock).not.toHaveBeenCalledWith('after-unmount', expect.anything());
  });

  /* D-UI-28: Shiki's HTML is 5 to 15 times the source, kept beside the text. */
  it('should show code beyond the highlight cap as plain text and drop the highlighted HTML', async () => {
    const { container, rerender } = render(<CodeViewer text='small' language='typescript' />);
    expect(await screen.findByText('github-light')).toBeInTheDocument();
    codeToHtmlMock.mockClear();

    const large = 'x'.repeat(maxHighlightedCodeLength + 1);
    rerender(<CodeViewer text={large} language='typescript' />);
    await new Promise((resolve) => {
      setTimeout(resolve, highlightCleanupWait);
    });

    expect(codeToHtmlMock).not.toHaveBeenCalled();
    expect(screen.queryByText('github-light')).not.toBeInTheDocument();
    expect(container.querySelector('code')?.textContent).toBe(large);
  });
});
