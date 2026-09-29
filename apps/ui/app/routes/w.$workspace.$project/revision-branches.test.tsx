/**
 * A conflict that travels (D14), as the pane shows it: a decision named by the
 * line it lands on, with *Keep mine* / *Keep theirs* from this device's side,
 * and another device's conflict line removable through D24's verb.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RevisionConflictFacet } from '@taucad/revisions';
import { ConflictDecision, RevisionBranches } from '#routes/w.$workspace.$project/revision-branches.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';
import { requestRefRemoval } from '#routes/w.$workspace.$project/revision-ref-removal.js';

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});
vi.mock('#routes/w.$workspace.$project/revision-ref-removal.js', () => ({ requestRefRemoval: vi.fn() }));
vi.mock('#components/code/diff-viewer.js', () => ({ DiffViewer: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-conflict-editor.js', () => ({ RevisionConflictEditor: () => null }));

const line = 'conflicts/main/device-b';
const foreign: RevisionConflictFacet = {
  revisionId: 'rev-c',
  branch: line,
  into: 'main',
  foreign: true,
  labels: { ours: 'main', theirs: 'tau/main' },
  paths: [
    { path: 'part.scad', openable: true, side: undefined },
    { path: '.tau/parameters/part.json', openable: false, side: undefined, keys: ['height'] },
  ],
  busy: false,
  ready: false,
};

const decision = (conflict: RevisionConflictFacet, onKeepSide = vi.fn()) =>
  render(
    <ConflictDecision
      conflict={conflict}
      currentBranch='main'
      conflictTexts={{}}
      onKeepSide={onKeepSide}
      onOpenConflict={vi.fn()}
      onAskChat={vi.fn()}
      onFinishResolution={vi.fn()}
      onResolveInEditor={vi.fn()}
    />,
  );

const branches = (conflict: RevisionConflictFacet) =>
  render(
    <RevisionBranches
      branches={[
        { name: 'main', head: 'rev-1', checkoutId: 'live', checkoutRoot: '/p', leaseChatIds: [] },
        {
          name: conflict.branch ?? '',
          head: conflict.revisionId,
          checkoutId: undefined,
          checkoutRoot: undefined,
          leaseChatIds: [],
        },
      ]}
      currentBranch='main'
      liveCheckoutId='live'
      chatNames={{}}
      chatCheckoutIds={{}}
      branchFacts={new Map()}
      conflicts={[conflict]}
      isBusy={false}
      isWritable
      onSwitch={vi.fn()}
      onMerge={vi.fn()}
      onDiscard={vi.fn()}
      onRename={vi.fn()}
    />,
  );

beforeEach(() => {
  revisionStatusHarness.reset();
  revisionStatusHarness.status = {
    ...revisionStatusHarness.status,
    remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
  };
  revisionStatusHarness.role = 'owner';
  vi.mocked(requestRefRemoval).mockReset();
});

describe('a decision that travels (D14)', () => {
  it('names the line it lands on and keeps sides device-relative, with a parameter as choose-one', async () => {
    const user = userEvent.setup();
    const onKeepSide = vi.fn();
    decision(foreign, onKeepSide);

    expect(
      screen.getByText(
        'Another device and this one changed the same lines in 2 files on main. main is untouched until you choose.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge into main' })).toBeDisabled();
    expect(screen.getByText('Both changed height')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit .tau/parameters/part.json manually' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep theirs in .tau/parameters/part.json' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep mine in part.scad' }));
    expect(onKeepSide).toHaveBeenCalledWith('rev-c', 'part.scad', 'mine');
  });

  it('says an editor overlap is your edit against the line', () => {
    decision({ ...foreign, foreign: false, labels: { ours: 'main', theirs: 'main' }, paths: [foreign.paths[0]!] });

    expect(
      screen.getByText(
        'Your edit and the latest main changed the same lines in 1 file. main is untouched until you choose.',
      ),
    ).toBeInTheDocument();
  });
});

describe('a conflict line in Branches (D14)', () => {
  it('names a line by its decision, and offers no Switch or branch verbs on this device’s own', () => {
    branches({ ...foreign, branch: 'conflicts/main/device-a', foreign: false });

    expect(screen.getByText('Your decision on main')).toBeInTheDocument();
    expect(screen.queryByText('conflicts/main/device-a')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Switch to conflicts/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actions for Your decision on main' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for main' })).toBeInTheDocument();
  });

  it('offers Remove to the project’s owner only (RV-W6 F5)', () => {
    revisionStatusHarness.role = 'write';
    branches(foreign);

    expect(screen.getByText('Another device’s decision on main')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Another device’s decision on main' }),
    ).not.toBeInTheDocument();
  });

  it('removes another device’s line through the audited verb, then syncs', async () => {
    const user = userEvent.setup();
    vi.mocked(requestRefRemoval).mockResolvedValue({ kind: 'removed' });
    branches(foreign);

    expect(screen.queryByRole('button', { name: `Switch to ${line}` })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actions for Another device’s decision on main' }));
    expect(screen.queryByRole('menuitem', { name: /Rename/u })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Remove this decision…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Remove another device’s decision on main?' });
    expect(dialog).toHaveTextContent('part.scad, .tau/parameters/part.json');
    /* The raw line is for engineers, behind Details. */
    expect(dialog).toHaveTextContent(`refs/heads/${line}`);
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(requestRefRemoval).toHaveBeenCalledWith('p', `refs/heads/${line}`);
    expect(revisionStatusHarness.commands.syncNow).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('says who may remove it when the remote refuses', async () => {
    const user = userEvent.setup();
    vi.mocked(requestRefRemoval).mockResolvedValue({ kind: 'refused', code: 'GIT_REF_REMOVAL_OWNER_ONLY' });
    branches(foreign);

    await user.click(screen.getByRole('button', { name: 'Actions for Another device’s decision on main' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove this decision…' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only the project’s owner can remove another device’s decision.',
    );
    expect(revisionStatusHarness.commands.syncNow).not.toHaveBeenCalled();
  });
});
