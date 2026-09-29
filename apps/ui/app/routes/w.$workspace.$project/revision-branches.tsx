import { useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Circle,
  CircleCheck,
  EllipsisVertical,
  FileText,
  GitBranch,
  GitCompare,
  GitMerge,
  MessageSquare,
  Pencil,
  RotateCw,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import type { RevisionBranchFacet, RevisionConflictFacet } from '@taucad/revisions';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { ActionButton } from '#components/revisions/revision-actions.js';
import { NamePopover } from '#components/revisions/name-popover.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectRole, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { resolveHighlightLanguageForPath } from '#lib/code-language-resolution.js';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import { RevisionConflictEditor } from '#routes/w.$workspace.$project/revision-conflict-editor.js';
import { requestRefRemoval } from '#routes/w.$workspace.$project/revision-ref-removal.js';
import { needsDecision } from '#routes/w.$workspace.$project/revision-vocabulary.js';

/**
 * One conflicted file as the worker materialized it (S33, W10).
 *
 * The marker text is what the editable mode edits; the two sides are what
 * *Compare* shows. Both are rendered from the three recorded terms and reach
 * the page as a fact — no checkout and no machine context holds them (A22, I29).
 *
 * @public
 */
export type ConflictMaterialization =
  | Readonly<{ text: string; ours: string; theirs: string; failure?: undefined }>
  /**
   * The refusal, when the worker could not open that file (C44).
   *
   * A settled answer like the text is: the row renders it the moment it lands,
   * rather than inferring one from a timer.
   */
  | Readonly<{ failure: string; text?: undefined; ours?: undefined; theirs?: undefined }>;

const files = (count: number): string => `${String(count)} file${count === 1 ? '' : 's'}`;

export type ConflictDecisionProps = {
  readonly conflict: RevisionConflictFacet;
  /**
   * The line the checkout is on.
   *
   * ponytail: unread since D14 — the facet names the line the decision lands on
   * (`into`) on every device. Drop it with the pane's next edit.
   */
  readonly currentBranch: string | undefined;
  readonly onKeepSide: (revisionId: string, path: string, side: 'mine' | 'theirs') => void;
  readonly onOpenConflict: (revisionId: string, path: string) => void;
  readonly onAskChat: (revisionId: string) => void;
  readonly onFinishResolution: (revisionId: string) => void;
  readonly conflictTexts: Readonly<Record<string, ConflictMaterialization>>;
  readonly onResolveInEditor: (revisionId: string, path: string, content: string) => void;
};

/**
 * One conflict, in the *Choose a version* region (canvas rounds 5, 14–18).
 *
 * A conflicted merge is a value in the graph, not a mode the workbench enters:
 * the line being merged into stays byte-identical until every file has a side
 * (A22, AC14). The sentence says so and names that line (HQ2), because a
 * person's first question about a conflict is what it has already done to
 * their work. Each file's choices are one actions row: the two Keeps are one
 * choice (a radio's glyphs), then Compare and Edit manually where there is text.
 * The region states no status: the strip owns *Needs your decision*.
 *
 * @param props - The facet, the line the checkout is on, and the verbs.
 * @returns The decision.
 */
export function ConflictDecision({
  conflict,
  onKeepSide,
  onOpenConflict,
  onAskChat,
  onFinishResolution,
  onResolveInEditor,
  conflictTexts,
}: ConflictDecisionProps): React.JSX.Element {
  /* The line the decision lands on, the same on every device (HQ2, D14), so the
     sentence, the button and the strip all say one word (I12). */
  const target = conflict.into;
  const theirs = conflict.labels?.theirs ?? target;
  const count = conflict.paths.length;
  /* Who changed what, device-relative: *mine* is always this device's side (rule 8). */
  const cause = conflict.foreign
    ? `Another device and this one changed the same lines in ${files(count)} on ${target}.`
    : theirs === target
      ? `Your edit and the latest ${target} changed the same lines in ${files(count)}.`
      : theirs.endsWith(`/${target}`)
        ? `${theirs} and this device changed the same lines in ${files(count)} on ${target}.`
        : `Merging ${theirs} into ${target} changed the same lines in ${files(count)}.`;
  const open = conflict.paths.filter((path) => path.side === undefined).length;
  const [modes, setModes] = useState<Readonly<Record<string, 'compare' | 'edit' | undefined>>>({});

  return (
    <div className='flex flex-col gap-2'>
      <p className='text-xs text-muted-foreground'>{`${cause} ${target} is untouched until you choose.`}</p>
      <ul aria-label={`Files to resolve in ${theirs}`} className='flex list-none flex-col gap-2'>
        {conflict.paths.map(({ path, openable, side, keys }) => {
          const materialized = conflictTexts[`${conflict.revisionId}\u0000${path}`];
          const toggle = (mode: 'compare' | 'edit'): void => {
            const isOpen = modes[path] === mode;
            setModes((current) => ({ ...current, [path]: isOpen ? undefined : mode }));
            if (!isOpen) {
              onOpenConflict(conflict.revisionId, path);
            }
          };
          return (
            <li key={path} className='flex flex-col gap-1'>
              <span className='flex min-w-0 items-start gap-2'>
                <FileText aria-hidden className='mt-px size-3.5 shrink-0 text-muted-foreground' />
                <span className='min-w-0 text-xs break-all'>{path}</span>
              </span>
              {/* A parameter record is choose-one: the keys both sides set say what the choice decides. */}
              {keys === undefined || keys.length === 0 ? null : (
                <span className='text-xs text-muted-foreground sm:pl-5'>{`Both changed ${keys.join(', ')}`}</span>
              )}
              {/* The Keeps and the tools are pairs that wrap as pairs, so a narrow
                  card never shows Edit manually alone. */}
              <span className='flex flex-wrap items-center gap-2 sm:pl-5'>
                <span className='flex flex-wrap items-center gap-2'>
                  {(['mine', 'theirs'] as const).map((choice) => (
                    <ActionButton
                      key={choice}
                      verb={`Keep ${choice}`}
                      icon={side === choice ? CircleCheck : Circle}
                      variant={side === choice ? 'secondary' : 'outline'}
                      aria-pressed={side === choice}
                      aria-label={`Keep ${choice} in ${path}`}
                      disabled={conflict.busy}
                      onClick={() => {
                        onKeepSide(conflict.revisionId, path, choice);
                      }}
                    />
                  ))}
                </span>
                {/* Both tools read the same materialization, so both are offered
                    only where there is text: a parametric or binary conflict is
                    choose-one (A22). */}
                {openable ? (
                  <span className='flex flex-wrap items-center gap-2'>
                    <ActionButton
                      verb='Compare'
                      icon={GitCompare}
                      variant={modes[path] === 'compare' ? 'secondary' : 'outline'}
                      aria-label={`Compare ${path}`}
                      aria-pressed={modes[path] === 'compare'}
                      onClick={() => {
                        toggle('compare');
                      }}
                    />
                    <ActionButton
                      verb='Edit manually'
                      icon={Pencil}
                      variant={modes[path] === 'edit' ? 'secondary' : 'outline'}
                      aria-label={`Edit ${path} manually`}
                      aria-pressed={modes[path] === 'edit'}
                      disabled={conflict.busy}
                      onClick={() => {
                        toggle('edit');
                      }}
                    />
                  </span>
                ) : null}
              </span>
              {/* The editable mode: the markers in a buffer with no file behind
                  them, because a conflicted revision's tree holds no marker byte (A22, P43). */}
              {modes[path] === 'edit' && materialized?.text !== undefined ? (
                <RevisionConflictEditor
                  path={path}
                  text={materialized.text}
                  isBusy={conflict.busy}
                  onResolved={(content) => {
                    onResolveInEditor(conflict.revisionId, path, content);
                  }}
                />
              ) : null}
              {modes[path] !== undefined && materialized === undefined ? (
                <p
                  role='status'
                  aria-label={`Conflict view for ${path}`}
                  aria-busy='true'
                  className='px-2 py-1 text-xs text-muted-foreground'
                >
                  Loading {modes[path] === 'compare' ? 'comparison' : 'editor'} for {path}…
                </p>
              ) : null}
              {materialized?.failure === undefined ? null : (
                <div
                  role='alert'
                  aria-label={`Conflict view for ${path}`}
                  className='flex flex-wrap items-center gap-2 px-2 py-1 text-xs'
                >
                  <span className='min-w-0 flex-auto'>{`${materialized.failure} Your choices are unchanged.`}</span>
                  <ActionButton
                    verb='Retry'
                    icon={RotateCw}
                    onClick={() => {
                      onOpenConflict(conflict.revisionId, path);
                    }}
                  />
                </div>
              )}
              {modes[path] === 'compare' && materialized?.text !== undefined ? (
                <DiffViewer
                  originalContent={materialized.ours}
                  modifiedContent={materialized.theirs}
                  language={resolveHighlightLanguageForPath(path).shikiLanguage}
                  className='rounded-md border'
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {conflict.ready || open === 0 ? null : (
        <p className='text-xs text-muted-foreground'>
          {`${files(open)} still need${open === 1 ? 's' : ''} a choice before the merge can finish.`}
        </p>
      )}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <ActionButton
          verb='Ask chat to resolve'
          icon={MessageSquare}
          disabled={conflict.busy}
          onClick={() => {
            onAskChat(conflict.revisionId);
          }}
        />
        <ActionButton
          verb={`Merge into ${target}`}
          icon={GitMerge}
          variant='default'
          className='ml-auto'
          disabled={conflict.busy || !conflict.ready}
          onClick={() => {
            onFinishResolution(conflict.revisionId);
          }}
        />
      </div>
    </div>
  );
}

/**
 * A branch row's More, each verb with its glyph. Rename names the branch in the
 * one naming form under this menu's button, as New branch does (round 16).
 *
 * @param props - The branch, the line the checkout is on, and the verbs.
 * @returns The menu.
 */
function BranchMenu({
  branch,
  currentBranch,
  isCurrent,
  isBusy,
  onMerge,
  onRename,
  onPlace,
  onDiscard,
}: {
  readonly branch: string;
  readonly currentBranch: string | undefined;
  readonly isCurrent: boolean;
  readonly isBusy: boolean;
  readonly onMerge: () => void;
  readonly onRename: (name: string) => void;
  /** Present only when using this branch would move the chat in focus. */
  readonly onPlace: (() => void) | undefined;
  readonly onDiscard: () => void;
}): React.JSX.Element {
  const moreRef = useRef<HTMLButtonElement>(null);
  const opensRename = useRef(false);
  const [isRenaming, setIsRenaming] = useState(false);
  return (
    <DropdownMenu>
      <NamePopover
        anchor={
          <DropdownMenuTrigger asChild>
            <Button ref={moreRef} size='icon-xs' variant='ghost' disabled={isBusy} aria-label={`Actions for ${branch}`}>
              <EllipsisVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        }
        isOpen={isRenaming}
        returnFocus={moreRef}
        align='end'
        label={`New name for ${branch}`}
        placeholder={branch}
        initial={branch}
        note='Its revisions and the chats on it keep working.'
        saveLabel='Rename branch'
        onOpenChange={setIsRenaming}
        onSave={(name) => {
          if (name !== branch) {
            onRename(name);
          }
        }}
      />
      <DropdownMenuContent
        align='end'
        onCloseAutoFocus={(event) => {
          if (!opensRename.current) {
            return;
          }
          opensRename.current = false;
          event.preventDefault();
          setIsRenaming(true);
        }}
      >
        {currentBranch === undefined || isCurrent ? null : (
          <DropdownMenuItem onSelect={onMerge}>
            <GitMerge aria-hidden />
            {`Merge ${branch} into ${currentBranch}`}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => {
            opensRename.current = true;
          }}
        >
          <Pencil aria-hidden />
          {`Rename ${branch}…`}
        </DropdownMenuItem>
        {onPlace === undefined ? null : (
          <DropdownMenuItem onSelect={onPlace}>
            <MessageSquare aria-hidden />
            {`Use ${branch} in this chat`}
          </DropdownMenuItem>
        )}
        {isCurrent ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant='destructive' onSelect={onDiscard}>
              <Trash2 aria-hidden />
              {`Discard branch changes from ${branch}`}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The words a conflict line is shown by (W14): whose decision, about which
 * line — never the raw line name, which lives in *Details*.
 *
 * @param conflict - The conflict on the line.
 * @returns The row's name.
 */
const decisionName = (conflict: RevisionConflictFacet): string =>
  conflict.foreign ? `Another device’s decision on ${conflict.into}` : `Your decision on ${conflict.into}`;

/**
 * Another device's conflict line, removed from Tau Cloud through D24's audited
 * verb (D14): offered to the project's owner only, as the server allows it; the
 * confirmation names the decision and its files, and the raw line is in
 * *Details*. The device that recorded it keeps it and offers it again when it
 * next syncs; the decision itself is still made in *Choose a version*.
 *
 * @param props - The conflict on the line, and whether a branch verb is in flight.
 * @returns The line's More, and its confirmation.
 */
function ConflictLineRemoval({
  conflict,
  isBusy,
}: {
  readonly conflict: RevisionConflictFacet;
  readonly isBusy: boolean;
}): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const role = useProjectRole();
  const { syncNow } = useRevisionCommands();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [removal, setRemoval] = useState<Readonly<{ isBusy: boolean; error: string | undefined }>>();
  const line = conflict.branch ?? '';
  const name = decisionName(conflict);
  /* Only the owner may remove what the Hosted Remote holds; the verb the server would refuse is absent (RV-W6 F5). */
  if (status?.remote.kind !== 'tau' || status.remote.phase !== 'connected' || role !== 'owner') {
    return undefined;
  }
  const names = conflict.paths.map(({ path }) => path);
  const remove = async (): Promise<void> => {
    setRemoval({ isBusy: true, error: undefined });
    const answer = await requestRefRemoval(projectId, `refs/heads/${line}`);
    if (answer.kind === 'removed') {
      setRemoval(undefined);
      syncNow();
      return;
    }
    setRemoval({
      isBusy: false,
      error: describeRevisionFailure('removeConflictLine', answer.kind === 'refused' ? answer.code : undefined)
        .description,
    });
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={moreRef} size='icon-xs' variant='ghost' disabled={isBusy} aria-label={`Actions for ${name}`}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => {
              setRemoval({ isBusy: false, error: undefined });
            }}
          >
            <Trash2 aria-hidden />
            Remove this decision…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={removal !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            setRemoval(undefined);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            moreRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove another device’s decision on ${conflict.into}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`It is about ${names.length === 0 ? conflict.into : names.join(', ')}. ${conflict.into} is unchanged, and the device that made it keeps it and offers it again when it next syncs.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <details className='text-xs text-muted-foreground'>
            <summary className='select-none'>Details</summary>
            <p className='mt-1 font-mono break-all'>{`refs/heads/${line}`}</p>
          </details>
          {removal?.error === undefined ? null : (
            <p role='alert' className='text-sm'>
              {removal.error}
            </p>
          )}
          <AlertDialogFooter>
            <Button
              autoFocus
              variant='outline'
              onClick={() => {
                setRemoval(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={removal?.isBusy ?? false}
              onClick={() => {
                void remove();
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export type RevisionBranchesProps = {
  /** Every branch the project has, from the `RevisionStatus` projection. */
  readonly branches: readonly RevisionBranchFacet[];
  /** The branch the workbench is on; its row is marked and has no Switch. */
  readonly currentBranch: string | undefined;
  /**
   * The live checkout's id, from the same projection (C40). A branch on any
   * other checkout is *Linked*, whatever the host puts its files behind.
   */
  readonly liveCheckoutId: string | undefined;
  /** Chat names by id, for the chips that say who is working where. */
  readonly chatNames: Readonly<Record<string, string>>;
  /** Durable chat placement by chat id. */
  readonly chatCheckoutIds: Readonly<Record<string, string | undefined>>;
  /** The chat in focus, which *Use in this chat* places; absent when none is. */
  readonly activeChatId?: string;
  /** Put a chat's next turns on a branch's checkout — the only place a chat chooses its branch (C3). */
  readonly onPlaceChat?: (chatId: string, checkoutId: string) => void;
  /** Graph-derived context by branch name. */
  readonly branchFacts: ReadonlyMap<
    string,
    Readonly<{ revisionNumber: number | undefined; ahead: number; behind: number }>
  >;
  /** Every branch whose head is a conflicted revision: its row carries the amber mark. */
  readonly conflicts: readonly RevisionConflictFacet[];
  /** A branch verb is in flight — every row's verbs wait for it. */
  readonly isBusy: boolean;
  /** The person may change the project's shared state here (A1 item 6). */
  readonly isWritable: boolean;
  readonly onSwitch: (branch: string) => void;
  readonly onMerge: (branch: string) => void;
  readonly onDiscard: (branch: string, checkoutId: string | undefined) => void;
  readonly onRename: (branch: string, name: string) => void;
};

/**
 * The Branches list, shown once a second branch exists (S26, A29): each row the
 * name with its verbs pinned beside it, then its facts, which wrap (A1 item 13).
 * New branch lives on the strip; a conflict's decision lives in *Choose a
 * version*, so a conflicted row carries only the amber mark.
 *
 * Presentational on purpose: rows and verbs come from the projection and the
 * commands, so a suite can script every state without a worker.
 *
 * @param props - The rows, the selection, and the verbs.
 * @returns The list.
 */
export function RevisionBranches({
  branches,
  currentBranch,
  liveCheckoutId,
  chatNames,
  chatCheckoutIds,
  activeChatId,
  onPlaceChat,
  branchFacts,
  conflicts,
  isBusy,
  isWritable,
  onSwitch,
  onMerge,
  onDiscard,
  onRename,
}: RevisionBranchesProps): React.JSX.Element {
  return (
    <ul aria-label='Branches' className='flex list-none flex-col'>
      {branches.map((branch) => {
        const isCurrent = branch.name === currentBranch;
        const conflictOnLine = conflicts.find((entry) => entry.branch === branch.name);
        const isConflicted = conflictOnLine !== undefined;
        /* A conflict line is a decision in flight, not a place to work: no Switch, Rename or Merge (D14). */
        const isConflictLine = conflictOnLine !== undefined && conflictOnLine.branch !== conflictOnLine.into;
        const fact = branchFacts.get(branch.name);
        /* An unplaced chat has no checkout id; a remote-only branch has none either, and must not claim it. */
        const placedChats = Object.entries(chatCheckoutIds).filter(
          ([, checkoutId]) => checkoutId !== undefined && checkoutId === branch.checkoutId,
        );
        /* Offered only when it would change where the chat in focus works: an unplaced chat works in the live checkout. */
        const placement =
          activeChatId !== undefined &&
          onPlaceChat !== undefined &&
          branch.checkoutId !== undefined &&
          (chatCheckoutIds[activeChatId] ?? liveCheckoutId) !== branch.checkoutId
            ? { chatId: activeChatId, checkoutId: branch.checkoutId }
            : undefined;
        const counts = [
          fact !== undefined && fact.ahead > 0 ? `${String(fact.ahead)} ahead` : '',
          fact !== undefined && fact.behind > 0 ? `${String(fact.behind)} behind` : '',
        ].filter(Boolean);
        return (
          <li
            key={branch.name}
            aria-current={isCurrent ? 'true' : undefined}
            className={cn(
              'flex flex-col gap-1 border-b px-3 py-1.5 last:rounded-b-xl last:border-b-0',
              isCurrent && !isConflicted && 'bg-muted/40',
            )}
          >
            <span className='flex min-w-0 items-center gap-2'>
              {isConflicted ? (
                <GitMerge aria-label={needsDecision} className='size-3.5 shrink-0 text-warning' />
              ) : (
                <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
              )}
              <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                {isConflictLine ? decisionName(conflictOnLine) : branch.name}
              </span>
              <span className='flex shrink-0 items-center gap-1'>
                {isCurrent ? <Check aria-label='Current branch' className='size-3.5 shrink-0 text-primary' /> : null}
                {!isCurrent && !isConflicted ? (
                  <Button
                    size='xs'
                    variant='ghost'
                    disabled={isBusy}
                    aria-label={`Switch to ${branch.name}`}
                    className='gap-1 text-muted-foreground'
                    onClick={() => {
                      onSwitch(branch.name);
                    }}
                  >
                    <ArrowLeftRight aria-hidden className='size-3' />
                    Switch
                  </Button>
                ) : null}
                {isConflictLine ? (
                  isWritable && conflictOnLine.foreign ? (
                    <ConflictLineRemoval conflict={conflictOnLine} isBusy={isBusy} />
                  ) : null
                ) : isWritable ? (
                  <BranchMenu
                    branch={branch.name}
                    currentBranch={currentBranch}
                    isCurrent={isCurrent}
                    isBusy={isBusy}
                    onPlace={
                      placement === undefined
                        ? undefined
                        : () => {
                            onPlaceChat?.(placement.chatId, placement.checkoutId);
                          }
                    }
                    onMerge={() => {
                      onMerge(branch.name);
                    }}
                    onRename={(name) => {
                      onRename(branch.name, name);
                    }}
                    onDiscard={() => {
                      onDiscard(branch.name, branch.checkoutId);
                    }}
                  />
                ) : null}
              </span>
            </span>
            <span className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-5.5 text-xs text-muted-foreground'>
              {fact?.revisionNumber === undefined ? null : <span className='font-mono'>Rev {fact.revisionNumber}</span>}
              {counts.length === 0 ? null : <span className='tabular-nums'>{counts.join(', ')}</span>}
              {/* Checkout identity, not a path prefix (I2, C40). */}
              {branch.checkoutId === undefined ? (
                <Badge variant='outline' className='font-normal'>
                  Remote only
                </Badge>
              ) : branch.checkoutId === liveCheckoutId ? null : (
                <Badge variant='outline' className='font-normal'>
                  Linked
                </Badge>
              )}
              {placedChats.map(([chatId]) => (
                <Badge key={chatId} variant='secondary' className='max-w-40 min-w-0 font-normal'>
                  <span className='truncate'>{chatNames[chatId] ?? 'Chat'}</span>
                </Badge>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
