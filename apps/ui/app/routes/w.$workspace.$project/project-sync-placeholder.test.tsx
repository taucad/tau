import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LargeObjectsFacet } from '@taucad/revisions';
import {
  largeObjectsProgressText,
  ProjectSyncPlaceholder,
} from '#routes/w.$workspace.$project/project-sync-placeholder.js';

const mocks = vi.hoisted(() => ({
  facet: undefined as LargeObjectsFacet | undefined,
  send: vi.fn(),
  status: undefined as unknown,
  /* The session's word that the file check has outlasted its patience (A14). */
  slow: false,
}));

vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/w/x/p', search: '' }), Link: () => null }));
vi.mock('#hooks/use-project-availability.js', () => ({
  useLargeObjects: () => mocks.facet,
  useProjectAvailability: () => 'ready',
  useFileCheckSlow: () => mocks.slow,
}));
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'p' }),
}));
vi.mock('#hooks/use-sessions.js', () => ({
  useSessions: () => ({
    getSnapshot: () => ({
      context: {
        status: { p: { availability: mocks.slow ? 'slow' : 'pending' } },
      },
    }),
    subscribe: () => ({ unsubscribe: () => undefined }),
  }),
}));
vi.mock('#hooks/use-revision-status.js', () => ({
  useRevisionClient: () => ({ send: mocks.send }),
  useRevisionCommands: () => ({ connectRemote: vi.fn(), syncNow: vi.fn() }),
  useRevisionStatus: () => mocks.status,
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
    mocks.facet = facet({ phase: 'failed', error: 'Backup is taking too long. Tau will try again.' });
    render(<ProjectSyncPlaceholder state='filesFailed' />);
    expect(screen.getByRole('region', { name: 'Couldn’t download model files' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.send).toHaveBeenCalledWith({ command: 'retryLargeObjects' });
  });

  /* T5: no download runs, so it never says one does; a wait the session reports slow offers a way out (A14). */
  /* P-j (A15e): the pane keeps its bare frame, with the check's words in a wait indicator CSS reveals from 1,000 ms. */
  it('keeps the pane frame with "Checking model files", never a "Preparing model" block, and offers a retry once the session reports it slow', () => {
    mocks.facet = undefined;
    mocks.slow = false;
    mocks.send.mockClear();
    const { rerender } = render(<ProjectSyncPlaceholder state='filesChecking' />);
    const region = screen.getByRole('region', { name: 'Checking model files' });
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('region', { name: 'Preparing model' })).not.toBeInTheDocument();
    expect(region.querySelector('[data-slot="wait-indicator"]')).toHaveAttribute('data-state', 'waiting');
    expect(region).toHaveTextContent('Checking model files…');
    expect(screen.queryByText('Downloading model files')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    mocks.slow = true;
    rerender(<ProjectSyncPlaceholder state='filesChecking' />);
    expect(region).toHaveTextContent('Still checking model files…');
    act(() => {
      screen.getByRole('button', { name: 'Try again' }).click();
    });
    expect(mocks.send).toHaveBeenCalledWith({ command: 'retryLargeObjects' });
    mocks.slow = false;
  });
});

describe('project files placeholder', () => {
  const status = (
    remote: Readonly<Record<string, unknown>>,
    sync: Readonly<Record<string, unknown>> = {},
  ): unknown => ({
    remote: { phase: 'failed', reason: undefined, error: undefined, ...remote },
    sync: { state: 'idle', reason: undefined, error: undefined, ...sync },
  });

  /* A refused connect-time push is not a download that did not finish. */
  it('says a refused open could not be backed up, and offers History', () => {
    mocks.status = status({ reason: 'rejected', error: 'The remote refused refs/heads/main.' });
    render(<ProjectSyncPlaceholder state='failed' />);
    expect(screen.getByRole('region', { name: 'Couldn’t back up this project' })).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t open this project')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('says a conflicted open needs a decision', () => {
    mocks.status = status({ phase: 'connected' }, { state: 'conflicted' });
    render(<ProjectSyncPlaceholder state='failed' />);
    expect(screen.getByRole('region', { name: 'Needs your decision' })).toBeInTheDocument();
  });

  it('keeps the download copy for a failure that names no class', () => {
    mocks.status = status({ reason: 'unknown', error: 'The download stopped.' });
    render(<ProjectSyncPlaceholder state='failed' />);
    expect(screen.getByRole('region', { name: 'Couldn’t open this project' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
