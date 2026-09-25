// @vitest-environment jsdom
/**
 * One History row and a revision's More (charter D7; canvas rounds 3–21).
 *
 * The row is scripted through the one revision harness, so what is asserted is
 * what a person sees and what the row sends back — never a worker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RevisionMenu, RevisionRow } from '#routes/w.$workspace.$project/revision-marker.js';
import { revisionTitle } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionRowProps } from '#routes/w.$workspace.$project/revision-marker.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#environment.config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireClientEnvironmentUrl: () => 'https://api.test',
}));
vi.mock('#components/code/diff-viewer.js', () => ({
  DiffViewer: ({
    originalContent,
    modifiedContent,
    language,
  }: {
    originalContent: string;
    modifiedContent: string;
    language?: string;
  }) => <pre data-testid='diff' data-language={language}>{`${originalContent}|${modifiedContent}`}</pre>,
}));

beforeEach(() => {
  revisionStatusHarness.reset();
  revisionStatusHarness.diff = [
    { path: 'main.geospec.ts', kind: 'modified' },
    { path: 'bracket.scad', kind: 'added' },
  ];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const card = (over: Partial<RevisionCard> = {}): RevisionCard => ({
  revisionId: 'rev-2',
  n: 2,
  createdAt: new Date('2026-07-09T14:14:00').getTime(),
  summary: 'Thicker base',
  actor: 'Tau agent',
  turnId: 'u1',
  conflicted: false,
  trigger: 'turn',
  ...over,
});

const onRestore = vi.fn();
const onUndoRestore = vi.fn();

/** The row, owning its own open state as History does. */
function Row(props: Partial<RevisionRowProps>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(props.isOpen ?? false);
  const revision = props.revision ?? card();
  return (
    <ol>
      <RevisionRow
        revision={revision}
        title={revisionTitle(revision, [revision])}
        isCurrent={false}
        isDirty={false}
        branch='main'
        isBusy={false}
        onRestore={onRestore}
        onUndoRestore={onUndoRestore}
        {...props}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </ol>
  );
}

const renderRow = (props: Partial<RevisionRowProps> = {}): void => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Row {...props} />
    </QueryClientProvider>,
  );
};

const openRow = async (user: ReturnType<typeof userEvent.setup>, name = 'Rev 2 · Thicker base'): Promise<void> => {
  await user.click(screen.getByRole('button', { name }));
};

describe('RevisionRow', () => {
  it('is one button at rest, naming the revision by Rev N and its title (canvas round 8)', () => {
    renderRow();
    const item = screen.getByRole('listitem');
    expect(within(item).getAllByRole('button')).toHaveLength(1);
    expect(within(item).getByRole('button', { name: 'Rev 2 · Thicker base' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(item).toHaveTextContent('Tau agent');
  });

  it('never shows who made your own revision, nor a raw actor id (HQ4)', () => {
    renderRow({ revision: card({ actor: 'You' }) });
    const item = screen.getByRole('listitem');
    expect(item).not.toHaveTextContent('You');
    expect(item.textContent).not.toMatch(/user_|anon:|^agent$/u);
  });

  it('says so instead of inventing a number for a revision off this line', () => {
    renderRow({ revision: card({ n: undefined }) });
    expect(screen.getByRole('button', { name: 'Revision · Thicker base' })).toBeInTheDocument();
    expect(screen.queryByText(/Rev \d/u)).toBeNull();
  });

  it('opens to its files, each row opening the shared comparison in its path’s language (S38)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.comparison = { original: 'cube(1);', modified: 'cube(2);' };
    renderRow();
    await openRow(user);

    expect(screen.getByText('main.geospec.ts')).toBeInTheDocument();
    expect(screen.getByText('Added')).toHaveClass('text-muted-foreground/90', 'group-hover/file:text-muted-foreground');
    await user.click(screen.getByRole('button', { name: 'Compare bracket.scad' }));
    expect(await screen.findByTestId('diff')).toHaveAttribute('data-language', 'openscad');
    expect(screen.getByTestId('diff')).toHaveTextContent('cube(1);|cube(2);');
  });

  it('tells a failed comparison from an empty file, and retries it', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.comparisonError = new Error('Tree is unavailable');
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Compare main.geospec.ts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not compare main.geospec.ts. Tree is unavailable',
    );
    revisionStatusHarness.comparisonError = undefined;
    revisionStatusHarness.comparison = { original: 'a', modified: 'b' };
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('diff')).toHaveTextContent('a|b');
  });

  it('restores a revision it is not on, naming it in the button’s accessible name', async () => {
    const user = userEvent.setup();
    onRestore.mockClear();
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Restore Rev 2' }));
    expect(onRestore).toHaveBeenCalledWith('rev-2');
  });

  it('offers no Restore on the revision you are on, and reads Current', async () => {
    const user = userEvent.setup();
    renderRow({ isCurrent: true });
    expect(screen.getByRole('listitem')).toHaveTextContent('Current');
    await openRow(user);
    expect(screen.queryByRole('button', { name: /^Restore/u })).not.toBeInTheDocument();
  });

  /* A9, RV-D1: a restore is a new row named by what it restored, never a Rewind. */
  it('names a restore row by its provenance, with the Restored glyph', () => {
    const restored = card({ revisionId: 'rev-5', n: 5, summary: 'Restore', trigger: 'restore', restoredFrom: 'rev-3' });
    const target = card({ revisionId: 'rev-3', n: 3 });
    expect(revisionTitle(restored, [restored, target])).toBe('Restored Rev 3');
    renderRow({ revision: restored, title: 'Restored Rev 3' });
    expect(screen.getByRole('button', { name: 'Rev 5 · Restored Rev 3' })).toBeInTheDocument();
    expect(screen.getByLabelText('Restored')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rewind/u)).toBeNull();
  });

  it('offers Undo restore on the restore row you are on while nothing landed after it (D2)', async () => {
    const user = userEvent.setup();
    onUndoRestore.mockClear();
    renderRow({
      revision: card({ restoredFrom: 'rev-1', trigger: 'restore' }),
      title: 'Restored Rev 1',
      isCurrent: true,
    });
    await openRow(user, 'Rev 2 · Restored Rev 1');
    await user.click(screen.getByRole('button', { name: 'Undo restore' }));
    expect(onUndoRestore).toHaveBeenCalledOnce();
  });

  it('ends its actions with More and Details, which wrap as one pair (rounds 14–18)', async () => {
    const user = userEvent.setup();
    renderRow();
    await openRow(user);
    const row = document.querySelector('[data-slot="row-actions"]');
    expect(row).toHaveClass('@container/actions', 'flex-wrap', 'justify-between');
    const end = row?.querySelector('[data-slot="actions-end"]');
    expect(within(end as HTMLElement).getByRole('button', { name: 'More actions for Rev 2' })).toBeInTheDocument();
    await user.click(within(end as HTMLElement).getByRole('button', { name: 'Details' }));
    const details = document.querySelector('dl[aria-label="Details for Rev 2"]');
    expect(details).toHaveTextContent('rev-2');
    expect(details).toHaveTextContent('Agent turn');
  });

  /* W1 Details: the revision a row follows, and a first revision that follows none. */
  it('names the parent it follows in Details, and says a first revision has none', async () => {
    const user = userEvent.setup();
    renderRow({ revision: card({ parent: 'rev-1' }) });
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(document.querySelector('dl[aria-label="Details for Rev 2"]')).toHaveTextContent(/Parent\s*rev-1/u);
  });

  it('says a branch’s first revision follows none', async () => {
    const user = userEvent.setup();
    renderRow({ revision: card({ revisionId: 'rev-1', n: 1 }) });
    await openRow(user, 'Rev 1 · Thicker base');
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(document.querySelector('dl[aria-label="Details for Rev 1"]')).toHaveTextContent(
      /Parent\s*None \(first revision\)/u,
    );
  });

  /* Canvas round 4b: the whole revision against the current files, from the row's More. */
  it('compares the whole revision with the current files from More, and returns to its own changes', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-5' };
    revisionStatusHarness.comparison = { original: 'cube(1);', modified: 'cube(5);' };
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Compare with current' }));

    const since = await screen.findByRole('list', { name: 'Changed since Rev 2' });
    expect(revisionStatusHarness.diffRequests).toContain('rev-2..rev-5');
    await user.click(within(since).getByRole('button', { name: 'Compare bracket.scad with the current file' }));
    expect(await screen.findByTestId('diff')).toHaveTextContent('cube(1);|cube(5);');

    await user.click(screen.getByRole('button', { name: 'Stop comparing' }));
    expect(screen.getByRole('list', { name: 'Changed files' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Changed since Rev 2' })).not.toBeInTheDocument();
  });

  it('says so when nothing changed since the revision', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-5' };
    renderRow();
    await openRow(user);
    revisionStatusHarness.diff = [];
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Compare with current' }));
    expect(await screen.findByRole('note')).toHaveTextContent('No changes since Rev 2.');
  });

  it('offers no Compare with current on the revision you are on, which already compares with your edits', async () => {
    const user = userEvent.setup();
    renderRow({ isCurrent: true, isDirty: true });
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    expect(screen.queryByRole('menuitem', { name: 'Compare with current' })).not.toBeInTheDocument();
  });

  it('gives every target at least 24 × 24 CSS px', async () => {
    const user = userEvent.setup();
    renderRow({ revision: card({ tags: ['v1'] }) });
    await openRow(user, 'Rev 2 · v1');
    await user.click(screen.getByRole('button', { name: 'Details' }));
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/\b(h-6|size-6|min-h-6|h-8|h-9|size-8)\b/u);
    }
  });
});

const renderMenu = (revision: RevisionCard = card({ tags: ['v1'] })): void => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RevisionMenu revision={revision} isCurrent={false} branch='main' />
    </QueryClientProvider>,
  );
};

describe('RevisionMenu', () => {
  it('keeps the menu open on Copied, so the person sees the answer (round 14)', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Copy revision id' }));

    expect(writeText).toHaveBeenCalledWith('rev-2');
    expect(await screen.findByRole('menuitem', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('names a version in the one naming form, and Cancel or Escape return focus to More (round 16)', async () => {
    const user = userEvent.setup();
    renderMenu(card());
    const more = screen.getByRole('button', { name: 'More actions for Rev 2' });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Name version…' }));
    const field = await screen.findByRole('textbox', { name: 'Name Rev 2' });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(more).toHaveFocus();
    });

    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Name version…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Name Rev 2' }), 'Ready for print');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(more).toHaveFocus();
    });
    expect(revisionStatusHarness.commands.tag).not.toHaveBeenCalled();

    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Name version…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Name Rev 2' }), 'Ready for print');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(revisionStatusHarness.commands.tag).toHaveBeenCalledWith({ name: 'Ready for print', revisionId: 'rev-2' });
  });

  it('starts a new branch from the revision, with Cancel (round 16)', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'New branch from Rev 2…' }));
    expect(await screen.findByText('Starts from Rev 2. main stays as it is.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Name for the new branch' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2', 'rev-2');
  });

  it('removes a local version name after a named confirmation (L3-F5)', async () => {
    const user = userEvent.setup();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove version name…' }));
    expect(await screen.findByRole('alertdialog', { name: 'Remove the name “v1” from Rev 2?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove name' }));

    await waitFor(() => {
      expect(revisionStatusHarness.commands.deleteTag).toHaveBeenCalledWith('v1');
    });
    /* No Hosted Remote, so nothing to ask it. */
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the publication a Tau Cloud name backs before removing it, then asks again with its id (D24)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.role = 'owner';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'GIT_REF_PUBLISHED',
            publication: { id: 'pub-1', title: 'Bracket v1', visibility: 'public' },
          }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ref: 'refs/tags/v1', tip: 'rev-2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove version name…' }));
    await user.click(await screen.findByRole('button', { name: 'Remove name' }));

    expect(await screen.findByText(/“Bracket v1” is published from this name/u)).toBeInTheDocument();
    expect(revisionStatusHarness.commands.deleteTag).not.toHaveBeenCalled();
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://api.test/v1/git/p/refs?name=refs%2Ftags%2Fv1');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE', credentials: 'include' });

    await user.click(screen.getByRole('button', { name: 'Remove name' }));
    await waitFor(() => {
      expect(revisionStatusHarness.commands.deleteTag).toHaveBeenCalledWith('v1');
    });
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      'https://api.test/v1/git/p/refs?name=refs%2Ftags%2Fv1&publication=pub-1',
    );
  });

  it('says why Tau Cloud refused a removal, and removes nothing (I12)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.role = 'owner';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ code: 'GIT_RATE_LIMITED' }), { status: 429 })),
    );
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove version name…' }));
    await user.click(await screen.findByRole('button', { name: 'Remove name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Tau Cloud is getting too many requests');
    expect(revisionStatusHarness.commands.deleteTag).not.toHaveBeenCalled();
  });

  it('offers no removal a Tau Cloud collaborator who is not the owner would be refused', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.role = 'write';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More actions for Rev 2' }));
    expect(screen.getByRole('menuitem', { name: 'Rename version…' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Remove version name…' })).not.toBeInTheDocument();
  });
});
