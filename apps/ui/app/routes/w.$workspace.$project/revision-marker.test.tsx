// @vitest-environment jsdom
/**
 * One History row and an entry's More (charter D7; blueprint C3).
 *
 * The row is scripted through the one revision harness, so what is asserted is
 * what a person sees and what the row sends back — never a worker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RevisionDiffEntry } from '@taucad/revisions';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { RevisionMenu, RevisionRow, nextVersionNumber } from '#routes/w.$workspace.$project/revision-marker.js';
import { revisionTitle } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionRowProps } from '#routes/w.$workspace.$project/revision-marker.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import type * as UseFeatureModule from '#flags/use-feature.js';

const projectSnapshot = { context: { project: { name: 'Bracket', assets: { main: { entryPath: 'main.scad' } } } } };
const projectRef = {
  subscribe: () => ({ unsubscribe: () => undefined }),
  getSnapshot: () => projectSnapshot,
};
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p', projectRef }) }));
/* Tau's debug setting, off unless a row turns it on (B5). */
const flags = vi.hoisted(() => ({ tauDebug: false }));
vi.mock('#flags/use-feature.js', async (importOriginal) => {
  const original = await importOriginal<typeof UseFeatureModule>();
  return {
    ...original,
    useFeature: (flag: Parameters<typeof original.useFeature>[0]) =>
      flag === 'tauDebug' ? flags.tauDebug : original.useFeature(flag),
  };
});
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
  createdAt: Date.now() - 60_000,
  summary: 'Thicker base',
  actor: 'Agent',
  turnId: 'u1',
  conflicted: false,
  capture: 'turn',
  ...over,
});

const onRestore = vi.fn();

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
        isAtFiles={false}
        branch='main'
        nextVersion={2}
        isBusy={false}
        onRestore={onRestore}
        {...props}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </ol>
  );
}

/* The app's root TooltipProvider, which the ID's copy glyph needs. */
const renderRow = (props: Partial<RevisionRowProps> = {}): void => {
  render(
    <TooltipProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Row {...props} />
      </QueryClientProvider>
    </TooltipProvider>,
  );
};

const openRow = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp = /^Thicker base · /u,
): Promise<void> => {
  await user.click(screen.getByRole('button', { name }));
};

const openBlock = (): HTMLElement => document.querySelector<HTMLElement>('[data-slot="open-row"]')!;

describe('RevisionRow', () => {
  it('is one button at rest, naming the entry by its title and time, with the time in the right-hand column', () => {
    renderRow();
    const item = screen.getByRole('listitem');
    expect(within(item).getAllByRole('button')).toHaveLength(1);
    expect(within(item).getByRole('button', { name: /^Thicker base · /u })).toHaveAttribute('aria-expanded', 'false');
    expect(item).toHaveTextContent('Agent');
    const when = item.querySelector('[data-slot="row-when"] time');
    expect(when).not.toBeNull();
    /* Always shown, at every pane width: the narrow pane keeps title, who and time. */
    expect(when).not.toHaveClass('hidden');
  });

  it('should name the merged branch a row came from in its accessible name, as its meta line does (D2)', () => {
    renderRow({ mergedBranch: { name: 'enclosure-v2', slot: 1 } });

    const button = screen.getByRole('button', { name: /^Thicker base · .* · on enclosure-v2$/u });
    expect(button).toBeInTheDocument();
    expect(screen.getByRole('listitem').querySelector('[data-slot="row-branch"]')).toHaveTextContent('enclosure-v2');
  });

  it('shows no who line where the resolver gives none, nor a raw actor id (Q2, HQ4)', () => {
    renderRow({ revision: card({ actor: '', isYours: true }) });
    const item = screen.getByRole('listitem');
    expect(item).not.toHaveTextContent('You');
    expect(item.querySelector('[data-slot="row-meta"]')).toBeNull();
    expect(item.textContent).not.toMatch(/user_|anon:|^agent$/u);
  });

  it('shows the who line a shared project gives your own row (Q2)', () => {
    renderRow({ revision: card({ actor: 'You', isYours: true }) });
    expect(screen.getByRole('listitem')).toHaveTextContent('You');
  });

  /* A3c: the account that backed the entry up, and the one it was recorded as, are both said; the warning points at the second. */
  it('puts a warning glyph beside “recorded as” on a mismatch, and never folds the two names', () => {
    renderRow({ revision: card({ actor: 'Maya Chen · recorded as You', capture: 'save', turnId: undefined }) });
    const meta = screen.getByRole('listitem').querySelector<HTMLElement>('[data-slot="row-meta"]')!;
    expect(meta).toHaveTextContent('Maya Chen · recorded as You');
    const recorded = within(meta).getByText('recorded as You').parentElement!;
    expect(recorded.querySelector('svg.text-warning')).not.toBeNull();
    expect(within(meta).getByText('Maya Chen').parentElement!.querySelector('svg')).toBeNull();
  });

  it('names a row off this line by its title and time, inventing no number', () => {
    renderRow({ revision: card({ n: undefined }) });
    expect(screen.getByRole('button', { name: /^Thicker base · /u })).toBeInTheDocument();
    expect(screen.queryByText(/Rev \d/u)).toBeNull();
  });

  it('titles an agent row by its request, and says Agent change when the request is not known (Q9)', () => {
    renderRow({ revision: card({ summary: 'Agent change' }) });
    expect(screen.getByRole('button', { name: /^Agent change · /u })).toBeInTheDocument();
  });

  /* Canvas decision 8: Current follows the title's last word; it is not a second line. */
  it('reads Current after the title, on the entry Current marks', () => {
    renderRow({ isCurrent: true });
    const title = screen.getByRole('listitem').querySelector('[data-slot="row-title"]');
    expect(title?.querySelector('[data-slot="current-pill"]')).toHaveTextContent('Current');
    expect(screen.getByRole('button', { name: /^Thicker base · /u })).toBeInTheDocument();
  });

  it('shows a version’s number in the right-hand column and says it is one', () => {
    renderRow({ revision: card({ tags: ['Fit check'], versions: [{ name: 'Fit check', number: 3 }] }) });
    const item = screen.getByRole('listitem');
    expect(item.querySelector('[data-slot="row-when"]')).toHaveTextContent('V3');
    expect(item.querySelector('[data-slot="row-meta"]')).toHaveTextContent(/^Version/u);
    expect(screen.getByRole('button', { name: /^V3 · Fit check$/u })).toBeInTheDocument();
  });

  /* A6: the Start row's time follows its fact where the pane has room for it. */
  it('keeps the Start row’s time after its fact at 22rem and wider', () => {
    renderRow({ revision: card({ start: 'created', capture: 'create', actor: '', turnId: undefined }) });
    const meta = screen.getByRole('listitem').querySelector('[data-slot="row-meta"]')!;
    expect(meta).toHaveTextContent(/^Version · project created/u);
    expect(meta.querySelector(String.raw`.\@\[22rem\]\:inline`)).not.toBeNull();
  });

  /* Blueprint "An open row": the cue is the chevron and the content, never a tint. */
  it('has no background, closed or open', async () => {
    const user = userEvent.setup();
    renderRow();
    const item = screen.getByRole('listitem');
    const background = /(^|\s)bg-(?!background)/u;
    expect(item.className).not.toMatch(background);
    await openRow(user);
    expect(item.className).not.toMatch(background);
    expect(openBlock().className).not.toMatch(background);
    expect(screen.getByRole('button', { name: /^Thicker base · /u }).className).not.toMatch(/(^|\s)bg-/u);
  });

  it('opens to at most three visible buttons and one More with two items', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.diff = [];
    renderRow();
    await openRow(user);
    const block = openBlock();
    const buttons = within(block).getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
      'Restore “Thicker base”',
      'Compare',
      'More',
      'Copy ID',
    ]);
    /* Restore, Compare and the copy glyph; More is the one ⋮. */
    expect(buttons.filter((button) => button.getAttribute('aria-label') !== 'More')).toHaveLength(3);
    await user.click(within(block).getByRole('button', { name: 'More' }));
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Create version…', 'New branch from here…']);
    expect(screen.queryByRole('menuitem', { name: /Publish|Remove|Copy/u })).toBeNull();
  });

  /* Blueprint "One rule for where a button sits": a body aligns by its body, on the content edge. */
  it('starts Restore on the file list’s edge and ends More on the row’s right edge', async () => {
    const user = userEvent.setup();
    renderRow();
    await openRow(user);
    const actions = openBlock().querySelector<HTMLElement>('[data-slot="row-actions"]')!;
    const restore = within(actions).getByRole('button', { name: 'Restore “Thicker base”' });
    const more = within(actions).getByRole('button', { name: 'More' });
    /* Outline buttons, so their bodies are the edge: no hanging padding to pull back. */
    expect(restore.className).toMatch(/\bborder\b/u);
    expect(more.className).toMatch(/\bborder\b/u);
    expect(actions.firstElementChild).toBe(restore);
    expect(actions.lastElementChild).toBe(more.parentElement);
    expect(more.parentElement).toHaveClass('ml-auto');
    expect(restore.className).not.toMatch(/(^|\s)-?m[lx]-/u);
  });

  it('gives one line of facts: who, the date and time, and a short ID whose glyph copies the full one (B5)', async () => {
    const user = userEvent.setup();
    const id = 'a'.repeat(40);
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderRow({ revision: card({ revisionId: id, actor: '', isYours: true, capture: 'save', turnId: undefined }) });
    await openRow(user);
    const facts = openBlock().querySelector<HTMLElement>('[data-slot="row-facts"]')!;
    expect(facts).toHaveTextContent(/^Saved by you/u);
    expect(facts).toHaveTextContent(`ID ${'a'.repeat(7)}`);
    expect(document.body.textContent).not.toMatch(/[\da-f]{40}/u);
    await user.click(within(facts).getByRole('button', { name: 'Copy ID' }));
    expect(writeText).toHaveBeenCalledWith(id);
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
  });

  /* A5: the base cut's fact moves from Details into the open row's fact line. */
  it('says a turn’s base cut holds your own edits, in the fact line', async () => {
    const user = userEvent.setup();
    renderRow({ revision: card({ summary: 'Autosave', turnCut: 'base', actor: '' }) });
    await openRow(user, /^Autosave · /u);
    expect(openBlock().querySelector('[data-slot="row-facts"]')).toHaveTextContent(
      /^Your edits, saved before the agent started/u,
    );
  });

  it.each([
    [{ capture: 'idle', actor: '', turnId: undefined }, 'Autosave'],
    [{ capture: 'idle', actor: 'Maya Chen', turnId: undefined }, 'Autosave · Maya Chen'],
    [{ capture: 'switch', actor: '', isYours: true, turnId: undefined }, 'Saved before switching branch'],
    [{ capture: 'save', actor: 'Maya Chen', turnId: undefined }, 'Saved by Maya Chen'],
    [{ capture: 'turn', actor: 'Agent' }, 'Agent'],
  ] as const)('folds what asked for the entry into who (%o)', async (over, fact) => {
    const user = userEvent.setup();
    renderRow({ revision: card(over) });
    await user.click(screen.getByRole('button', { name: /^(Thicker base|Autosave) · /u }));
    expect(openBlock().querySelector('[data-slot="row-facts"]')?.firstElementChild).toHaveTextContent(fact);
  });

  it('opens to its files, each row opening the shared comparison in its path’s language (S38)', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.comparison = {
      original: 'cube(1);',
      modified: 'cube(2);',
      kind: 'text',
      change: 'modified',
      notices: [],
    };
    renderRow();
    await openRow(user);

    expect(screen.getByText('main.geospec.ts')).toBeInTheDocument();
    expect(screen.getByText('Added')).toHaveClass('text-muted-foreground/90', 'group-hover/file:text-muted-foreground');
    await user.click(screen.getByRole('button', { name: 'Compare bracket.scad' }));
    expect(await screen.findByTestId('diff')).toHaveAttribute('data-language', 'openscad');
    expect(screen.getByTestId('diff')).toHaveTextContent('cube(1);|cube(2);');
  });

  it('keeps a dirty current entry on its parent comparison, and offers Compare with the current files', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.comparison = {
      original: 'parent',
      modified: 'saved',
      kind: 'text',
      change: 'modified',
      notices: [],
    };
    renderRow({ isCurrent: true });
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Compare bracket.scad' }));
    expect(await screen.findByTestId('diff')).toHaveTextContent('parent|saved');
    expect(revisionStatusHarness.comparisonRequests).toContain('rev-2:bracket.scad:parent');
    expect(screen.getByRole('button', { name: 'Compare' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Restore “Thicker base”' })).toBeEnabled();
  });

  it('should show three files first and toggle the complete file list', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.diff = Array.from(
      { length: 5 },
      (_, index): RevisionDiffEntry => ({
        path: `part-${String(index + 1)}.ts`,
        kind: 'added',
      }),
    );
    renderRow();
    await openRow(user);

    const files = screen.getByRole('list', { name: 'Changed files' });
    expect(within(files).getAllByRole('button', { name: /^Compare /u })).toHaveLength(3);
    expect(within(files).queryByText('part-4.ts')).not.toBeInTheDocument();

    await user.click(within(files).getByRole('button', { name: 'Show all 5 files' }));
    expect(within(files).getAllByRole('button', { name: /^Compare /u })).toHaveLength(5);
    expect(within(files).getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();

    await user.click(within(files).getByRole('button', { name: 'Show fewer' }));
    expect(within(files).getAllByRole('button', { name: /^Compare /u })).toHaveLength(3);
    expect(within(files).getByRole('button', { name: 'Show all 5 files' })).toBeInTheDocument();
  });

  it('should use the same three-file preview when comparing with the current files', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-5' };
    revisionStatusHarness.diff = Array.from(
      { length: 4 },
      (_, index): RevisionDiffEntry => ({
        path: `part-${String(index + 1)}.ts`,
        kind: 'modified',
      }),
    );
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Compare' }));

    const files = await screen.findByRole('list', { name: 'Changed since “Thicker base”' });
    expect(within(files).getAllByRole('button', { name: /^Compare /u })).toHaveLength(3);
    expect(within(files).getByRole('button', { name: 'Show all 4 files' })).toBeInTheDocument();
  });

  it('tells a failed comparison from an empty file, and tries again', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.comparisonError = new Error('Tree is unavailable');
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Compare main.geospec.ts' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t compare main.geospec.ts.');
    revisionStatusHarness.comparisonError = undefined;
    revisionStatusHarness.comparison = {
      original: 'a',
      modified: 'b',
      kind: 'text',
      change: 'modified',
      notices: [],
    };
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('diff')).toHaveTextContent('a|b');
  });

  /* U17: a comparison that has not arrived is its row's frame, never bars. */
  it('draws no Skeleton while a comparison loads', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.comparisonRead = async () => Promise.withResolvers<never>().promise;
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Compare bracket.scad' }));

    const frame = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[aria-label="Comparison for bracket.scad"]');
      expect(element).not.toBeNull();
      return element!;
    });
    expect(frame).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelectorAll('[data-slot="skeleton"]'), 'Skeleton shapes in the comparison').toHaveLength(0);
  });

  it('restores an entry the files are not at, naming it in the button’s accessible name', async () => {
    const user = userEvent.setup();
    onRestore.mockClear();
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Restore “Thicker base”' }));
    expect(onRestore).toHaveBeenCalledWith('rev-2');
  });

  /* Executor ruling: Restore and Compare are disabled on the entry the files are at, and say why. */
  it('disables Restore and Compare on the entry the files are at, and says why', async () => {
    const user = userEvent.setup();
    renderRow({ isCurrent: true, isAtFiles: true });
    await openRow(user);
    const reason = 'Your files are at this point, so there is nothing to restore or compare.';
    for (const name of ['Restore “Thicker base”', 'Compare']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
    }
  });

  /* A9, RV-D1: a restore is a new row named by what it restored, never a Rewind. */
  it('names a restore row by its provenance, with the Restored glyph', () => {
    const restored = card({ revisionId: 'rev-5', n: 5, summary: 'Restore', capture: 'restore', restoredFrom: 'rev-3' });
    const target = card({ revisionId: 'rev-3', n: 3 });
    expect(revisionTitle(restored, [restored, target])).toBe('Restored “Thicker base”');
    renderRow({ revision: restored, title: 'Restored “Thicker base”' });
    expect(screen.getByRole('button', { name: /^Restored “Thicker base” · /u })).toBeInTheDocument();
    expect(screen.getByLabelText('Restored')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rewind/u)).toBeNull();
  });

  /* Copy table: Undo restore lives in the header and the toast, not also on the row. */
  it('offers no Undo restore on the row', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      restore: { ...revisionStatusHarness.status.restore, undoable: true },
    };
    renderRow({
      revision: card({ restoredFrom: 'rev-1', capture: 'restore' }),
      title: 'Restored “Thicker base”',
      isCurrent: true,
      isAtFiles: true,
    });
    await openRow(user, /^Restored “Thicker base” · /u);
    expect(screen.queryByRole('button', { name: /Undo/u })).toBeNull();
  });

  it('compares the whole entry with the current files, and Done returns to its own changes', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-5' };
    revisionStatusHarness.comparison = {
      original: 'cube(1);',
      modified: 'cube(5);',
      kind: 'text',
      change: 'modified',
      notices: [],
    };
    renderRow();
    await openRow(user);
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true');

    const since = await screen.findByRole('list', { name: 'Changed since “Thicker base”' });
    expect(screen.getByText('Comparing with your current files')).toBeInTheDocument();
    expect(revisionStatusHarness.diffRequests).toContain('rev-2..checkout');
    await user.click(within(since).getByRole('button', { name: 'Compare bracket.scad with the current file' }));
    expect(await screen.findByTestId('diff')).toHaveTextContent('cube(1);|cube(5);');

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('list', { name: 'Changed files' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Changed since “Thicker base”' })).not.toBeInTheDocument();
  });

  it('says so when nothing changed since the entry', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-5' };
    renderRow();
    await openRow(user);
    revisionStatusHarness.diff = [];
    await user.click(screen.getByRole('button', { name: 'Compare' }));
    expect(await screen.findByRole('note')).toHaveTextContent('No changes since then.');
  });

  it('offers a viewer Restore of their own copy, and no More', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.role = 'read';
    renderRow();
    await openRow(user);
    expect(screen.getByText('You can view this project. Restore changes only your copy.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore “Thicker base”' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('names no stored id with the debug setting off (B5)', async () => {
    const user = userEvent.setup();
    const [id, tree, parent] = ['a', 'b', 'c'].map((digit) => digit.repeat(40));
    renderRow({ revision: card({ revisionId: id, treeId: tree, parent, trailer: 'Tau-Metadata: {"version":2}' }) });
    await openRow(user);
    expect(screen.queryByRole('definition')).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\da-f]{40}|Tau-Metadata/u);
  });

  describe('with Tau’s debug setting on', () => {
    beforeEach(() => {
      flags.tauDebug = true;
    });

    afterEach(() => {
      flags.tauDebug = false;
    });

    it('names the ids it is stored under, and the trailer it records (B5)', async () => {
      const user = userEvent.setup();
      const trailer = 'Tau-Metadata: {"version":2}\nTau-Actor: user ada\nTau-Trigger: turn';
      renderRow({ revision: card({ parent: 'rev-1', treeId: 'a'.repeat(40), trailer }) });
      await openRow(user);
      const diagnostics = document.querySelector('dl[aria-label="Diagnostics"]');
      expect(diagnostics).toHaveTextContent(/ID\s*rev-2/u);
      expect(diagnostics).toHaveTextContent(/Parent\s*rev-1/u);
      expect(diagnostics).toHaveTextContent(new RegExp(`Tree\\s*${'a'.repeat(40)}`, 'u'));
      const recorded = screen.getByText('Recorded trailer').nextElementSibling?.querySelector('code');
      expect(recorded?.textContent).toBe(trailer);
    });

    it('says a branch’s first entry follows none', async () => {
      const user = userEvent.setup();
      renderRow({ revision: card({ revisionId: 'rev-1', n: 1 }) });
      await openRow(user);
      expect(document.querySelector('dl[aria-label="Diagnostics"]')).toHaveTextContent(
        /Parent\s*None \(first entry\)/u,
      );
    });
  });

  it('gives every target at least 24 × 24 CSS px', async () => {
    const user = userEvent.setup();
    renderRow({ revision: card({ tags: ['v1'] }) });
    await openRow(user, /^V2 · v1|^v1/u);
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toMatch(/\b(h-6|size-6|min-h-6|h-8|h-9|size-8)\b/u);
    }
  });
});

const renderMenu = (revision: RevisionCard = card({ tags: ['v1'] }), nextVersion = 2): void => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RevisionMenu revision={revision} branch='main' nextVersion={nextVersion} />
    </QueryClientProvider>,
  );
};

describe('RevisionMenu', () => {
  it('says which number the version will get, and creates it in the one naming form (B6, round 16)', async () => {
    const user = userEvent.setup();
    const versions = [
      card({ revisionId: 'rev-4', tags: ['Fit check'], versions: [{ name: 'Fit check', number: 3 }] }),
      card({ revisionId: 'rev-3', tags: ['First print'], versions: [{ name: 'First print', number: 2 }] }),
    ];
    renderMenu(card(), nextVersionNumber(versions));
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Create version…' }));
    const field = await screen.findByRole('textbox', { name: 'Version name' });
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
    expect(
      await screen.findByText('This will be V4. A version is a fixed point you can return to, compare with and share.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(more).toHaveFocus();
    });

    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Create version…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Version name' }), 'Ready for print');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(more).toHaveFocus();
    });
    expect(revisionStatusHarness.commands.tag).not.toHaveBeenCalled();

    await user.click(more);
    await user.click(screen.getByRole('menuitem', { name: 'Create version…' }));
    await user.type(await screen.findByRole('textbox', { name: 'Version name' }), 'Ready for print');
    await user.click(screen.getByRole('button', { name: 'Create version' }));
    /* The name goes to the tag verb as typed, spaces included: the ref is the number (B6). */
    expect(revisionStatusHarness.commands.tag).toHaveBeenCalledWith({ name: 'Ready for print', revisionId: 'rev-2' });
  });

  it('offers V2 first, because V1 is Start', () => {
    expect(nextVersionNumber([])).toBe(2);
    expect(nextVersionNumber([card({ start: 'created' })])).toBe(2);
  });

  it('renames a version at its own number, removing nothing and asking nothing, and offers no way to remove it (Q13)', async () => {
    const user = userEvent.setup();
    /* A Tau Cloud owner: the rename used to take the old name off the server through a removal dialog. */
    revisionStatusHarness.role = 'owner';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    const fetching = vi.spyOn(globalThis, 'fetch');
    renderMenu(card({ tags: ['Fit check'], versions: [{ name: 'Fit check', number: 3 }] }));
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename version…',
      'New branch from here…',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Rename version…' }));
    expect(await screen.findByText('V3 keeps its number. A version is permanent.')).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Version name' });
    expect(field).toHaveValue('Fit check');
    await user.clear(field);
    await user.type(field, 'Fit check 2');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(revisionStatusHarness.commands.tag).toHaveBeenCalledExactlyOnceWith({
      name: 'Fit check 2',
      revisionId: 'rev-2',
      number: 3,
    });
    expect(fetching).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fetching.mockRestore();
  });

  it('starts a new branch from the entry (round 16)', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('menuitem', { name: 'New branch from here…' }));
    expect(await screen.findByText('Starts from “Thicker base”. main stays as it is.')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Branch name' }), 'enclosure-v2');
    await user.click(screen.getByRole('button', { name: 'Create branch' }));
    expect(revisionStatusHarness.commands.createBranch).toHaveBeenCalledWith('enclosure-v2', 'rev-2');
  });

  it('has no Publish on Tau Cloud: Share owns publishing', async () => {
    const user = userEvent.setup();
    revisionStatusHarness.role = 'owner';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    renderMenu(card());
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    expect(screen.queryByRole('menuitem', { name: /Publish/u })).toBeNull();
  });
});
