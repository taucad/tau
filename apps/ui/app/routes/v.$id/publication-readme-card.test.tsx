import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicationReadmeCard } from '#routes/v.$id/publication-readme-card.js';

const fetchMock = vi.fn();

const markdownMocks = vi.hoisted(() => ({ lastChildren: '' }));

vi.mock('#components/markdown/markdown-viewer.js', () => ({
  MarkdownViewer: ({ children }: { children: string }) => {
    markdownMocks.lastChildren = children;
    return <div data-slot='markdown-viewer-stub'>{children}</div>;
  },
}));

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  // No-op placeholder for symmetry with future per-test cleanup.
});

/* eslint-disable @typescript-eslint/naming-convention -- file-path keys can't be camelCase */
describe('PublicationReadmeCard', () => {
  it('renders null when no readme.md exists in files', () => {
    const { container } = render(<PublicationReadmeCard files={{ 'main.ts': 'https://x' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('matches readme.md case-insensitively (README.md)', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Hello' });
    render(<PublicationReadmeCard files={{ 'README.md': 'https://blob/readme' }} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://blob/readme');
    });
  });

  it('matches readme.md case-insensitively (Readme.MD)', () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Hi' });
    render(<PublicationReadmeCard files={{ 'Readme.MD': 'https://blob/case' }} />);
    expect(fetchMock).toHaveBeenCalledWith('https://blob/case');
  });

  it('renders MarkdownViewer with fetched content once loaded', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Title' });
    render(<PublicationReadmeCard files={{ 'readme.md': 'https://blob/raw' }} />);

    await waitFor(() => {
      expect(screen.getByText('# Title')).toBeDefined();
    });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end file-path window */
