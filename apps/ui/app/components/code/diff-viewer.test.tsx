// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { DiffViewer, getDiffLineCount, getFirstChangedLine } from '#components/code/diff-viewer.js';
import { getHighlighter } from '#lib/shiki.lib.js';
import { supportedHighlightLanguages } from '#lib/code-language-resolution.js';

vi.mock('#hooks/use-theme.js', () => ({
  useTheme: (): { theme: string } => ({ theme: 'light' }),
}));

beforeAll(async () => {
  await getHighlighter();
});

function expectDiffViewerShikiReady(container: HTMLElement): void {
  const root = container.firstElementChild;
  expect(root).toBeInstanceOf(HTMLElement);
  expect((root as HTMLElement).dataset['shikiState']).toBe('ready');
}

describe('DiffViewer', () => {
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
