import { GitBranch, GitMerge, RotateCcw } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Spinner } from '#components/ui/spinner.js';
import type {
  BranchMergeResult,
  RevisionBranchSummary,
  RevisionPathChange,
} from '#providers/chat-workspace-authority-provider.js';

export type RevisionBranchesProps = {
  /** Every branch head the revision authority holds, whichever agent wrote it. */
  readonly branches: readonly RevisionBranchSummary[];
  /**
   * The branch the live project tree is on, and the one a merge lands in.
   *
   * `undefined` when the current revision is a transcript-fallback node: those
   * carry a synthesized name no store holds, so merging into it, diffing
   * against it and discarding it are all meaningless rather than merely
   * unavailable.
   */
  readonly activeBranch?: string;
  /** What separates a branch head from the active head, by path. */
  readonly diff: (branch: RevisionBranchSummary) => readonly RevisionPathChange[];
  /** Point the live project tree at this branch's head. */
  readonly onSwitch: (branch: RevisionBranchSummary) => void;
  /** Merge this branch into the active one. */
  readonly onMerge: (branch: RevisionBranchSummary) => void;
  /** Remove this branch's ref; the revisions it reached stay in the store. */
  readonly onDiscard: (branch: RevisionBranchSummary) => void;
  /** The last merge outcome, keyed by the branch that was merged. */
  readonly mergeResult?: { readonly source: string; readonly result: BranchMergeResult } | undefined;
  readonly isBusy?: boolean;
};

/**
 * The DT1 branch porcelain: every branch a turn published, and the four verbs
 * over it — switch, merge, diff and discard.
 *
 * Entirely presentational, like `RevisionMarker`: every read is a prop, so it
 * renders in a test without mounting the workspace authority (whose provider
 * hangs a jsdom mount).
 *
 * A conflicted merge is rendered as **values** — the branch, the kind and every
 * conflicted path — because a conflict is an outcome the user resolves, never
 * an error that discards the turn (I-CONF).
 */
export function RevisionBranches({
  branches,
  activeBranch,
  diff,
  onSwitch,
  onMerge,
  onDiscard,
  mergeResult,
  isBusy = false,
}: RevisionBranchesProps): React.ReactNode {
  if (branches.length === 0) {
    return null;
  }
  return (
    <section aria-label='Revision branches' className='border-b border-border/60 p-2'>
      <h3 className='px-1 pb-1.5 text-xs font-medium text-muted-foreground'>Branches</h3>
      {activeBranch === undefined ? (
        <p role='status' className='px-1 pb-1.5 text-xs text-muted-foreground'>
          The live project tree is not on any of these branches — switch to one before merging, comparing or discarding.
        </p>
      ) : null}
      <ul className='flex list-none flex-col gap-1.5'>
        {branches.map((branch) => {
          const isActive = branch.name === activeBranch;
          const changes = diff(branch);
          const outcome = mergeResult?.source === branch.name ? mergeResult.result : undefined;
          return (
            <li key={branch.name} className='rounded-xl border border-border/70 bg-card px-3 py-2'>
              <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                <GitBranch aria-hidden='true' className='size-3' />
                <span className='font-medium text-foreground'>{branch.name}</span>
                {isActive ? <Badge variant='secondary'>Current</Badge> : null}
                <span>{branch.actorId}</span>
              </div>
              <p className='mt-1 text-sm text-foreground'>{branch.summary}</p>
              <p className='mt-0.5 text-xs text-muted-foreground'>
                {isActive
                  ? 'The live project tree'
                  : activeBranch === undefined
                    ? 'No branch is current'
                    : changes.length === 0
                      ? `No file differs from ${activeBranch}`
                      : `${changes.length === 1 ? '1 file differs' : `${changes.length} files differ`} from ${activeBranch}: ${changes
                          .map((change) => `${change.path} (${change.change})`)
                          .join(', ')}`}
              </p>
              {outcome === undefined ? null : (
                <p
                  role='status'
                  className={
                    outcome.status === 'conflicted'
                      ? 'mt-1 text-xs text-destructive'
                      : 'mt-1 text-xs text-muted-foreground'
                  }
                >
                  {outcome.status === 'conflicted'
                    ? `Merge conflict (${outcome.conflict.kind}) in ${outcome.conflict.paths.join(', ')} — both branches kept`
                    : outcome.status === 'merged'
                      ? `Merged into ${outcome.branchName}: ${outcome.changedPaths.join(', ')}`
                      : `${outcome.branchName} already holds this branch`}
                </p>
              )}
              {/* The branch the live tree is already on offers no verb: switching
                  to where you are, and merging a branch into itself, are both
                  no-ops, and a disabled row of them is just noise. */}
              {isActive ? null : (
                <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                  {isBusy ? <Spinner className='size-3' /> : null}
                  <Button
                    size='xs'
                    variant='outline'
                    disabled={isBusy}
                    onClick={() => {
                      onSwitch(branch);
                    }}
                  >
                    Switch
                  </Button>
                  <Button
                    size='xs'
                    variant='outline'
                    className='gap-1'
                    disabled={isBusy || activeBranch === undefined}
                    onClick={() => {
                      onMerge(branch);
                    }}
                  >
                    <GitMerge aria-hidden='true' className='size-3' />
                    Merge into {activeBranch ?? 'the current branch'}
                  </Button>
                  <Button
                    size='xs'
                    variant='ghost'
                    className='gap-1'
                    disabled={isBusy || activeBranch === undefined}
                    onClick={() => {
                      onDiscard(branch);
                    }}
                  >
                    <RotateCcw aria-hidden='true' className='size-3' />
                    Discard
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
