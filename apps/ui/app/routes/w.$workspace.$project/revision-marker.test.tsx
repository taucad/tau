import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionMarker } from '#routes/w.$workspace.$project/revision-marker.js';
import type { RevisionMarkerProps } from '#routes/w.$workspace.$project/revision-marker.js';
import type { Revision } from '#lib/file-restore-timeline.js';

const editorSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: editorSend } }),
}));

beforeEach(() => {
  editorSend.mockReset();
});

const revision = (over: Partial<Revision> = {}): Revision => ({
  n: 2,
  chatId: 'a',
  messageId: 'u1',
  anchor: new Date('2026-07-09T14:14:00').getTime(),
  cutoffSeq: 1,
  files: [
    { path: 'main.geospec.ts', linesAdded: 42, linesRemoved: 3 },
    { path: 'bracket.scad', linesAdded: 11, linesRemoved: 0 },
  ],
  changedPaths: ['main.geospec.ts', 'bracket.scad'],
  linesAdded: 53,
  linesRemoved: 3,
  ...over,
});

const renderMarker = (
  props: Partial<RevisionMarkerProps> = {},
): { onRestore: ReturnType<typeof vi.fn>; onDiscard: ReturnType<typeof vi.fn> } => {
  const onRestore = vi.fn();
  const onDiscard = vi.fn();
  render(
    <RevisionMarker
      revision={revision()}
      isActive={false}
      isModified={false}
      isBusy={false}
      onRestore={onRestore}
      onDiscard={onDiscard}
      {...props}
    />,
  );
  return { onRestore, onDiscard };
};

describe('RevisionMarker', () => {
  it('T-RM-FILES: lists each changed file with its own colored line counts', () => {
    renderMarker();
    expect(screen.getByText('main.geospec.ts')).not.toBeNull();
    expect(screen.getByText('bracket.scad')).not.toBeNull();
    expect(screen.getByText('+42')).not.toBeNull();
    expect(screen.getByText('-3')).not.toBeNull();
    expect(screen.getByText('+11')).not.toBeNull(); // Second file, additions only.
  });

  it('T-RM-DATE: switches from time-only to date + time at the component-width breakpoint', () => {
    renderMarker();
    const date = new Date(revision().anchor);
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
    const { onDiscard } = renderMarker({ isActive: true, isModified: true });
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
    fireEvent.click(screen.getByRole('button', { name: /main\.geospec\.ts/ }));
    expect(editorSend).toHaveBeenCalledWith({
      type: 'openFile',
      path: 'main.geospec.ts',
      source: 'user',
      lineNumber: 1,
      column: 1,
    });
  });

  const manyFiles = (count: number): Revision['files'] =>
    Array.from({ length: count }, (_unused, index) => ({
      path: `file-${index}.ts`,
      linesAdded: 1,
      linesRemoved: 0,
    }));

  it('T-RM-FILES-LIMIT: shows only the first 3 files by default, with a trigger for the rest', () => {
    renderMarker({ revision: revision({ files: manyFiles(5) }) });
    expect(screen.getByText('file-0.ts')).not.toBeNull();
    expect(screen.getByText('file-2.ts')).not.toBeNull();
    expect(screen.queryByText('file-3.ts')).toBeNull();
    expect(screen.queryByText('file-4.ts')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show 2 more files' })).not.toBeNull();
  });

  it('T-RM-FILES-NO-TRIGGER: no expand trigger when 3 or fewer files changed', () => {
    renderMarker({ revision: revision({ files: manyFiles(3) }) });
    expect(screen.queryByRole('button', { name: /Show .* more file/ })).toBeNull();
  });

  it('T-RM-FILES-EXPAND: expands to reveal the rest, then collapses back', () => {
    renderMarker({ revision: revision({ files: manyFiles(4) }) });
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more file' }));
    expect(screen.getByText('file-3.ts')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse files' }));
    expect(screen.queryByText('file-3.ts')).toBeNull();
  });
});
