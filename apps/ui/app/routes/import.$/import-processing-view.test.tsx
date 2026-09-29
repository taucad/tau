import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImportProcessingView } from '#routes/import.$/import-processing-view.js';

describe('ImportProcessingView', () => {
  it('should show one active step and only reported progress through repository import', () => {
    const { rerender } = render(<ImportProcessingView title='owner/model' source='github' phase='download' />);

    expect(screen.getByRole('status', { name: 'Importing' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('progressbar', { name: 'Downloading…' })).not.toHaveAttribute('aria-valuenow');
    expect(screen.queryByText(/\d+ \/ \d+ files/u)).not.toBeInTheDocument();

    rerender(
      <ImportProcessingView
        title='owner/model'
        source='github'
        phase='extract'
        downloadProgress={{ loaded: 2048, total: 2048 }}
        progress={{ processed: 2, total: 5 }}
      />,
    );

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('progressbar', { name: 'Extracting files…' })).toHaveAttribute('aria-valuenow', '40');
    expect(within(screen.getByRole('list')).getByText('2 / 5 files')).toBeVisible();
    expect(screen.getByText('Downloaded')).toBeVisible();
    expect(screen.getByText('2 KB')).toBeVisible();

    rerender(
      <ImportProcessingView title='owner/model' source='github' phase='create' progress={{ processed: 5, total: 5 }} />,
    );

    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('progressbar', { name: 'Creating project…' })).toBeVisible();
    expect(screen.getByText('Extracted')).toBeVisible();

    rerender(<ImportProcessingView title='owner/model' source='github' phase='create' isComplete />);

    expect(screen.getByRole('status', { name: 'Import complete' })).toHaveAttribute('aria-busy', 'false');
    expect(screen.getByRole('heading', { name: 'Import complete' })).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
