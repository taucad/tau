import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionMarker } from '#routes/w.$workspace.$project/revision-marker.js';
import type { RevisionMarkerProps } from '#routes/w.$workspace.$project/revision-marker.js';
import type { RevisionDiffEntry } from '@taucad/revisions';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const editorSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'p', editorRef: { send: editorSend } }),
}));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#components/code/diff-viewer.js', () => ({
  DiffViewer: ({ originalContent, modifiedContent }: { originalContent: string; modifiedContent: string }) => (
    <pre data-testid='diff'>{`${originalContent}|${modifiedContent}`}</pre>
  ),
}));

beforeEach(() => {
  editorSend.mockReset();
  revisionStatusHarness.reset();
});

const anchor = new Date('2026-07-09T14:14:00').getTime();

const revision = (over: Partial<RevisionCard> = {}): RevisionCard => ({
  revisionId: 'rev-2',
  n: 2,
  createdAt: anchor,
  summary: 'Agent turn u1',
  actor: 'tau-browser-agent-host',
  turnId: 'u1',
  conflicted: false,
  ...over,
});

const changes: readonly RevisionDiffEntry[] = [
  { path: 'main.geospec.ts', kind: 'modified' },
  { path: 'bracket.scad', kind: 'added' },
];

const renderMarker = (
  props: Partial<RevisionMarkerProps> = {},
): { onRestore: ReturnType<typeof vi.fn>; onDiscard: ReturnType<typeof vi.fn> } => {
  const onRestore = vi.fn();
  const onDiscard = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RevisionMarker
        revision={revision()}
        changes={changes}
        isActive={false}
        isModified={false}
        isBusy={false}
        onRestore={onRestore}
        onDiscard={onDiscard}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onRestore, onDiscard };
};

describe('RevisionMarker', () => {
  it('T-RM-FILES: lists each changed path with how it changed', () => {
    renderMarker();
    expect(screen.getByText('main.geospec.ts')).not.toBeNull();
    expect(screen.getByText('bracket.scad')).not.toBeNull();
    expect(screen.getByText('Changed')).not.toBeNull();
    expect(screen.getByText('Added')).not.toBeNull();
  });

  it('T-RM-COMPARE: a file row opens the shared diff viewer over the revision and its parent (S38)', async () => {
    revisionStatusHarness.comparison = { original: 'before', modified: 'after' };
    renderMarker();
    fireEvent.click(screen.getByRole('button', { name: 'Compare main.geospec.ts' }));
    const diff = await screen.findByTestId('diff');
    expect(diff.textContent).toBe('before|after');
  });

  it('T-RM-UNNUMBERED: a revision this branch does not number says so instead of inventing one', () => {
    renderMarker({ revision: revision({ n: undefined }) });
    expect(screen.getAllByText('Revision').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Rev \d/)).toBeNull();
  });

  it('T-RM-DATE: switches from time-only to date + time at the component-width breakpoint', () => {
    renderMarker();
    const date = new Date(anchor);
    const time = screen.getByText(date.toLocaleTimeString(undefined, { timeStyle: 'short' }));
    const timestamp = screen.getByText(date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
    expect(time.className).toContain('@[22rem]:hidden');
    expect(timestamp.className).toContain('@[22rem]:inline');
  });

  it('T-RM-LABEL: switches from Rev to Revision at the component-width breakpoint', () => {
    renderMarker();
    expect(screen.getByText('Rev 2').className).toContain('@[30rem]:hidden');
    expect(screen.getByText('Revision 2').className).toContain('@[30rem]:inline');
  });

  it('T-RM-INACTIVE: an inactive revision offers Restore (and fires it) with no Current/Modified', () => {
    const { onRestore } = renderMarker({ isActive: false });
    expect(screen.queryByText('Current')).toBeNull();
    expect(screen.queryByText('Modified')).toBeNull();
    const restoreButton = screen.getByRole('button', { name: 'Restore to Revision 2' });
    fireEvent.click(restoreButton);
    expect(onRestore).toHaveBeenCalledOnce();
    // Restore sits in the header row, in Current's slot — not a separate footer.
    expect(restoreButton.parentElement).toBe(screen.getByText('Revision 2').parentElement);
  });

  it('T-RM-ACTIVE: the active revision reads Current and offers no Restore', () => {
    renderMarker({ isActive: true });
    expect(screen.getByText('Current')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('T-RM-MODIFIED: an active + modified revision reads Modified and offers Discard (firing it)', () => {
    const { onDiscard } = renderMarker({ isActive: true, isModified: true, changes: [] });
    expect(screen.getByText('Modified')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Discard changes/ }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('T-RM-BUSY: disables the Restore action while a restore is in flight', () => {
    renderMarker({ isActive: false, isBusy: true });
    expect(screen.getByRole('button', { name: 'Restore to Revision 2' }).hasAttribute('disabled')).toBe(true);
  });

  it('T-RM-RESTORING: swaps the Restore icon for the design-system spinner when clicked', () => {
    renderMarker({ isActive: false });
    const restoreButton = screen.getByRole('button', { name: 'Restore to Revision 2' });
    fireEvent.click(restoreButton);
    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull();
  });

  it('T-RM-DISCARDING: swaps the Discard icon for the design-system spinner when clicked', () => {
    renderMarker({ isActive: true, isModified: true });
    fireEvent.click(screen.getByRole('button', { name: /Discard changes/ }));
    expect(screen.getByRole('status', { name: 'Loading' })).not.toBeNull();
  });

  it('T-RM-FILE-OPEN: clicking a file row opens it in the editor', () => {
    renderMarker();
    fireEvent.click(screen.getByRole('button', { name: 'main.geospec.ts' }));
    expect(editorSend).toHaveBeenCalledWith({
      type: 'openFile',
      path: 'main.geospec.ts',
      source: 'user',
      lineNumber: 1,
      column: 1,
    });
  });

  const manyFiles = (count: number): readonly RevisionDiffEntry[] =>
    Array.from({ length: count }, (_unused, index) => ({ path: `file-${index}.ts`, kind: 'modified' }) as const);

  it('T-RM-FILES-LIMIT: shows only the first 3 files by default, with a trigger for the rest', () => {
    renderMarker({ changes: manyFiles(5) });
    expect(screen.getByText('file-0.ts')).not.toBeNull();
    expect(screen.getByText('file-2.ts')).not.toBeNull();
    expect(screen.queryByText('file-3.ts')).toBeNull();
    expect(screen.queryByText('file-4.ts')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show 2 more files' })).not.toBeNull();
  });

  it('T-RM-FILES-NO-TRIGGER: no expand trigger when 3 or fewer files changed', () => {
    renderMarker({ changes: manyFiles(3) });
    expect(screen.queryByRole('button', { name: /Show .* more file/ })).toBeNull();
  });

  it('T-RM-FILES-EXPAND: expands to reveal the rest, then collapses back', () => {
    renderMarker({ changes: manyFiles(4) });
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more file' }));
    expect(screen.getByText('file-3.ts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse files' }));
    expect(screen.queryByText('file-3.ts')).toBeNull();
  });
});
