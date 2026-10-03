import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { publishRecordIssue } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';

const state = vi.hoisted(() => ({ debug: false }));
const editorSend = vi.hoisted(() => vi.fn());

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    projectId: 'radial',
    projectRef: { getSnapshot: () => ({ context: { project: { name: 'Radial Engine' } } }) },
    editorRef: { send: editorSend },
  }),
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => state.debug }));

const { RecordIssuesAction } = await import('#routes/w.$workspace.$project/record-issues-action.js');

const encoder = new TextEncoder();
const historical = encoder.encode(
  JSON.stringify({
    version: 1,
    entries: {
      'main.ts': { operationTimeout: 240_000, components: { hidden: ['housing'], isolated: [], opacity: [] } },
      'carrier.ts': { renderTimeout: 90_000 },
    },
  }),
);
const issue = (overrides: Partial<RecordIssue>): RecordIssue => ({
  kind: 'entries',
  path: '.tau/workbench/entries.json',
  state: 'invalid',
  message: 'entries.main.ts: Unrecognized key: "operationTimeout"',
  bytes: historical,
  writing: false,
  retryRead: vi.fn(async () => true),
  retrySave: vi.fn(async () => true),
  reset: vi.fn(async () => true),
  repair: vi.fn(async () => true),
  ...overrides,
});
const publish = (id: string, value: RecordIssue | undefined): void => {
  act(() => {
    publishRecordIssue('radial', id, value);
  });
};
const renderAction = () =>
  render(
    <TooltipProvider>
      <RecordIssuesAction />
    </TooltipProvider>,
  );

afterEach(() => {
  for (const id of ['entries', 'view', 'layout']) {
    publishRecordIssue('radial', id, undefined);
  }
  state.debug = false;
  editorSend.mockReset();
});

describe('RecordIssuesAction', () => {
  it('renders no trigger while every record is fine', () => {
    renderAction();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names the most urgent state and the record count, and the popover is named by its title', async () => {
    renderAction();
    publish('entries', issue({}));
    publish('layout', issue({ kind: 'layout', path: '.tau/workbench/layout.json', state: 'unconfirmed' }));
    const trigger = screen.getByRole('button', { name: 'Save not confirmed · 2 records' });
    expect(screen.getByRole('status').textContent).toBe('Save not confirmed · 2 records');
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Save not confirmed' });
    expect(within(dialog).getByText('Radial Engine · 2 settings records')).toBeDefined();
    expect(within(dialog).getByRole('listitem', { name: 'Pane layout' })).toBeDefined();
    expect(within(dialog).getByRole('listitem', { name: 'Model display settings' })).toBeDefined();
  });

  it('applies the reviewed known-key correction against the reviewed bytes, and reports a changed file', async () => {
    const repair = vi.fn(async () => false);
    renderAction();
    publish('entries', issue({ repair }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings not applied · 1 record' }));
    const row = await screen.findByRole('listitem', { name: 'Model display settings' });
    expect(row.textContent).toContain('240000 ms kept, 1 other entry unchanged');
    await userEvent.click(within(row).getByRole('button', { name: 'Apply correction' }));
    expect(repair).toHaveBeenCalledWith(
      {
        version: 1,
        entries: {
          'main.ts': { renderTimeout: 240_000, components: { hidden: ['housing'], isolated: [], opacity: [] } },
          'carrier.ts': { renderTimeout: 90_000 },
        },
      },
      historical,
    );
    expect(await within(row).findByText('The file changed since you reviewed it. Nothing was replaced.')).toBeDefined();
  });

  it('offers Reset only for invalid records, behind a named confirmation checked against reviewed bytes', async () => {
    const reset = vi.fn(async () => true);
    renderAction();
    publish('entries', issue({ bytes: encoder.encode('{broken'), reset }));
    publish('layout', issue({ kind: 'layout', path: '.tau/workbench/layout.json', state: 'newer', bytes: null }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings not applied · 2 records' }));
    const layout = await screen.findByRole('listitem', { name: 'Pane layout' });
    expect(within(layout).queryByRole('button', { name: /More actions/u })).toBeNull();
    const entries = screen.getByRole('listitem', { name: 'Model display settings' });
    expect(within(entries).queryByRole('button', { name: 'Apply correction' })).toBeNull();
    await userEvent.click(within(entries).getByRole('button', { name: 'More actions for Model display settings' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Reset settings…' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Reset model display settings?' });
    expect(confirm.textContent).toContain('every model in Radial Engine');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reset settings' }));
    expect(reset).toHaveBeenCalledWith(encoder.encode('{broken'));
  });

  it('does not start a replacement write while the original is still outstanding', async () => {
    const retrySave = vi.fn(async () => true);
    renderAction();
    publish(
      'layout',
      issue({ kind: 'layout', path: '.tau/workbench/layout.json', state: 'unconfirmed', writing: true, retrySave }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save not confirmed · 1 record' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Retry save' }));
    expect(retrySave).not.toHaveBeenCalled();
    expect(screen.getByText('Still waiting for the original write. No replacement write started.')).toBeDefined();
  });

  it('opens the refused file in the editor and keeps the raw message behind the debug setting', async () => {
    const view = renderAction();
    publish('entries', issue({}));
    await userEvent.click(screen.getByRole('button', { name: 'Settings not applied · 1 record' }));
    expect(screen.queryByText(/Unrecognized key/u)).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Open file' }));
    expect(editorSend).toHaveBeenCalledWith({ type: 'openFile', path: '.tau/workbench/entries.json', source: 'user' });
    view.unmount();
    state.debug = true;
    renderAction();
    await userEvent.click(screen.getByRole('button', { name: 'Settings not applied · 1 record' }));
    expect(await screen.findByText('entries.main.ts: Unrecognized key: "operationTimeout"')).toBeDefined();
  });

  it('never reopens the popover by itself when a cleared record needs a person again', async () => {
    renderAction();
    publish('entries', issue({}));
    await userEvent.click(screen.getByRole('button', { name: 'Settings not applied · 1 record' }));
    expect(await screen.findByRole('dialog', { name: 'Settings not applied' })).toBeDefined();
    publish('entries', undefined);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    publish('entries', issue({ bytes: encoder.encode('{broken') }));
    expect(screen.getByRole('button', { name: 'Settings not applied · 1 record' })).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('retries an unavailable read and leaves when the record recovers', async () => {
    const retryRead = vi.fn(async () => true);
    renderAction();
    publish(
      'view',
      issue({
        kind: 'view',
        path: '.tau/workbench/views/v-1.json',
        entry: 'main.ts',
        state: 'unavailable',
        bytes: null,
        retryRead,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings unavailable · 1 record' }));
    const row = await screen.findByRole('listitem', { name: 'View settings · main.ts' });
    await userEvent.click(within(row).getByRole('button', { name: 'Try again' }));
    expect(retryRead).toHaveBeenCalledTimes(1);
    publish('view', undefined);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Settings unavailable/u })).toBeNull();
    });
  });
});
