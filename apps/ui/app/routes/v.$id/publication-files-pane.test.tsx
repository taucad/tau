import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicationFilesPane } from '#routes/v.$id/publication-files-pane.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, text: async () => 'file contents' });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

/* eslint-disable @typescript-eslint/naming-convention -- file-path keys can't be camelCase */
const files = {
  'main.ts': 'https://blob/main',
  'lib/util.ts': 'https://blob/util',
  'README.md': 'https://blob/readme',
};
/* eslint-enable @typescript-eslint/naming-convention -- end window */

describe('PublicationFilesPane', () => {
  it('should render the Files header strip', () => {
    render(<PublicationFilesPane entryPath='main.ts' files={files} visibility='public' />);
    expect(screen.getByText('Files')).toBeDefined();
  });

  it('should expose the side rail as a region for assistive tech', () => {
    render(<PublicationFilesPane entryPath='main.ts' files={files} visibility='public' />);
    const region = screen.getByRole('region', { name: 'Files' });
    expect(region.className).toContain('h-full');
    expect(region.className).toContain('min-h-0');
  });

  it('should mark the entry path with aria-current=page', () => {
    render(<PublicationFilesPane entryPath='main.ts' files={files} visibility='public' />);
    const entry = document.querySelector('[aria-current="page"]');
    expect(entry).not.toBeNull();
    expect(entry?.textContent).toContain('main.ts');
  });

  it('should fetch previews with session credentials for private publications', async () => {
    render(<PublicationFilesPane entryPath='main.ts' files={files} visibility='private' />);

    fireEvent.click(screen.getByText('main.ts'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://blob/main', { credentials: 'include' });
    });
  });

  it('should fetch previews without credentials for public publications', async () => {
    render(<PublicationFilesPane entryPath='main.ts' files={files} visibility='public' />);

    fireEvent.click(screen.getByText('main.ts'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('https://blob/main', undefined);
    });
  });
});
