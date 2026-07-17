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
  it('should render null when no readme.md exists in files', () => {
    const { container } = render(<PublicationReadmeCard files={{ 'main.ts': 'https://x' }} visibility='public' />);
    expect(container.firstChild).toBeNull();
  });

  it('should match readme.md case-insensitively (README.md)', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Hello' });
    render(<PublicationReadmeCard files={{ 'README.md': 'https://blob/readme' }} visibility='public' />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://blob/readme', undefined);
    });
  });

  it('should match readme.md case-insensitively (Readme.MD)', () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Hi' });
    render(<PublicationReadmeCard files={{ 'Readme.MD': 'https://blob/case' }} visibility='public' />);
    expect(fetchMock).toHaveBeenCalledWith('https://blob/case', undefined);
  });

  it('should render MarkdownViewer with fetched content once loaded', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Title' });
    render(<PublicationReadmeCard files={{ 'readme.md': 'https://blob/raw' }} visibility='public' />);

    await waitFor(() => {
      expect(screen.getByText('# Title')).toBeDefined();
    });
  });

  it('should send session credentials when fetching a private publication readme', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Secret' });
    render(
      <PublicationReadmeCard
        files={{ 'README.md': 'https://api.test/v1/publications/pub_1/files?path=README.md' }}
        visibility='private'
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://api.test/v1/publications/pub_1/files?path=README.md', {
        credentials: 'include',
      });
    });
  });

  it('should not send credentials for public CDN readme fetches', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Open' });
    render(<PublicationReadmeCard files={{ 'README.md': 'https://cdn.example/blobs/ab' }} visibility='public' />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://cdn.example/blobs/ab', undefined);
    });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- end file-path window */
