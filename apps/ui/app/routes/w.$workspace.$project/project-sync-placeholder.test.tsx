import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LargeObjectsFacet } from '@taucad/revisions';
import {
  largeObjectsProgressText,
  ProjectSyncPlaceholder,
} from '#routes/w.$workspace.$project/project-sync-placeholder.js';

const mocks = vi.hoisted(() => ({ facet: undefined as LargeObjectsFacet | undefined, send: vi.fn() }));

vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/w/x/p', search: '' }), Link: () => null }));
vi.mock('#hooks/use-project-availability.js', () => ({
  useLargeObjects: () => mocks.facet,
  useProjectAvailability: () => 'ready',
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => ({ send: mocks.send }),
  useRevisionCommands: () => ({ connectRemote: vi.fn(), syncNow: vi.fn() }),
  useRevisionStatus: () => undefined,
}));

const facet = (changes: Partial<LargeObjectsFacet> = {}): LargeObjectsFacet => ({
  phase: 'fetching',
  paths: ['models/a.step'],
  objects: 12,
  totalObjects: 295,
  bytes: 3.1 * 1024 * 1024,
  totalBytes: 70 * 1024 * 1024,
  ...changes,
});

describe('model files placeholder', () => {
  it('says how far the download is in files and bytes', () => {
    expect(largeObjectsProgressText(facet())).toBe('12 of 295 files, 3.1 MB of 70.0 MB');
    expect(largeObjectsProgressText(facet({ objects: 0, totalObjects: 1, bytes: 0, totalBytes: 2048 }))).toBe(
      '0 of 1 file, 0 B of 2.0 KB',
    );
  });

  it('shows progress while the model files download', () => {
    mocks.facet = facet();
    render(<ProjectSyncPlaceholder state='files' />);
    expect(screen.getByRole('region', { name: 'Downloading model files' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('12 of 295 files, 3.1 MB of 70.0 MB')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Model files downloaded' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers a retry in the viewer when the download failed', async () => {
    mocks.facet = facet({ phase: 'failed', error: 'The remote did not answer in time.' });
    render(<ProjectSyncPlaceholder state='filesFailed' />);
    expect(screen.getByRole('region', { name: 'Couldn’t download model files' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.send).toHaveBeenCalledWith({ command: 'retryLargeObjects' });
  });
});
