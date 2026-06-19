import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PublicationFilesPane } from '#routes/v.$id/publication-files-pane.js';

/* eslint-disable @typescript-eslint/naming-convention -- file-path keys can't be camelCase */
const files = {
  'main.ts': 'https://blob/main',
  'lib/util.ts': 'https://blob/util',
  'README.md': 'https://blob/readme',
};
/* eslint-enable @typescript-eslint/naming-convention -- end window */

describe('PublicationFilesPane', () => {
  it('renders the Files header strip', () => {
    render(<PublicationFilesPane entryFile='main.ts' files={files} />);
    expect(screen.getByText('Files')).toBeDefined();
  });

  it('exposes the side rail as a region for assistive tech', () => {
    render(<PublicationFilesPane entryFile='main.ts' files={files} />);
    const region = screen.getByRole('region', { name: 'Files' });
    expect(region.className).toContain('h-full');
    expect(region.className).toContain('min-h-0');
  });

  it('marks the entry file with aria-current=page', () => {
    render(<PublicationFilesPane entryFile='main.ts' files={files} />);
    const entry = document.querySelector('[aria-current="page"]');
    expect(entry).not.toBeNull();
    expect(entry?.textContent).toContain('main.ts');
  });
});
