import { useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Circle,
  CircleCheck,
  EllipsisVertical,
  FileText,
  GitCompare,
  GitMerge,
  MessageSquare,
  Pencil,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import type { RevisionBranchFacet, RevisionConflictFacet } from '@taucad/revisions';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { ActionButton } from '@taucad/ui/components/actions';
import { NamePopover } from '#components/revisions/name-popover.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectRole, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { resolveHighlightLanguageForPath } from '@taucad/ui-core/lib/code-language-resolution';
import { describeRevisionFailure } from '@taucad/ui-core/lib/revision-failure-copy';
import { RevisionConflictEditor } from '#routes/w.$workspace.$project/revision-conflict-editor.js';
import { requestRefRemoval } from '#routes/w.$workspace.$project/revision-ref-removal.js';

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
 * @param props - The facet and the verbs.
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
  /* The count is a fact only once the conflict has been read (`labels`): before
     that it is unknown, never zero, and a read that failed says so. A read
     conflict with no files left — a later merge already reconciled them — still
     needs its merge, which is what hides the line (D14). */
  const phase =
    conflict.labels === undefined ? (conflict.busy ? 'checking' : 'unreadable') : count === 0 ? 'settled' : 'open';

  return (
    <div className='flex flex-col gap-2'>
      {phase === 'checking' ? (
        <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
          Checking files…
        </p>
      ) : (
        <p className='text-xs text-muted-foreground'>
          {phase === 'open'
            ? `${cause} ${target} is untouched until you choose.`
            : phase === 'settled'
              ? `Nothing still differs on ${target}. Merge to finish this decision.`
              : 'This conflict could not be read. Reload the page to read it again.'}
        </p>
      )}
      {phase === 'open' ? (
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
                    language={resolveHighlightLanguageForPath(path).language}
                    className='rounded-md border'
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {conflict.ready || open === 0 ? null : (
        <p className='text-xs text-muted-foreground'>
          {`${files(open)} still need${open === 1 ? 's' : ''} a choice before the merge can finish.`}
        </p>
      )}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {/* With no file left there is nothing for chat to resolve: Merge is the one action. */}
        {phase === 'open' || phase === 'checking' ? (
          <ActionButton
            verb='Ask chat to resolve'
            icon={MessageSquare}
            disabled={conflict.busy}
            onClick={() => {
              onAskChat(conflict.revisionId);
            }}
          />
        ) : null}
        <ConflictDismissal conflict={conflict} />
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
 * Another device's conflict, dismissed from Tau Cloud through D24's audited
 * verb (D14), on the conflict card (copy table: *Dismiss this conflict…*, owner
 * only). A conflict is never listed as a branch, so this is its one control. The
 * device that recorded it keeps it and offers it again when it next syncs; the
 * raw line is behind *Details*. It asks first: Tau Cloud's copy cannot be put
 * back from here (I11).
 *
 * @param props - The conflict.
 * @returns The button and its confirmation, or nothing for anyone but the owner of a connected project.
 */
function ConflictDismissal({ conflict }: { readonly conflict: RevisionConflictFacet }): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const role = useProjectRole();
  const { syncNow } = useRevisionCommands();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [removal, setRemoval] = useState<Readonly<{ isBusy: boolean; error: string | undefined }>>();
  const line = conflict.branch;
  /* Only another device's line, and only the owner may remove what Tau Cloud holds (RV-W6 F5). */
  if (
    !conflict.foreign ||
    line === undefined ||
    line === conflict.into ||
    status?.remote.kind !== 'tau' ||
    status.remote.phase !== 'connected' ||
    role !== 'owner'
  ) {
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
      <Button
        ref={buttonRef}
        size='xs'
        variant='ghost'
        disabled={conflict.busy}
        className='text-muted-foreground'
        onClick={() => {
          setRemoval({ isBusy: false, error: undefined });
        }}
      >
        <Trash2 aria-hidden className='size-3' />
        Dismiss this conflict…
      </Button>
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
            buttonRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{`Dismiss another device’s conflict on ${conflict.into}?`}</AlertDialogTitle>
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
              Dismiss
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Why *Rename* would be refused for a branch, as the rename effect decides it
 * (D91): a linked checkout's branch first, then a branch the remote holds under
 * its name. The sentence is the refusal's own, so the menu and the toast never
 * disagree. A branch whose live checkout is not known yet is not called linked.
 *
 * @param branch - The branch.
 * @param liveCheckoutId - The live checkout's id, from the same projection.
 * @returns The refusal's sentence, or `undefined` when the rename can go through.
 */
export const renameRefusalOf = (
  branch: RevisionBranchFacet,
  liveCheckoutId: string | undefined,
): string | undefined => {
  const isLinked =
    branch.checkoutId !== undefined && liveCheckoutId !== undefined && branch.checkoutId !== liveCheckoutId;
  const code = isLinked ? 'BRANCH_RENAME_LINKED' : branch.onRemote === true ? 'BRANCH_RENAME_PUSHED' : undefined;
  return code === undefined ? undefined : describeRevisionFailure('branch', code).description;
};

export type BranchMenuProps = {
  /** The branch whose chip this menu is on. */
  readonly branch: string;
  /** The branch the files are on. */
  readonly currentBranch: string | undefined;
  /** The project's first branch, which *Update from* names. */
  readonly trunk: string;
  /** How many entries the trunk has that the current branch lacks; *Update from* shows while it is more than none. */
  readonly behind: number;
  /** A branch verb is in flight: the menu waits for it (review R4). */
  readonly isBusy: boolean;
  /** Why *Rename…* would be refused (D91); `undefined` offers it. */
  readonly renameRefusal: string | undefined;
  readonly onSwitch: (branch: string) => void;
  /** Merges a branch into the branch the files are on. */
  readonly onMerge: (branch: string) => void;
  readonly onRename: (branch: string, name: string) => void;
  /** Closes the branch on this device; its history stays. */
  readonly onClose: (branch: string) => void;
  /** Present only when running the chat in focus on this branch would move it (C3). */
  readonly onRunChatHere: (() => void) | undefined;
};

/**
 * A branch's own menu, the ⋮ on its name chip in History (D3, canvas
 * `branch-menu`): Switch to x, Merge into the branch you are on, Update from
 * main while the branch you are on is behind it, Run this chat here, Rename…
 * and Close branch. Every verb acts at once (I11); its toast says what landed.
 * Rename names the branch in the one naming form under this menu's button; a
 * rename that would be refused stays listed, unavailable, with the reason under it.
 *
 * Presentational: the verbs come from the commands, so a suite can script every
 * state without a worker.
 *
 * @param props - The branch, where the files are, and the verbs.
 * @returns The menu.
 */
export function BranchMenu({
  branch,
  currentBranch,
  trunk,
  behind,
  isBusy,
  renameRefusal,
  onSwitch,
  onMerge,
  onRename,
  onClose,
  onRunChatHere,
}: BranchMenuProps): React.JSX.Element {
  const moreRef = useRef<HTMLButtonElement>(null);
  const opensRename = useRef(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const isCurrent = branch === currentBranch;
  return (
    <DropdownMenu>
      <NamePopover
        anchor={
          <DropdownMenuTrigger asChild>
            <Button ref={moreRef} size='icon-xs' variant='ghost' disabled={isBusy} aria-label={`More for ${branch}`}>
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
        note='Its history and the chats on it keep working.'
        saveLabel='Rename branch'
        onOpenChange={setIsRenaming}
        onSave={(name) => {
          if (name !== branch) {
            onRename(branch, name);
          }
        }}
      />
      <DropdownMenuContent
        align='end'
        className='max-w-[calc(100vw-2rem)] min-w-52'
        onCloseAutoFocus={(event) => {
          if (!opensRename.current) {
            return;
          }
          opensRename.current = false;
          event.preventDefault();
          setIsRenaming(true);
        }}
      >
        <DropdownMenuLabel className='truncate'>{branch}</DropdownMenuLabel>
        {isCurrent || currentBranch === undefined ? null : (
          <>
            <DropdownMenuItem
              onSelect={() => {
                onSwitch(branch);
              }}
            >
              <ArrowLeftRight aria-hidden />
              {`Switch to ${branch}`}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onMerge(branch);
              }}
            >
              <GitMerge aria-hidden />
              {`Merge into ${currentBranch}`}
            </DropdownMenuItem>
          </>
        )}
        {isCurrent && branch !== trunk && behind > 0 ? (
          <DropdownMenuItem
            onSelect={() => {
              onMerge(trunk);
            }}
          >
            <ArrowDownToLine aria-hidden />
            <span className='flex-1'>{`Update from ${trunk}`}</span>
            <span className='text-xs text-muted-foreground tabular-nums'>{`${String(behind)} behind`}</span>
          </DropdownMenuItem>
        ) : null}
        {onRunChatHere === undefined ? null : (
          <DropdownMenuItem onSelect={onRunChatHere}>
            <MessageSquare aria-hidden />
            Run this chat here
          </DropdownMenuItem>
        )}
        {renameRefusal === undefined ? (
          <DropdownMenuItem
            onSelect={() => {
              opensRename.current = true;
            }}
          >
            <Pencil aria-hidden />
            Rename…
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className='h-auto items-start'>
            <Pencil aria-hidden className='mt-0.5' />
            <span className='flex flex-col'>
              Rename…
              <span className='max-w-64 text-xs text-muted-foreground'>{renameRefusal}</span>
            </span>
          </DropdownMenuItem>
        )}
        {isCurrent ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onClose(branch);
              }}
            >
              <X aria-hidden />
              Close branch
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
