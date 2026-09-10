import { GitBranch, History, RotateCcw, XIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
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
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import { useRestoreToPoint } from '#hooks/use-restore-to-point.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { Input } from '@taucad/ui/components/input';
import { useRevisionGraphActions } from '#hooks/use-revision-graph.js';
import type { RevisionGraphNode } from '#lib/revision-graph.js';
import { RevisionBranches } from '#routes/w.$workspace.$project/revision-branches.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import type { BranchMergeResult, RevisionBranchSummary } from '#providers/chat-workspace-authority-provider.js';

/**
 * The Revisions pane (R13) — the primary, discoverable cross-chat time-travel
 * surface. Every chat-backed revision is projected into its branch, parent,
 * fork point, immutable tree identity, publication, and conflict metadata.
 * Active-line revisions retain the existing restore path; abandoned branch
 * nodes remain inspectable instead of being erased.
 *
 * A mobile `FloatingPanel` wrapper around the shared Workbench body.
 *
 * ponytail: baseline (Revision 0) restore and the expandable per-row DiffViewer
 * preview are deferred — the list + click-to-restore is the load-bearing R13
 * value.
 */
export function ChatRevisions({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element {
  const { canReturnToLatest } = useVisibleRevisions();
  const { returnToLatest, isBusy } = useRestoreToPoint();
  return (
    <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
      <FloatingPanelContent>
        <FloatingPanelContentHeader>
          <FloatingPanelContentTitle>Revisions</FloatingPanelContentTitle>
          <FloatingPanelContentHeaderActions>
            {canReturnToLatest ? (
              <Button size='xs' variant='ghost' className='h-6 gap-1 px-1.5' disabled={isBusy} onClick={returnToLatest}>
                <RotateCcw className='size-3' />
                Return to latest
              </Button>
            ) : null}
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

export function RevisionsPanelBody(): React.JSX.Element {
  const { graph, isDirty } = useVisibleRevisions();
  const { restore, isBusy } = useRestoreToPoint();
  const { editSummary } = useRevisionGraphActions();

  return (
    <div data-slot='revisions-panel-body' className='size-full min-h-0 overflow-hidden bg-sidebar'>
      <RevisionBranchesSection />
      <div className='size-full scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {graph.nodes.length === 0 ? (
          <PanelEmptyState
            icon={History}
            title='No revisions yet'
            description='Agent changes will appear here.'
            className='m-0 min-h-full rounded-xl border bg-card'
          />
        ) : (
          <ol aria-label='Revision branch graph' className='flex min-h-full list-none flex-col gap-2'>
            {[...graph.nodes].reverse().map((node) => {
              const { revision } = node;
              const isActive = graph.headId === node.id;
              const restoreThis = (): void => {
                restore({
                  messageId: revision.messageId,
                  anchor: revision.anchor,
                  identitySource: node.identitySource,
                  ...(node.identitySource === 'authoritative' ? { revisionId: node.id } : {}),
                });
              };
              return (
                <li key={node.id} className='rounded-xl border border-border/70 bg-card'>
                  <RevisionGraphMetadata
                    node={node}
                    isBranchHead={graph.branches.some((branch) => branch.headId === node.id)}
                    onEditSummary={editSummary}
                  />
                  <RevisionMarker
                    revision={revision}
                    isActive={isActive}
                    isModified={isActive && isDirty}
                    isBusy={isBusy || (!node.isRestorable && node.identitySource === 'transcript')}
                    onRestore={restoreThis}
                    onDiscard={restoreThis}
                  />
                  {/* The gate is about *replaying chat evidence*: a node the
                      revision store holds is restored by checking it out, so a
                      superseded branch is inspect-only only when that is the
                      only route it has. */}
                  {node.isRestorable || node.identitySource === 'authoritative' ? null : (
                    <p className='px-3 pb-2 text-xs text-muted-foreground'>Historical branch · inspect only</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * The DT1 branch porcelain, wired to the workspace authority, with "Current"
 * read from the store's head reference.
 *
 * Optional authority on purpose: the Revisions pane also renders in profiles
 * that never mount one (the generic chat client), and a branch list is an
 * addition to that pane, never a precondition for it.
 *
 * Not from the graph head: a checkout moves where the live tree is without
 * recording a turn, so labelling the newest turn's branch "Current" mislabelled
 * the folder after every Switch and left a candidate that happened to be the
 * newest revision with no verb at all (operator decisions 2026-09-09, question
 * 11). A store with no head reference yet labels nothing current, which is what
 * the transcript-fallback guard used to do.
 */
function RevisionBranchesSection(): React.ReactNode {
  const authority = useOptionalChatWorkspaceAuthority();
  const activeBranch = useSyncExternalStore(
    authority?.subscribe ?? noBranchSubscription,
    authority?.headBranch ?? noHeadBranch,
    authority?.headBranch ?? noHeadBranch,
  );
  const [merge, setMerge] = useState<{ readonly source: string; readonly result: BranchMergeResult }>();
  const [isBusy, setIsBusy] = useState(false);
  const branches = useSyncExternalStore(
    authority?.subscribe ?? noBranchSubscription,
    authority?.listBranches ?? noBranches,
    authority?.listBranches ?? noBranches,
  );
  if (!authority) {
    return null;
  }
  const activeHead =
    activeBranch === undefined ? undefined : branches.find((branch) => branch.name === activeBranch)?.headRevisionId;
  const run = (operation: () => Promise<unknown>): void => {
    setIsBusy(true);
    // async-iife: bootstrap -- a click cannot await; failures reach the console sink.
    void (async () => {
      try {
        await operation();
      } catch (error) {
        console.error('[RevisionBranches] branch operation failed', error);
      } finally {
        setIsBusy(false);
      }
    })();
  };
  return (
    <RevisionBranches
      branches={branches}
      {...(activeBranch === undefined ? {} : { activeBranch })}
      isBusy={isBusy}
      {...(merge === undefined ? {} : { mergeResult: merge })}
      diff={(branch) =>
        activeHead === undefined ? [] : authority.diffRevisions({ from: activeHead, to: branch.headRevisionId })
      }
      onSwitch={(branch) => {
        run(async () => authority.checkout(branch.headRevisionId));
      }}
      onMerge={(branch) => {
        if (activeBranch === undefined) {
          return;
        }
        run(async () => {
          const result = await authority.mergeBranch({
            source: branch.name,
            target: activeBranch,
            actorId: 'user',
          });
          setMerge({ source: branch.name, result });
        });
      }}
      onDiscard={(branch) => {
        /* The ref goes; every revision it reached stays in the object store and
         * stays reachable by id, so the evidence survives the name. */
        run(async () => authority.deleteBranch(branch.name));
      }}
    />
  );
}

const noBranches = (): readonly RevisionBranchSummary[] => emptyBranches;
const noHeadBranch = (): string | undefined => undefined;
const emptyBranches: readonly RevisionBranchSummary[] = [];
const noBranchSubscription = (): (() => void) => () => undefined;

function RevisionGraphMetadata({
  node,
  isBranchHead,
  onEditSummary,
}: {
  readonly node: RevisionGraphNode;
  readonly isBranchHead: boolean;
  readonly onEditSummary: (turnId: string, summary: string) => void;
}): React.JSX.Element {
  const displayedSummary = node.summary.edited ?? node.summary.generated;
  const [summary, setSummary] = useState(displayedSummary);
  useEffect(() => {
    queueMicrotask(() => {
      setSummary(displayedSummary);
    });
  }, [displayedSummary]);

  return (
    <div className='border-b border-border/60 px-3 py-2'>
      <div className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
        <GitBranch aria-hidden='true' className='size-3' />
        <span className='font-medium text-foreground'>{node.branch}</span>
        {isBranchHead ? <span className='rounded bg-primary/10 px-1.5 py-0.5 text-primary'>Branch head</span> : null}
        {node.identitySource === 'authoritative' ? (
          <span className='rounded bg-primary/10 px-1.5 py-0.5 text-primary'>Finalized</span>
        ) : null}
        {node.forkPointTurnId === undefined ? null : <span>forked from {node.forkPointTurnId}</span>}
        {node.conflict === undefined ? null : (
          <span role='status' className='rounded bg-destructive/10 px-1.5 py-0.5 text-destructive'>
            {node.conflict.type === 'stale-head' ? 'Stale head conflict' : `${node.conflict.kind} conflict`}
          </span>
        )}
        {node.publication === undefined ? null : (
          <span className='rounded bg-muted px-1.5 py-0.5'>
            {node.publication.status === 'updated' ? 'Head published' : 'Head publication rejected'}
          </span>
        )}
        {node.nativeGit?.status === 'stored' ? (
          <span className='rounded bg-muted px-1.5 py-0.5'>Native Git stored</span>
        ) : null}
      </div>
      <p className='mt-1 text-sm text-foreground'>{displayedSummary}</p>
      <details className='mt-1.5 text-xs text-muted-foreground'>
        <summary className='cursor-pointer select-none'>Inspect revision metadata</summary>
        <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 break-all'>
          <dt>Revision</dt>
          <dd>
            {/* A 40-hex commit id is unreadable in a 240px pane; twelve is what
                every engine's own porcelain shows, and the full id is one hover
                (or one copy) away. */}
            <code title={node.id}>{node.id.slice(0, 12)}</code>
          </dd>
          <dt>Tree</dt>
          <dd>
            <code title={node.treeId}>{node.treeId.slice(0, 12)}</code>
          </dd>
          <dt>Identity</dt>
          <dd>{node.identitySource === 'authoritative' ? 'Workspace finalizer' : 'Transcript fallback'}</dd>
          <dt>Base revision</dt>
          <dd>
            {node.baseRevisionId === undefined ? (
              'Not recorded'
            ) : (
              <code title={node.baseRevisionId}>{node.baseRevisionId.slice(0, 12)}</code>
            )}
          </dd>
          <dt>Chat</dt>
          <dd>
            {node.chatName} · <code>{node.chatId}</code>
          </dd>
          <dt>Parents</dt>
          <dd>
            {node.parentTurnIds.length === 0
              ? 'Root'
              : node.parentTurnIds
                  .map((turnId, index) => `${turnId} → ${node.parents[index] ?? 'unresolved'}`)
                  .join(', ')}{' '}
            ({node.parentSource})
          </dd>
          <dt>Changed paths</dt>
          <dd>{node.diff.changedPaths.length === 0 ? 'None' : node.diff.changedPaths.join(', ')}</dd>
          <dt>Provenance</dt>
          <dd>
            {node.provenance.source} · <code>{node.provenance.actorId}</code>
          </dd>
          <dt>Run</dt>
          <dd>{node.provenance.runId ?? 'None'}</dd>
          <dt>Workspace</dt>
          <dd>{node.workspaceId ?? 'Not recorded'}</dd>
          <dt>Jobs</dt>
          <dd>{node.jobIds.length === 0 ? 'None' : node.jobIds.join(', ')}</dd>
          <dt>Publication</dt>
          <dd>
            {node.publication === undefined
              ? 'Pending finalization'
              : node.publication.status === 'updated'
                ? `${node.publication.expectedHeadRevisionId} → ${node.publication.headRevisionId}`
                : `${node.publication.expectedHeadRevisionId} rejected; actual ${node.publication.actualHeadRevisionId ?? 'missing'}`}
          </dd>
          <dt>Native Git</dt>
          <dd>
            {node.nativeGit === undefined || node.nativeGit.status === 'not-configured'
              ? 'Not configured'
              : node.nativeGit.status === 'stored'
                ? `${node.nativeGit.objectFormat} ${node.nativeGit.commitId}`
                : `Failed · ${node.nativeGit.errorCode}`}
          </dd>
        </dl>
        <form
          className='mt-2 flex gap-1.5'
          onSubmit={(event) => {
            event.preventDefault();
            onEditSummary(node.turnId, summary);
          }}
        >
          <label className='sr-only' htmlFor={`revision-summary-${node.id}`}>
            Edit revision summary
          </label>
          <Input
            id={`revision-summary-${node.id}`}
            value={summary}
            onChange={(event) => {
              setSummary(event.target.value);
            }}
            aria-label={`Summary for Revision ${node.revision.n}`}
            className='h-7 text-xs'
          />
          <Button type='submit' size='xs' variant='outline'>
            Save summary
          </Button>
        </form>
      </details>
    </div>
  );
}
