import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cloud, GitBranch, History, Pencil, RotateCcw, XIcon } from 'lucide-react';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';
import { Button } from '@taucad/ui/components/button';
import { RevisionMarker } from '#routes/w.$workspace.$project/revision-marker.js';
import { RevisionBranches } from '#routes/w.$workspace.$project/revision-branches.js';
import type { ConflictMaterialization } from '#routes/w.$workspace.$project/revision-branches.js';
import { RevisionSyncRegion } from '#routes/w.$workspace.$project/revision-sync-region.js';
import { useRevisionChanges, useRevisions } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { useRevisionClient, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { clearTurnOutcome, useTurnOutcomes } from '#routes/w.$workspace.$project/revision-outcomes.js';
import { useChats } from '#hooks/use-chats.js';
import { useProject } from '#hooks/use-project.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { useSelector } from '@xstate/react';
import { useProjectManager } from '#hooks/use-project-manager.js';

/**
 * The Revisions pane (S26, A18, A29).
 *
 * Four regions, each revealed only when it has something to say: *Where you
 * are* and *History* always, *Branches* once a second branch exists, *Sync*
 * once a remote does. A hobbyist sees one region; an engineer sees four.
 *
 * Everything here reads two hooks — `useRevisions()` for the graph and
 * `useRevisionStatus()` for the projection — and sends the machine's own verbs
 * back. No surface derives a revision number, a "Current", or a dirty flag of
 * its own (I3).
 *
 * A mobile `FloatingPanel` wrapper around the shared Workbench body.
 */
export function ChatRevisions({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Revisions</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            <FloatingPanelClose
              icon={XIcon}
              tooltipContent={(isOpen) => (
                <div className='flex items-center gap-2'>{isOpen ? 'Close' : 'Open'} Revisions</div>
              )}
            />
          </FloatingPanelContentHeaderActions>
        </FloatingPanelContentHeader>
        <FloatingPanelContentBody className='p-0'>
          <RevisionsPanelBody />
        </FloatingPanelContentBody>
      </FloatingPanelContent>
    </FloatingPanel>
  );
}

/**
 * *Where you are* — the region that is always shown (S26).
 *
 * One line for the branch, the revision the checkout reflects, and whether it
 * has been written to since; the verbs that act on *now* sit beside it.
 * *Save revision* is W6's (`Mod+S` and the `save` trigger), so what is here is
 * the state and the two restore verbs, which exist today.
 */
function WhereYouAre({ onOpenSync }: { readonly onOpenSync: () => void }): React.JSX.Element {
  const { projectId } = useProject();
  const { branch, headRevisionId, revisions, isDirty, canReturnToLatest } = useRevisions();
  const status = useRevisionStatus();
  const { returnToLatest, restore, isBusy } = useRestoreToPoint();
  const outcomes = useTurnOutcomes(projectId);
  const head = revisions.find((revision) => revision.revisionId === headRevisionId);
  const revisionName = head?.n === undefined ? undefined : `Rev ${String(head.n)}`;

  return (
    <section aria-labelledby='revision-where-heading' className='flex flex-col gap-2'>
      <h3 id='revision-where-heading' className='text-xs font-medium text-muted-foreground'>
        Where you are
      </h3>
      <div className='flex flex-wrap items-center gap-2'>
        <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
        <span className='truncate text-sm font-medium'>{branch ?? 'Not on a branch yet'}</span>
        {revisionName === undefined ? null : (
          <>
            <span aria-hidden className='text-muted-foreground'>
              ·
            </span>
            <span className='font-mono text-sm'>{revisionName}</span>
          </>
        )}
        {/* ponytail: no second "Current" badge here. This line *is* where you
            are, and the History row of the revision it names carries the word
            (A29: one surface says one thing once). */}
      </div>

      {isDirty ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <span className='flex items-center gap-1.5 text-xs'>
            <Pencil aria-hidden className='size-3 text-warning' />
            {revisionName === undefined ? 'Modified' : `Modified since ${revisionName}`}
          </span>
          {headRevisionId === undefined ? null : (
            <Button
              size='xs'
              variant='ghost'
              disabled={isBusy}
              onClick={() => {
                restore(headRevisionId);
              }}
            >
              Discard changes
            </Button>
          )}
        </div>
      ) : null}

      {status?.remote.kind === 'none' ? (
        <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <span>Not backed up</span>
          <Button size='xs' variant='outline' onClick={onOpenSync}>
            <Cloud aria-hidden className='size-3' />
            Connect Tau Cloud
          </Button>
        </div>
      ) : null}

      {canReturnToLatest ? (
        <Button size='sm' variant='outline' className='gap-1.5 self-start' disabled={isBusy} onClick={returnToLatest}>
          <RotateCcw aria-hidden className='size-3' />
          Return to latest
        </Button>
      ) : null}

      {/* `attention` is the whole "needs you" count (S46) and a conflict is now
          part of it — but a conflicted merge saved everything it was asked to,
          on the source branch, so counting it as a failed save says the opposite
          of what happened (review R5). The two are named separately. */}
      {outcomes.length === 0 && status !== undefined && status.attention - status.conflicts.length > 0 ? (
        <p role='alert' className='flex items-center gap-2 text-xs'>
          <AlertTriangle aria-hidden className='size-3.5 shrink-0 text-destructive' />
          <span>
            {status.attention - status.conflicts.length === 1
              ? 'One change could not be saved. Try again from the file that failed.'
              : `${String(status.attention - status.conflicts.length)} changes could not be saved.`}
          </span>
        </p>
      ) : null}

      {outcomes.map((outcome) => (
        <div key={outcome.turnId} role='alert' className='flex items-start gap-2 text-xs'>
          <AlertTriangle aria-hidden className='mt-0.5 size-3.5 shrink-0 text-destructive' />
          <span className='flex-1'>
            {outcome.kind === 'conflicted'
              ? 'This change needs your attention: two versions changed the same files.'
              : `Nothing was saved for this change.${outcome.reason === undefined ? '' : ` ${outcome.reason}`}`}
          </span>
          <Button
            size='xs'
            variant='ghost'
            onClick={() => {
              clearTurnOutcome(projectId, outcome.turnId);
            }}
          >
            Dismiss
          </Button>
        </div>
      ))}
    </section>
  );
}

function HistoryRow({
  revision,
  isActive,
  isModified,
  isBusy,
  onRestore,
  onTag,
  onDeleteTag,
}: {
  readonly revision: RevisionCard;
  readonly isActive: boolean;
  readonly isModified: boolean;
  readonly isBusy: boolean;
  readonly onRestore: () => void;
  readonly onTag: (name: string) => Promise<void>;
  readonly onDeleteTag: (name: string) => Promise<void>;
}): React.JSX.Element {
  const changes = useRevisionChanges(revision);
  return (
    <li className='relative border-l border-border pl-3 before:absolute before:top-4 before:-left-1 before:size-2 before:rounded-full before:bg-muted-foreground'>
      <div className='px-3 py-2 text-xs text-muted-foreground'>
        <p className='text-sm text-foreground'>{revision.summary}</p>
        <p className='mt-0.5'>
          {revision.actor}
          {revision.conflicted ? ' · Needs resolution' : ''}
        </p>
      </div>
      <RevisionMarker
        revision={revision}
        changes={changes}
        isActive={isActive}
        isModified={isModified}
        isBusy={isBusy}
        /* S38's second half (W5 review R4): on the revision the checkout sits
         * on, with changes that are not in a revision yet, *Compare* answers
         * "what have I changed since this" instead of repeating what the
         * revision itself changed. */
        compareAgainst={isActive && isModified ? 'checkout' : 'parent'}
        onRestore={onRestore}
        onDiscard={onRestore}
        onTag={onTag}
        onDeleteTag={onDeleteTag}
        appearance='rail'
      />
    </li>
  );
}

type HistoryGroup =
  | Readonly<{ kind: 'revision'; revision: RevisionCard }>
  | Readonly<{ kind: 'autosaves'; revisions: readonly RevisionCard[] }>;

/** Fold only consecutive, unnamed idle cuts; meaningful revisions stay visible. */
export const groupRevisionHistory = (
  revisions: readonly RevisionCard[],
  headRevisionId: string | undefined,
): readonly HistoryGroup[] => {
  const groups: HistoryGroup[] = [];
  for (const revision of revisions) {
    const foldable =
      revision.revisionId !== headRevisionId &&
      (revision.tags?.length ?? 0) === 0 &&
      revision.turnId === undefined &&
      !revision.conflicted &&
      (revision.trigger === 'idle' || revision.trigger === 'hidden' || revision.trigger === 'close');
    const previous = groups.at(-1);
    if (foldable && previous?.kind === 'autosaves') {
      groups[groups.length - 1] = {
        kind: 'autosaves',
        revisions: [...previous.revisions, revision],
      };
    } else if (foldable) {
      groups.push({ kind: 'autosaves', revisions: [revision] });
    } else {
      groups.push({ kind: 'revision', revision });
    }
  }
  return groups.map((group) =>
    group.kind === 'autosaves' && group.revisions.length === 1
      ? { kind: 'revision', revision: group.revisions[0]! }
      : group,
  );
};

/**
 * The marker text the worker materialized, by revision and path.
 *
 * *Open* is a request, not a render: `resolution.machine` reads the three terms
 * out of the graph and renders the markers where the trees are, then says so
 * once. No checkout and no machine context ever holds those bytes (A22, I29),
 * so the one place they can live is here, for as long as the pane is open.
 *
 * @returns A lookup keyed `<revisionId>\u0000<path>`.
 */
function useConflictTexts(): Readonly<Record<string, ConflictMaterialization>> {
  const client = useRevisionClient();
  const [texts, setTexts] = useState<Readonly<Record<string, ConflictMaterialization>>>({});

  useEffect(() => {
    if (client === undefined) {
      return undefined;
    }
    return client.subscribeToasts((entry) => {
      if (entry.type !== 'conflictText') {
        return;
      }
      setTexts((current) => ({
        ...current,
        [`${entry.revisionId}\u0000${entry.path}`]: {
          text: entry.text,
          ours: entry.ours,
          theirs: entry.theirs,
        },
      }));
    });
  }, [client]);

  return texts;
}

export function RevisionsPanelBody(): React.JSX.Element {
  const { projectId, projectRef } = useProject();
  const project = useSelector(projectRef, (snapshot) => snapshot.context.project);
  const { updateProject } = useProjectManager();
  const { revisions, headRevisionId, branch, branchFacts = new Map(), isLoading } = useRevisions();
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const { restore, isBusy } = useRestoreToPoint();
  const { chats } = useChats(projectId);
  /* A29: *Sync* appears when a remote exists, or when the person opens it. */
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const chatNames = useMemo(() => Object.fromEntries(chats.map((chat) => [chat.id, chat.name])), [chats]);
  const chatCheckoutIds = useMemo(() => Object.fromEntries(chats.map((chat) => [chat.id, chat.checkoutId])), [chats]);
  const branches = status?.branches ?? [];
  const conflictTexts = useConflictTexts();
  const historyGroups = groupRevisionHistory(revisions, headRevisionId);
  const recentHistory = historyGroups.slice(0, 8);
  const earlierHistory = historyGroups.slice(8);
  const renderHistoryGroup = (group: HistoryGroup): React.JSX.Element => {
    if (group.kind === 'autosaves') {
      return (
        <li key={group.revisions[0]!.revisionId} className='border-l border-border pl-3'>
          <details>
            <summary className='cursor-pointer py-2 text-xs text-muted-foreground'>
              {group.revisions.length} autosaves
            </summary>
            <ol className='flex list-none flex-col gap-2'>
              {group.revisions.map((revision) => renderHistoryGroup({ kind: 'revision', revision }))}
            </ol>
          </details>
        </li>
      );
    }
    const { revision } = group;
    const isActive = headRevisionId === revision.revisionId;
    return (
      <HistoryRow
        key={revision.revisionId}
        revision={revision}
        isActive={isActive}
        isModified={false}
        isBusy={isBusy}
        onRestore={() => {
          restore(revision.revisionId);
        }}
        onTag={async (name) => {
          await commands.tag({ name, revisionId: revision.revisionId });
        }}
        onDeleteTag={commands.deleteTag}
      />
    );
  };

  return (
    <div data-slot='revisions-panel-body' className='size-full min-h-0 overflow-hidden bg-sidebar'>
      <div className='flex size-full scroll-shadows-y flex-col gap-3 overflow-y-auto p-3 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        <WhereYouAre
          onOpenSync={() => {
            setIsConnectOpen(true);
          }}
        />

        {/* A29: one branch is not a choice, so the region does not exist yet. */}
        {branches.length > 1 ? (
          <RevisionBranches
            branches={branches}
            currentBranch={branch}
            chatNames={chatNames}
            chatCheckoutIds={chatCheckoutIds}
            branchFacts={branchFacts}
            /* A verb waiting on a person is still in flight: re-enabling the
               rows while its question is open invites a second verb on top of
               the first (review R4). */
            isBusy={(status?.branchVerb.busy ?? false) || (status?.branchVerb.asking ?? false)}
            conflicts={status?.conflicts ?? []}
            onSwitch={commands.switchTo}
            onMerge={commands.mergeBranch}
            onDiscard={commands.discardBranch}
            onCreate={commands.createBranch}
            onRename={commands.renameBranch}
            onKeepSide={commands.resolveFile}
            onOpenConflict={commands.openConflictInEditor}
            onAskChat={commands.askChatToResolve}
            onFinishResolution={commands.finishResolution}
            onResolveInEditor={commands.resolveFileInEditor}
            conflictTexts={conflictTexts}
          />
        ) : null}

        <section aria-labelledby='revision-history-heading' className='flex min-h-0 flex-col gap-2'>
          <h3 id='revision-history-heading' className='text-xs font-medium text-muted-foreground'>
            History
          </h3>
          {isLoading ? (
            <div
              role='status'
              aria-busy='true'
              className='min-h-24 rounded-xl border bg-card p-4 text-sm text-muted-foreground'
            >
              Loading history…
            </div>
          ) : revisions.length === 0 ? (
            <PanelEmptyState
              icon={History}
              title='No revisions yet'
              description='Saved changes will appear here.'
              className='[container-type:inline-size] m-0 h-auto min-h-44 w-full rounded-xl border bg-card'
            />
          ) : (
            <>
              <ol aria-label='Recent revision history' className='flex list-none flex-col gap-2'>
                {recentHistory.map(renderHistoryGroup)}
              </ol>
              {earlierHistory.length === 0 ? null : (
                <details>
                  <summary className='cursor-pointer py-2 text-xs font-medium text-muted-foreground'>Earlier</summary>
                  <ol aria-label='Earlier revision history' className='flex list-none flex-col gap-2'>
                    {earlierHistory.map(renderHistoryGroup)}
                  </ol>
                </details>
              )}
            </>
          )}
        </section>

        {/* A29/D26: *Sync* appears once a remote does. The region is W11b/W13's;
            the pane only composes it. */}
        {status !== undefined && (status.remote.kind !== 'none' || isConnectOpen) ? (
          <RevisionSyncRegion
            remote={status.remote}
            sync={status.sync}
            onConnect={commands.connectRemote}
            onDisconnect={commands.disconnectRemote}
            onCancel={commands.cancelRemote}
            onSync={commands.syncNow}
            syncChats={project?.syncChats !== false}
            onSyncChatsChange={(enabled) => {
              void updateProject(projectId, { syncChats: enabled });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
