import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeViewer } from '#components/code/code-viewer.js';

const useThemeMock = vi.hoisted(() => vi.fn());
const useShikiHighlighterMock = vi.hoisted(() =>
  vi.fn((_text: string, _language: string, theme: string): ReactNode => <output>{theme}</output>),
);

vi.mock('#hooks/use-theme.js', () => ({ useTheme: useThemeMock }));
vi.mock('#lib/shiki.lib.js', () => ({ getHighlighter: vi.fn(async () => ({})) }));
vi.mock('react-shiki/core', () => ({ useShikiHighlighter: useShikiHighlighterMock }));

describe('CodeViewer', () => {
  beforeEach(() => {
    useThemeMock.mockReturnValue({ theme: 'light', isHighContrast: false });
    useShikiHighlighterMock.mockClear();
  });

  it('should select the high-contrast Shiki palette when contrast is enhanced', async () => {
    useThemeMock.mockReturnValue({ theme: 'dark', isHighContrast: true });

    render(<CodeViewer text='const answer = 42;' language='typescript' />);

    expect(await screen.findByText('github-dark-high-contrast')).toBeInTheDocument();
    expect(useShikiHighlighterMock).toHaveBeenCalledWith(
      'const answer = 42;',
      'typescript',
      'github-dark-high-contrast',
      expect.objectContaining({ delay: 150 }),
    );
  });
});
