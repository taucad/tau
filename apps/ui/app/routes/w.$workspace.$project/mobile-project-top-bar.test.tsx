// @vitest-environment jsdom
/**
 * The project's phone top bar and project sheet (charter W2: D2, D3, EQ2 = H1;
 * canvas HDR-03…HDR-08; acceptance T3).
 *
 * Three controls — sidebar, title with status line, Share — and one status
 * owner: the line reads the same revision facts, Follow chat and record issues
 * the desktop header reads, in D3's vocabulary, with colour on the glyph only.
 * The title opens the project sheet, where Revisions, Export and Details live
 * once.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { Check, CircleAlert, CircleDashed, FileDiff, GitMerge } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { KeyboardProvider } from '@taucad/ui/components/keyboard';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { publishRecordIssue } from '#workbench-records/record-issues.js';
import type { RecordIssue } from '#workbench-records/record-issues.js';
import { selectRevisionFacts } from '#routes/w.$workspace.$project/revision-vocabulary.js';
import type { RevisionWhere } from '#routes/w.$workspace.$project/revision-vocabulary.js';

let focusedChatId: string | undefined = 'chat-1';
let projectName = 'Planetary gearbox';
let isProjectError = false;
const editorRef = {
  getSnapshot: () => ({ context: { focusedChatId } }),
  subscribe: () => ({ unsubscribe: () => undefined }),
  send: vi.fn(),
};
const projectRef = {
  getSnapshot: () => ({
    context: { project: { name: projectName } },
    matches: (state: string) => state === 'error' && isProjectError,
  }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ projectId: 'p', editorRef, projectRef }),
}));
let unavailableReason: string | undefined;
const fileManagerRef = {
  getSnapshot: () => ({ context: {}, matches: () => false }),
  subscribe: () => ({ unsubscribe: () => undefined }),
};
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ fileManagerRef, unavailableReason }),
}));

const openPanel = vi.fn();
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel, registerRecordRecoveryFocus: () => undefined }),
}));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#hooks/chat-session-store-provider.js', () => ({
  useChatSessionStore: () => ({ observedChatIdsOf: () => [], subscribeMembership: () => () => undefined }),
}));
let chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'live' }];
vi.mock('#hooks/use-chats.js', () => ({ useChats: () => ({ chats }) }));
vi.mock('#hooks/use-chat-records.js', () => ({
  useChatRecords: () => ({ chats, isLoading: false, error: undefined }),
}));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
/* The bar is phone-only; the real sidebar trigger reads the phone breakpoint. */
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('#hooks/use-cookie.js', async () => {
  const React = await import('react');
  return {
    useCookie: <Value,>(_name: string, defaultValue: Value) => React.useState(defaultValue),
  };
});

const { SidebarProvider } = await import('#components/ui/sidebar.js');
const { MobileProjectTopBar, selectProjectStatusLine } =
  await import('#routes/w.$workspace.$project/mobile-project-top-bar.js');

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <MemoryRouter>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <KeyboardProvider>
        <TooltipProvider delayDuration={0}>
          <SidebarProvider>{children}</SidebarProvider>
        </TooltipProvider>
      </KeyboardProvider>
    </QueryClientProvider>
  </MemoryRouter>
);

const status = (over: Partial<RevisionStatusProjection> = {}): RevisionStatusProjection => ({
  ...revisionStatusHarness.status,
  headRevisionId: 'rev-12',
  ...over,
});
const onMain: RevisionWhere = { branch: 'main', head: 12, isDirty: false };
const conflict: RevisionStatusProjection['conflicts'][number] = {
  revisionId: 'rev-13',
  branch: 'main',
  into: 'main',
  foreign: false,
  labels: undefined,
  paths: [],
  busy: false,
  ready: false,
};
const recordIssue = (over: Partial<RecordIssue> = {}): RecordIssue => ({
  kind: 'layout',
  path: '.tau/workbench/layout.json',
  state: 'unconfirmed',
  message: undefined,
  bytes: null,
  writing: false,
  retryRead: vi.fn(async () => true),
  retrySave: vi.fn(async () => true),
  ...over,
});
const onBranch = (): void => {
  chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'co-2' }];
  revisionStatusHarness.status = status({
    branches: [
      { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
      {
        name: 'planetary-carrier',
        head: undefined,
        checkoutId: 'co-2',
        checkoutRoot: '/checkouts/co-2',
        leaseChatIds: ['chat-1'],
      },
    ],
  });
};

/* The open sheet is modal, so the bar is read by its slot rather than its (then hidden) landmark. */
const topBar = (): HTMLElement => {
  const bar = document.querySelector<HTMLElement>('[data-slot=mobile-project-top-bar]');
  if (!bar) {
    throw new Error('No top bar');
  }
  return bar;
};
const titleButton = (): HTMLElement =>
  within(topBar()).getByRole('button', { name: new RegExp(projectName, 'u'), hidden: true });
const statusLine = (root: HTMLElement): HTMLElement => {
  const line = root.querySelector<HTMLElement>('[data-slot=status-line]');
  if (!line) {
    throw new Error('No status line');
  }
  return line;
};

beforeEach(() => {
  revisionStatusHarness.reset();
  /* At Rev 12 on main: the resting state the canvas frames start from. */
  revisionStatusHarness.rows = [
    {
      revisionId: 'rev-12',
      revisionNumber: 12,
      changeId: 'change-rev-12',
      actor: 'You',
      source: 'user',
      createdAt: 1_788_220_800_000,
      summary: 'Thicker base',
      conflicted: false,
      turnId: undefined,
      tags: [],
    },
  ];
  revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-12' };
  openPanel.mockClear();
  focusedChatId = 'chat-1';
  projectName = 'Planetary gearbox';
  isProjectError = false;
  unavailableReason = undefined;
  document.querySelector('[data-slot=mobile-surface]')?.remove();
  chats = [{ id: 'chat-1', name: 'Initial design', checkoutId: 'live' }];
});

afterEach(() => {
  act(() => {
    publishRecordIssue('p', 'layout', undefined);
    publishRecordIssue('p', 'entries', undefined);
  });
});

describe('selectProjectStatusLine', () => {
  const line = (
    projection: RevisionStatusProjection,
    where: RevisionWhere = onMain,
    extra: Partial<Parameters<typeof selectProjectStatusLine>[0]> = {},
  ) => selectProjectStatusLine({ facts: selectRevisionFacts(projection, where), branch: where.branch, ...extra });

  it.each([
    { name: 'saved on this device', projection: status(), where: onMain, text: 'Saved', icon: Check, tone: '' },
    {
      name: 'saved and backed up',
      projection: status({ sync: { ...revisionStatusHarness.status.sync, state: 'backedUp' } }),
      where: onMain,
      text: 'Saved',
      icon: Check,
      tone: '',
    },
    {
      name: 'saving',
      projection: status({ minting: true }),
      where: { ...onMain, isDirty: true },
      text: 'Saving…',
      icon: CircleDashed,
      tone: '',
    },
    {
      name: 'a write not confirmed',
      projection: status({ attention: 1 }),
      where: onMain,
      text: 'Save not confirmed',
      icon: CircleAlert,
      tone: 'text-feature',
    },
    {
      name: 'a conflict',
      projection: status({ attention: 1, conflicts: [conflict] }),
      where: onMain,
      text: 'Conflict',
      icon: GitMerge,
      tone: 'text-warning',
    },
    /* D3 has no word for modified files: the shared sentence, not a second phrasing of it (I12). */
    {
      name: 'modified',
      projection: status(),
      where: { ...onMain, isDirty: true },
      text: 'Modified since Rev 12',
      icon: FileDiff,
      tone: 'text-warning',
    },
  ])('says $name in D3’s words with its glyph and tone', ({ projection, where, text, icon, tone }) => {
    const result = line(projection, where);
    expect(result.text).toBe(text);
    expect(result.icon).toBe(icon);
    expect(result.tone).toBe(tone);
  });

  it('keeps the viewer’s access in the line where Saved alone would hide it', () => {
    expect(line(status(), { ...onMain, role: 'read' }).text).toBe('Saved · View only');
  });

  it('turns the glyph only while work is in flight', () => {
    expect(line(status({ minting: true }), { ...onMain, isDirty: true }).isBusy).toBe(true);
    expect(line(status()).isBusy).toBe(false);
  });

  it('names a branch only when it is not main, then the record issues, then Follow chat', () => {
    expect(line(status()).text).not.toContain('on main');
    expect(line(status(), { ...onMain, branch: 'planetary-carrier' }, { followBranch: 'bracket-fillet' }).text).toBe(
      'Saved · on planetary-carrier · Follow chat',
    );
    expect(line(status(), onMain, { issues: { state: 'unconfirmed', count: 2 } }).text).toBe(
      'Save not confirmed · 2 issues',
    );
  });

  it('lets a revision conflict win the word over a settings record’s unconfirmed write, keeping its count', () => {
    const result = line(status({ attention: 1, conflicts: [conflict] }), onMain, {
      issues: { state: 'unconfirmed', count: 1 },
    });
    expect(result.text).toBe('Conflict · 1 issue');
    expect(result.icon).toBe(GitMerge);
    expect(result.tone).toBe('text-warning');
    /* A revision's own unconfirmed write still outranks its conflict, as the shared facts rank them. */
    expect(line(status({ attention: 2, conflicts: [conflict] })).text).toBe('Save not confirmed');
  });

  it('keeps the turning glyph while saving even when a settings record needs a person', () => {
    const result = line(
      status({ minting: true }),
      { ...onMain, isDirty: true },
      { issues: { state: 'invalid', count: 1 } },
    );
    expect(result.text).toBe('Saving… · 1 issue');
    expect(result.icon).toBe(CircleDashed);
    expect(result.isBusy).toBe(true);
  });

  it('raises a settings record that needs a person on the glyph without renaming the save state', () => {
    const result = line(status(), onMain, { issues: { state: 'invalid', count: 1 } });
    expect(result.text).toBe('Saved · 1 issue');
    expect(result.icon).toBe(CircleAlert);
    expect(result.tone).toBe('text-warning');
  });
});

describe('MobileProjectTopBar', () => {
  it('has three controls — sidebar, title with status line, Share — each a 40px target (HDR-03)', () => {
    render(<MobileProjectTopBar />, { wrapper });

    const controls = within(topBar()).getAllByRole('button');
    expect(controls).toHaveLength(3);
    const [sidebar, title, share] = controls;
    expect(sidebar).toHaveAccessibleName('Open sidebar');
    expect(sidebar).toHaveClass('size-10');
    expect(title).toBe(titleButton());
    expect(title).toHaveClass('h-10');
    expect(title).toHaveAttribute('aria-haspopup', 'dialog');
    expect(share).toHaveAccessibleName('Share');
    expect(share).toHaveClass('size-10');
    expect(topBar()).toHaveClass('h-12', 'md:hidden');
    /* Export, Revisions and Details are not in the bar (D2). */
    expect(within(topBar()).queryByRole('button', { name: /^(Export|Revisions|Details)$/u })).toBeNull();
  });

  it('reads Saved with an uncoloured glyph at rest, and keeps colour off the words (HDR-03, D3)', async () => {
    render(<MobileProjectTopBar />, { wrapper });

    const line = statusLine(titleButton());
    await waitFor(() => {
      expect(line).toHaveTextContent(/^Saved$/u);
    });
    expect(line).toHaveClass('text-muted-foreground');
    const glyph = line.querySelector('[data-slot=status-line-icon]');
    expect(glyph?.getAttribute('class')).not.toMatch(/text-(feature|warning|destructive)/u);
    expect(within(titleButton()).queryByRole('img')).not.toBeInTheDocument();
  });

  it('reads Saving… with a turning glyph that stops for reduced motion (HDR-04)', () => {
    revisionStatusHarness.status = status({ minting: true });
    render(<MobileProjectTopBar />, { wrapper });

    const line = statusLine(titleButton());
    expect(line).toHaveTextContent('Saving…');
    expect(line.querySelector('[data-slot=status-line-icon]')).toHaveClass(
      'animate-spin',
      'motion-reduce:animate-none',
    );
  });

  it('owns an unconfirmed save and the record issues in one line, with the recovery in the sheet (HDR-05)', async () => {
    const retrySave = vi.fn(async () => true);
    render(<MobileProjectTopBar />, { wrapper });
    act(() => {
      publishRecordIssue('p', 'layout', recordIssue({ retrySave }));
    });

    const line = statusLine(titleButton());
    expect(line).toHaveTextContent('Save not confirmed · 1 issue');
    expect(line.querySelector('[data-slot=status-line-icon]')).toHaveClass('text-feature');
    expect(line.lastElementChild).not.toHaveClass('text-feature');
    // The colour says something; the glyph says it too, for a person who does not see it.
    expect(within(titleButton()).getByRole('img', { name: 'Needs attention' })).toBeInTheDocument();
    /* The bar announces the records as the desktop trigger does; no second trigger draws them. */
    expect(screen.getByRole('status')).toHaveTextContent('Save not confirmed · 1 record');
    expect(within(topBar()).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    expect(within(sheet).getByRole('listitem', { name: 'Pane layout' })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retry save' }));
    expect(retrySave).toHaveBeenCalledTimes(1);
  });

  it('reads Conflict, never the pane’s longer sentence, with the amber glyph', () => {
    revisionStatusHarness.status = status({ attention: 1, conflicts: [conflict] });
    render(<MobileProjectTopBar />, { wrapper });

    const line = statusLine(titleButton());
    expect(line).toHaveTextContent(/^Conflict$/u);
    expect(line.querySelector('[data-slot=status-line-icon]')).toHaveClass('text-warning');
  });

  it('moves Revisions first in the project sheet as the conflict’s decision, once, and opens it (HDR-05, I4, I5)', async () => {
    revisionStatusHarness.status = status({ attention: 1, conflicts: [conflict] });
    render(<MobileProjectTopBar />, { wrapper });
    expect(within(topBar()).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    const first = within(sheet)
      .getAllByRole('button')
      .find((button) => button.dataset['slot'] === 'project-sheet-row');
    expect(first).toHaveAccessibleName('Revisions');
    expect(first).toHaveAccessibleDescription('Needs your decision on main');
    expect(first?.closest('ul')).toHaveAccessibleName('Decision');
    // One way to Revisions on the sheet (I4).
    expect(within(sheet).getAllByRole('button', { name: 'Revisions' })).toHaveLength(1);
    fireEvent.click(first!);
    expect(openPanel).toHaveBeenLastCalledWith('revisions');
    expect(titleButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the decision first while a more urgent fact holds the status line (I5)', async () => {
    // An unconfirmed save outranks the conflict on the line; the decision still waits.
    revisionStatusHarness.status = status({ attention: 2, conflicts: [conflict] });
    render(<MobileProjectTopBar />, { wrapper });
    expect(titleButton()).toHaveTextContent('Save not confirmed');
    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    const decision = within(sheet).getByRole('list', { name: 'Decision' });
    expect(within(decision).getByRole('button', { name: 'Revisions' })).toHaveAccessibleDescription(
      'Needs your decision on main',
    );
  });

  it('keeps Revisions in the project list while nothing conflicts', async () => {
    render(<MobileProjectTopBar />, { wrapper });
    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    expect(within(sheet).queryByRole('list', { name: 'Decision' })).toBeNull();
    expect(
      within(within(sheet).getByRole('list', { name: 'Project' })).getByRole('button', { name: 'Revisions' }),
    ).toBeInTheDocument();
  });

  it('says Follow chat as a fact and puts the verb in the project sheet (HDR-06)', async () => {
    onBranch();
    render(<MobileProjectTopBar />, { wrapper });

    await waitFor(() => {
      expect(statusLine(titleButton())).toHaveTextContent('Saved · Follow chat');
    });
    expect(within(topBar()).queryByRole('button', { name: 'Follow chat' })).toBeNull();

    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Follow chat' }));
    expect(revisionStatusHarness.commands.pinTo).toHaveBeenCalledWith('co-2');
  });

  it('keeps a long name and its status in their own truncating lines beside the three controls (HDR-07)', () => {
    projectName = 'Planetary gearbox housing with integrated bearing seats and service cover, revision B';
    revisionStatusHarness.status = status({ attention: 1 });
    render(<MobileProjectTopBar />, { wrapper });

    const title = titleButton();
    expect(title).toHaveClass('min-w-0', 'flex-1');
    expect(within(title).getByText(projectName)).toHaveClass('truncate');
    expect(statusLine(title).lastElementChild).toHaveClass('truncate');
    expect(within(topBar()).getAllByRole('button')).toHaveLength(3);
  });

  it('opens the project sheet with Revisions, Export and Details once each, and no second Share (HDR-08)', async () => {
    render(<MobileProjectTopBar />, { wrapper });
    await waitFor(() => {
      expect(statusLine(titleButton())).toHaveTextContent('Saved');
    });

    fireEvent.click(titleButton());
    expect(titleButton()).toHaveAttribute('aria-expanded', 'true');
    const sheet = await screen.findByRole('dialog', { name: projectName });
    /* The sheet repeats the one status line under the name; it is the same line, not a second owner. */
    expect(statusLine(sheet)).toHaveTextContent(/^Saved$/u);
    expect(sheet).toHaveAccessibleDescription('Saved');
    const destinations = within(within(sheet).getByRole('list', { name: 'Project' })).getAllByRole('button');
    expect(destinations.map((row) => row.querySelector('span')?.textContent)).toEqual([
      'Revisions',
      'Export',
      'Details',
    ]);
    /* One destination, one place: Share is the bar's, the panes are the sheet's. */
    for (const name of ['Share', 'Revisions', 'Export', 'Details']) {
      expect(screen.getAllByRole('button', { name, hidden: true })).toHaveLength(1);
    }
    expect(within(sheet).queryByRole('button', { name: /Share/u })).toBeNull();
    /* Where the line is, for the Revisions row, without a second status cue. */
    expect(within(sheet).getByRole('button', { name: 'Revisions' })).toHaveAccessibleDescription('Rev 12 · main');
  });

  it('opens each destination in its surface and closes the sheet behind it', async () => {
    render(<MobileProjectTopBar />, { wrapper });

    for (const [name, panel] of [
      ['Revisions', 'revisions'],
      ['Export', 'export'],
      ['Details', 'details'],
    ] as const) {
      fireEvent.click(titleButton());
      // oxlint-disable-next-line no-await-in-loop -- The sheet opens asynchronously.
      const sheet = await screen.findByRole('dialog', { name: projectName });
      fireEvent.click(within(sheet).getByRole('button', { name }));
      expect(openPanel).toHaveBeenLastCalledWith(panel);
      expect(titleButton()).toHaveAttribute('aria-expanded', 'false');
    }
    fireEvent.click(within(topBar()).getByRole('button', { name: 'Share' }));
    expect(openPanel).toHaveBeenLastCalledWith('share');
  });

  it('uses the same words for label, tooltip and accessible name (I6)', async () => {
    const user = userEvent.setup();
    render(<MobileProjectTopBar />, { wrapper });

    const share = within(topBar()).getByRole('button', { name: 'Share' });
    await user.hover(share);
    const shareTooltip = await screen.findByRole('tooltip');
    expect(shareTooltip.textContent).toBe('Share');
    await user.unhover(share);

    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    for (const name of ['Revisions', 'Export', 'Details']) {
      const row = within(sheet).getByRole('button', { name });
      expect(row).not.toHaveAttribute('aria-label');
      expect(within(row).getByText(name)).toBeInTheDocument();
    }
    const close = within(sheet).getByRole('button', { name: 'Close project sheet' });
    await user.hover(close);
    const tooltips = await screen.findAllByRole('tooltip');
    expect(tooltips.map((tip) => tip.textContent)).toContain('Close project sheet');
  });

  it('marks keyboard chips to hide under a coarse pointer (I7)', async () => {
    const user = userEvent.setup();
    render(<MobileProjectTopBar />, { wrapper });

    await user.hover(within(topBar()).getByRole('button', { name: 'Open sidebar' }));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Open sidebar');
    const chips = [...document.querySelectorAll<HTMLElement>('[data-slot=tooltip-content] span')].filter((span) =>
      span.className.includes('rounded-xs'),
    );
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(chip).toHaveClass('pointer-coarse:hidden');
    }
  });
  it('draws a 20px sidebar glyph, the same size as Share’s', () => {
    render(<MobileProjectTopBar />, { wrapper });

    const sidebarIcon = within(topBar()).getByRole('button', { name: 'Open sidebar' }).querySelector('svg');
    const shareIcon = within(topBar()).getByRole('button', { name: 'Share' }).querySelector('svg');
    expect(sidebarIcon).toHaveClass('size-5');
    expect(shareIcon).toHaveClass('size-5');
  });

  it('hands focus to the surface a destination opened, not back to the title', async () => {
    openPanel.mockImplementationOnce(() => {
      // The phone shell names its sheet section after the surface it opens (the nav's chooseSurface path).
      const section = document.createElement('section');
      section.dataset['slot'] = 'mobile-surface';
      section.tabIndex = -1;
      section.setAttribute('aria-label', 'Export');
      document.body.append(section);
    });
    render(<MobileProjectTopBar />, { wrapper });

    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Export' }));

    await waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-slot=mobile-surface]'));
    });
    expect(document.activeElement).not.toBe(titleButton());
  });

  it('moves focus into the project sheet as it opens, so a keyboard user is inside the modal sheet', async () => {
    render(<MobileProjectTopBar />, { wrapper });

    titleButton().focus();
    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    await waitFor(() => {
      expect(sheet).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it.each(['Close', 'Escape'])('returns focus to the title when the sheet is dismissed with %s', async (how) => {
    render(<MobileProjectTopBar />, { wrapper });

    fireEvent.click(titleButton());
    const sheet = await screen.findByRole('dialog', { name: projectName });
    if (how === 'Close') {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Close project sheet' }));
    } else {
      fireEvent.keyDown(sheet, { key: 'Escape' });
    }

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: projectName })).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(titleButton());
    });
    expect(openPanel).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the project failed to load',
      () => {
        isProjectError = true;
      },
    ],
    [
      'the workspace is unavailable',
      () => {
        unavailableReason = 'permission';
      },
    ],
  ])('stands its project actions down while %s, keeping the sidebar', (_name, makeUnavailable) => {
    makeUnavailable();
    render(<MobileProjectTopBar />, { wrapper });

    expect(titleButton()).toBeDisabled();
    expect(within(topBar()).getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(within(topBar()).getByRole('button', { name: 'Open sidebar' })).toBeEnabled();
    fireEvent.click(titleButton());
    fireEvent.click(within(topBar()).getByRole('button', { name: 'Share' }));
    expect(screen.queryByRole('dialog', { name: projectName })).toBeNull();
    expect(openPanel).not.toHaveBeenCalled();
  });
});
