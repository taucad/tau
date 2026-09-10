import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RevisionBranches } from '#routes/w.$workspace.$project/revision-branches.js';
import type { RevisionBranchesProps } from '#routes/w.$workspace.$project/revision-branches.js';
import type { RevisionBranchSummary } from '#providers/chat-workspace-authority-provider.js';

const branch = (over: Partial<RevisionBranchSummary> = {}): RevisionBranchSummary => ({
  name: 'main',
  headRevisionId: 'rev_main',
  summary: 'Tau turn',
  actorId: 'chat_tau',
  source: 'agent',
  createdAt: 1_700_000_000_000,
  ...over,
});

const codex = branch({
  name: 'agent/chat-codex/trun-codex',
  headRevisionId: 'rev_codex',
  summary: 'Codex turn',
  actorId: 'codex',
});

const renderBranches = (
  over: Partial<RevisionBranchesProps> = {},
): {
  onSwitch: ReturnType<typeof vi.fn>;
  onMerge: ReturnType<typeof vi.fn>;
  onDiscard: ReturnType<typeof vi.fn>;
} => {
  const onSwitch = vi.fn();
  const onMerge = vi.fn();
  const onDiscard = vi.fn();
  render(
    <RevisionBranches
      branches={[branch(), codex]}
      activeBranch='main'
      diff={() => [{ path: 'bracket.scad', change: 'added' }]}
      onSwitch={onSwitch}
      onMerge={onMerge}
      onDiscard={onDiscard}
      {...over}
    />,
  );
  return { onSwitch, onMerge, onDiscard };
};

describe('RevisionBranches', () => {
  it('lists every branch and the agent that wrote its head', () => {
    renderBranches();

    // A Codex turn's branch is a peer of the Tau one, listed the same way.
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('agent/chat-codex/trun-codex')).toBeInTheDocument();
    expect(screen.getByText('codex')).toBeInTheDocument();
    expect(screen.getByText('Codex turn')).toBeInTheDocument();
    expect(screen.getByText('1 file differs from main: bracket.scad (added)')).toBeInTheDocument();
    // The current branch is the live tree; there is nothing to switch to.
    expect(screen.getAllByRole('button', { name: 'Switch' })).toHaveLength(1);
  });

  it('switches, merges and discards the branch the row names', () => {
    const { onSwitch, onMerge, onDiscard } = renderBranches();

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge into main' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(onSwitch).toHaveBeenCalledExactlyOnceWith(codex);
    expect(onMerge).toHaveBeenCalledExactlyOnceWith(codex);
    expect(onDiscard).toHaveBeenCalledExactlyOnceWith(codex);
  });

  it('renders a conflicted merge as values, never as a lost turn (I-CONF)', () => {
    renderBranches({
      mergeResult: {
        source: codex.name,
        result: {
          status: 'conflicted',
          branchName: 'main',
          conflict: { type: 'merge', kind: 'text', paths: ['main.scad', 'bracket.scad'] },
        },
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Merge conflict (text) in main.scad, bracket.scad — both branches kept',
    );
    // Still offered: a conflict is something to resolve and retry, not a dead end.
    expect(screen.getByRole('button', { name: 'Merge into main' })).toBeEnabled();
  });

  it('M2: refuses merge and discard while the live tree is on no branch', () => {
    /* No branch is the live tree — a transcript-fallback node, or a Restore of
     * a revision no branch names (c2-review S1) — so merging into it and
     * discarding against it are meaningless. The pane used to default the
     * target to `main` and merge into a branch the user was not on (6-review
     * M2). */
    const { onMerge, onDiscard } = renderBranches({ activeBranch: undefined });

    expect(screen.getByRole('status')).toHaveTextContent('The live project tree is not on any of these branches');
    const merges = screen.getAllByRole('button', { name: 'Merge into the current branch' });
    const discards = screen.getAllByRole('button', { name: 'Discard' });
    expect(merges).toHaveLength(2);
    for (const button of [...merges, ...discards]) {
      expect(button).toBeDisabled();
    }
    // Switching still works: it is how the user gets onto a branch.
    expect(screen.getAllByRole('button', { name: 'Switch' })).toHaveLength(2);
    fireEvent.click(discards[0]!);
    fireEvent.click(merges[0]!);
    expect(onMerge).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('renders nothing at all when the authority holds no branch', () => {
    renderBranches({ branches: [] });

    expect(screen.queryByLabelText('Revision branches')).not.toBeInTheDocument();
  });
});
