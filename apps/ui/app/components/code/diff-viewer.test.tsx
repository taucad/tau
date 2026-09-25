// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DiffViewer, getDiffLineCount, getFirstChangedLine } from '#components/code/diff-viewer.js';
import { getHighlighter } from '#lib/shiki.lib.js';
import { supportedHighlightLanguages } from '#lib/code-language-resolution.js';

const useThemeMock = vi.hoisted(() => vi.fn(() => ({ theme: 'light', isHighContrast: false })));

vi.mock('#hooks/use-theme.js', () => ({ useTheme: useThemeMock }));

beforeAll(async () => {
  await getHighlighter();
});

beforeEach(() => {
  useThemeMock.mockReturnValue({ theme: 'light', isHighContrast: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectDiffViewerShikiReady(container: HTMLElement): void {
  const root = container.firstElementChild;
  expect(root).toBeInstanceOf(HTMLElement);
  expect((root as HTMLElement).dataset['shikiState']).toBe('ready');
}

describe('DiffViewer', () => {
  it('should use the high-contrast Shiki palette when contrast is enhanced', async () => {
    useThemeMock.mockReturnValue({ theme: 'dark', isHighContrast: true });
    const highlighter = await getHighlighter();
    const codeToHtml = vi.spyOn(highlighter, 'codeToHtml');

    render(<DiffViewer originalContent='before' modifiedContent='after' language='typescript' />);

    await waitFor(() => {
      expect(codeToHtml).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ theme: 'github-dark-high-contrast' }),
      );
    });
  });

  describe('per-language diff highlighting (no [!code] leak)', () => {
    it.each(supportedHighlightLanguages)('language %s: diff classes, no notation leak', async (language) => {
      const originalContent = 'alpha\nbeta\ngamma';
      const modifiedContent = 'alpha\nX\ngamma';

      const { container } = render(
        <DiffViewer originalContent={originalContent} modifiedContent={modifiedContent} language={language} />,
      );

      await waitFor(() => {
        expectDiffViewerShikiReady(container);
      });

      await waitFor(
        () => {
          const html = container.innerHTML;
          expect(html).not.toContain('[!code ++]');
          expect(html).not.toContain('[!code --]');
          expect(html).toMatch(/class="[^"]*\bdiff\b[^"]*\badd\b/);
          expect(html).toMatch(/class="[^"]*\bdiff\b[^"]*\bremove\b/);
        },
        { timeout: 15_000 },
      );
    });

    it('falls back to plaintext for unsupported languages without throwing', async () => {
      const { container } = render(
        <DiffViewer originalContent='alpha\nbeta' modifiedContent='alpha\npython' language='python' />,
      );

      await waitFor(() => {
        expectDiffViewerShikiReady(container);
      });

      await waitFor(() => {
        expect(container.innerHTML).toMatch(/class="[^"]*\bdiff\b[^"]*\badd\b/);
      });
    });
  });

  it('applies diff add to an empty added line', async () => {
    const { container } = render(<DiffViewer originalContent='a' modifiedContent={'a\n\nb'} language='typescript' />);

    await waitFor(() => {
      expectDiffViewerShikiReady(container);
    });

    await waitFor(
      () => {
        const html = container.innerHTML;
        expect(html).toMatch(/class="[^"]*\bdiff\b[^"]*\badd\b/);
        expect(html).not.toContain('[!code');
      },
      { timeout: 15_000 },
    );
  });

  /* The rule is asserted where it is declared, because jsdom has no layout. In
   * plaintext Shiki renders a blank line as a `.line` holding one empty span, so
   * a rule on `.line:empty` alone would leave it 0 px tall. */
  it('should keep a blank line one line tall', async () => {
    const { container } = render(<DiffViewer originalContent='' modifiedContent={'a\n\nb'} language='plaintext' />);
    await waitFor(() => {
      expectDiffViewerShikiReady(container);
    });

    const blankLine = await waitFor(
      () => {
        const line = [...container.querySelectorAll('.line.diff.add')].find((element) => element.textContent === '');
        expect(line).toBeInstanceOf(HTMLElement);
        return line;
      },
      { timeout: 15_000 },
    );

    expect(blankLine?.closest('pre')?.parentElement).toHaveClass('[&_.line]:min-h-[1.6em]');
  });

  it('should label hidden lines at the 12 px minimum text size', async () => {
    const originalContent = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].join('\n');
    const modifiedContent = ['l1', 'X', 'l3', 'l4', 'l5', 'l6', 'l7', 'Y'].join('\n');

    render(<DiffViewer originalContent={originalContent} modifiedContent={modifiedContent} language='typescript' />);

    const label = await screen.findByText('3 hidden lines', undefined, { timeout: 15_000 });
    expect(label.parentElement).toHaveClass('text-xs');
  });

  it('should render every line before the highlighter loads, so an opening disclosure measures its full height', () => {
    const { container } = render(
      <DiffViewer originalContent={'alpha\nbeta'} modifiedContent={'alpha\ngamma'} language='typescript' />,
    );

    expect((container.firstElementChild as HTMLElement).dataset['shikiState']).toBe('loading');
    expect([...container.querySelectorAll('.line')].map((line) => [line.textContent, line.className])).toEqual([
      ['alpha', 'line'],
      ['beta', 'line diff remove'],
      ['gamma', 'line diff add'],
    ]);
  });

  it('emits no diff add/remove classes when the two files are identical', async () => {
    const { container } = render(
      <DiffViewer originalContent='stable\nfile' modifiedContent='stable\nfile' language='usd' />,
    );

    await waitFor(() => {
      expectDiffViewerShikiReady(container);
    });

    expect(container.innerHTML).not.toContain('diff add');
    expect(container.innerHTML).not.toContain('diff remove');
    expect(container.innerHTML).not.toContain('[!code');
  });

  it('collapses distant hunks with a hidden-line separator', async () => {
    const originalContent = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].join('\n');
    const modifiedContent = ['l1', 'X', 'l3', 'l4', 'l5', 'l6', 'l7', 'Y'].join('\n');

    const { container } = render(
      <DiffViewer originalContent={originalContent} modifiedContent={modifiedContent} language='typescript' />,
    );

    await waitFor(() => {
      expectDiffViewerShikiReady(container);
    });

    await waitFor(
      () => {
        expect(container.innerHTML).toContain('hidden line');
      },
      { timeout: 15_000 },
    );
  });
});

describe('getDiffLineCount', () => {
  it('returns 0 when there is no visible diff', () => {
    expect(getDiffLineCount('same', 'same')).toBe(0);
  });

  it('counts code lines and one row per hidden separator', () => {
    expect(getDiffLineCount('a\nb\nc', 'a\nx\ny\nz\nc')).toBe(6);
  });
});

describe('getFirstChangedLine', () => {
  it('returns 1 when the first line differs', () => {
    expect(getFirstChangedLine('z\nb\nc', 'a\nb\nc')).toBe(1);
  });

  it('returns the line index of the first divergence when later lines match', () => {
    expect(getFirstChangedLine('a\nb\nc', 'a\nx\nc')).toBe(2);
  });

  it('returns 1 when there are no changes (function contract)', () => {
    expect(getFirstChangedLine('a', 'a')).toBe(1);
  });
});
