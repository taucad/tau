import { useState } from 'react';
import { AlertTriangle, Check, FileText, GitBranch, GitCompare, EllipsisVertical, Pencil, Plus } from 'lucide-react';
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
import { DiffViewer } from '#components/code/diff-viewer.js';
import { RevisionConflictEditor } from '#routes/w.$workspace.$project/revision-conflict-editor.js';
import { InlineTextEditor } from '#components/inline-text-editor.js';
import type { RevisionBranchFacet, RevisionConflictFacet } from '@taucad/revisions';

/**
 * The one *New branch* control, wherever it is offered.
 *
 * It is shared rather than duplicated because it has two homes by design: the
 * Branches region (once a project has two lines) and the composer picker (which
 * exists at one, and is therefore the only way a fresh project ever gets a
 * second — R1).
 *
 * @param props - Whether a verb is in flight, and where the name goes.
 * @returns The toggle, and the form once it is open.
 */
export function NewBranchForm({
  isBusy,
  onCreate,
  className,
}: {
  readonly isBusy: boolean;
  readonly onCreate: (name: string) => void;
  readonly className?: string;
}): React.JSX.Element {
  const [draft, setDraft] = useState<string>();

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button
        size='xs'
        variant='ghost'
        aria-expanded={draft !== undefined}
        className='gap-1 self-start text-muted-foreground'
        onClick={() => {
          setDraft((current) => (current === undefined ? '' : undefined));
        }}
      >
        <Plus aria-hidden className='size-3' />
        New branch
      </Button>
      {draft === undefined ? null : (
        <InlineTextEditor
          key='new-branch'
          value=''
          placeholder='enclosure-v2'
          ariaLabel='Name for the new branch'
          saveLabel='Create branch'
          isDisabled={isBusy}
          shouldStartEditing
          shouldSubmitOnBlur={false}
          className='h-7'
          onSave={(name) => {
            onCreate(name);
            setDraft(undefined);
          }}
          onEditingChange={(editing) => {
            if (!editing) {
              setDraft(undefined);
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * The *Needs resolution* card, on the row of the branch that holds the conflict.
 *
 * A conflicted merge is a value in the graph, not a mode the workbench enters:
 * the branch being merged into and the files a person has open stay
 * byte-identical until every row here has a side (A22, AC14). The card says
 * that in one sentence, because a person's first question about a conflict is
 * what it has already done to their work.
 *
 * Choosing is always two buttons; *Open* is offered only for a file whose
 * conflict can be written as text. A parametric or binary file has no markers
 * to read, so choose-one is the whole verb it has.
 *
 * @param props - The facet, the branch being merged into, and the four verbs.
 * @returns The card body: one row per conflicted file, then the footer.
 */
function ConflictCard({
  conflict,
  into,
  onKeepSide,
  onOpenConflict,
  onAskChat,
  onFinishResolution,
  onResolveInEditor,
  conflictTexts,
}: {
  readonly conflict: RevisionConflictFacet;
  readonly into: string | undefined;
  readonly onKeepSide: (revisionId: string, path: string, side: 'mine' | 'theirs') => void;
  readonly onOpenConflict: (revisionId: string, path: string) => void;
  readonly onAskChat: (revisionId: string) => void;
  readonly onFinishResolution: (revisionId: string) => void;
  readonly conflictTexts: Readonly<Record<string, ConflictMaterialization>>;
  readonly onResolveInEditor: (revisionId: string, path: string, content: string) => void;
}): React.JSX.Element {
  /* The side merged into, named the way the markers name it — so the sentence,
     the button and the marker a person may open all say one word (I12). */
  const target = into ?? conflict.labels?.ours ?? 'the other branch';
  const count = conflict.paths.length;
  const [modes, setModes] = useState<Readonly<Record<string, 'compare' | 'edit'>>>({});

  return (
    <div className='flex flex-col gap-2 pl-5'>
      <p className='text-xs text-muted-foreground'>
        {`Merging into ${target} changed the same lines in ${String(count)} file${count === 1 ? '' : 's'}. ${target} is untouched until you choose.`}
      </p>
      <ul aria-label={`Files to resolve in ${conflict.branch ?? target}`} className='flex list-none flex-col gap-1'>
        {conflict.paths.map(({ path, openable, side }) => {
          const materialized = conflictTexts[`${conflict.revisionId}\u0000${path}`];
          return (
            <li key={path} className='flex flex-col gap-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <FileText aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
                <span className='min-w-0 flex-1 basis-40 truncate font-mono text-xs'>{path}</span>
                <Button
                  size='xs'
                  variant={side === 'mine' ? 'secondary' : 'ghost'}
                  aria-pressed={side === 'mine'}
                  aria-label={`Keep ${conflict.labels?.ours ?? 'mine'} in ${path}`}
                  disabled={conflict.busy}
                  onClick={() => {
                    onKeepSide(conflict.revisionId, path, 'mine');
                  }}
                >
                  {`Keep ${conflict.labels?.ours ?? 'mine'}`}
                </Button>
                <Button
                  size='xs'
                  variant={side === 'theirs' ? 'secondary' : 'ghost'}
                  aria-pressed={side === 'theirs'}
                  aria-label={`Keep ${conflict.labels?.theirs ?? 'theirs'} in ${path}`}
                  disabled={conflict.busy}
                  onClick={() => {
                    onKeepSide(conflict.revisionId, path, 'theirs');
                  }}
                >
                  {`Keep ${conflict.labels?.theirs ?? 'theirs'}`}
                </Button>
                {/* Both read the same materialization, so both are offered only
                  where there is text to read: a parametric or binary conflict is
                  choose-one, which is the canvas's own rule (A22). */}
                {openable ? (
                  <Button
                    size='xs'
                    variant='ghost'
                    aria-label={`Compare ${path}`}
                    aria-pressed={modes[path] === 'compare'}
                    onClick={() => {
                      setModes((current) => ({
                        ...current,
                        [path]: 'compare',
                      }));
                      onOpenConflict(conflict.revisionId, path);
                    }}
                  >
                    <GitCompare aria-hidden className='size-3' />
                    Compare
                  </Button>
                ) : null}
                {openable ? (
                  <Button
                    size='xs'
                    variant='ghost'
                    aria-label={`Edit ${path} manually`}
                    aria-pressed={modes[path] === 'edit'}
                    disabled={conflict.busy}
                    onClick={() => {
                      setModes((current) => ({ ...current, [path]: 'edit' }));
                      onOpenConflict(conflict.revisionId, path);
                    }}
                  >
                    <Pencil aria-hidden className='size-3' />
                    Edit manually
                  </Button>
                ) : null}
              </div>
              {/* *Open* is the editable mode: the markers in a buffer with no file
                behind them, because a conflicted revision's tree holds no marker
                byte and never will (A22, P43). */}
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
              {/* A27/D19's third *Compare* surface. The markers say what the two
                sides are; this says it the way the History rows already do, and
                it is the same component (review R9). */}
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
                  <span>{`${materialized.failure} Your choices are unchanged.`}</span>
                  <Button
                    size='xs'
                    variant='outline'
                    onClick={() => {
                      onOpenConflict(conflict.revisionId, path);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {modes[path] === 'compare' && materialized?.text !== undefined ? (
                <DiffViewer
                  originalContent={materialized.ours}
                  modifiedContent={materialized.theirs}
                  language={path}
                  className='rounded-md border'
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {conflict.ready ? null : (
        <p className='text-xs text-muted-foreground'>
          {`${String(conflict.paths.filter((path) => path.side === undefined).length)} file${conflict.paths.filter((path) => path.side === undefined).length === 1 ? '' : 's'} still need a choice before the merge can finish.`}
        </p>
      )}
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Button
          size='xs'
          variant='ghost'
          className='text-muted-foreground'
          disabled={conflict.busy}
          onClick={() => {
            onAskChat(conflict.revisionId);
          }}
        >
          Ask chat to resolve
        </Button>
        <Button
          size='xs'
          disabled={conflict.busy || !conflict.ready}
          onClick={() => {
            onFinishResolution(conflict.revisionId);
          }}
        >
          {`Merge into ${target}`}
        </Button>
      </div>
    </div>
  );
}

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
   * rather than inferring one from a 10 s timer that made every slow
   * materialization look like a failure and every failure take ten seconds.
   */
  | Readonly<{ failure: string; text?: undefined; ours?: undefined; theirs?: undefined }>;

export type RevisionBranchesProps = {
  /** Every branch the project has, from the `RevisionStatus` projection. */
  readonly branches: readonly RevisionBranchFacet[];
  /** The branch the workbench is on; its row is marked and has no verbs. */
  readonly currentBranch: string | undefined;
  /**
   * The live checkout's id, from the same projection (C40).
   *
   * A branch on any other checkout is *Linked*, whatever the host puts its
   * files behind — which is what the old `/checkouts/` prefix test was trying
   * to say and could only say in a browser.
   */
  readonly liveCheckoutId: string | undefined;
  /** Chat names by id, for the chips that say who is working where. */
  readonly chatNames: Readonly<Record<string, string>>;
  /** Durable chat placement by chat id. */
  readonly chatCheckoutIds: Readonly<Record<string, string | undefined>>;
  /** Graph-derived context by branch name. */
  readonly branchFacts: ReadonlyMap<
    string,
    Readonly<{
      revisionNumber: number | undefined;
      ahead: number;
      behind: number;
    }>
  >;
  /**
   * Every branch whose head is a conflicted revision (A22, AC14). The branch's
   * own row becomes its *Needs resolution* card; a branch with no entry here
   * renders exactly as it did before.
   */
  readonly conflicts: readonly RevisionConflictFacet[];
  /** A branch verb is in flight — every row's verbs wait for it. */
  readonly isBusy: boolean;
  readonly onSwitch: (branch: string) => void;
  readonly onMerge: (branch: string) => void;
  readonly onDiscard: (branch: string, checkoutId: string | undefined) => void;
  readonly onCreate: (name: string) => void;
  readonly onRename: (branch: string, name: string) => void;
  /** One file, one side — the `keepMine`/`keepTheirs` verb of its `resolution` child. */
  readonly onKeepSide: (revisionId: string, path: string, side: 'mine' | 'theirs') => void;
  /** Hand one conflicted file to the editor, which materializes the markers. */
  readonly onOpenConflict: (revisionId: string, path: string) => void;
  /** Seed a turn with the conflict, for the files a person would rather not read. */
  readonly onAskChat: (revisionId: string) => void;
  /** Every file has a side: mint the resolved revision and move the branch on. */
  readonly onFinishResolution: (revisionId: string) => void;
  /** What the worker materialized, keyed `<revisionId>\u0000<path>`. */
  readonly conflictTexts: Readonly<Record<string, ConflictMaterialization>>;
  /** A file a person composed by hand in the conflict editor. */
  readonly onResolveInEditor: (revisionId: string, path: string, content: string) => void;
  readonly className?: string;
};

/**
 * *Branches* — the second region of the Revisions pane (S26, A29).
 *
 * Shown only when a second branch exists: a project with one line has nothing
 * to choose between, and the region would be a heading over a single row
 * saying what the region above it already says. *New branch* therefore lives
 * here *and* in the composer picker (`NewBranchForm`), which is the control a
 * project with one line still has — a region that appears at two branches can
 * never be where the second one is made (R1).
 *
 * Presentational on purpose: rows and verbs come from the projection and the
 * commands, so a suite can script every state without a worker (the pattern
 * `revision-sync-region.tsx` set).
 *
 * *Merge into `<current>`* is here now that `branch.merge` computes a merge
 * base and can answer with a conflicted revision (W10). When it does, that
 * branch's row becomes the *Needs resolution* card: the conflict is a value on
 * *its* line, and the branch being merged into is untouched until every file
 * has a side (A22, AC14) — which is why the card sits on the source row and
 * says so, rather than interrupting the pane with a modal.
 *
 * @param props - The rows, the selection, and the three verbs.
 * @returns The Branches region.
 */
export function RevisionBranches({
  branches,
  currentBranch,
  liveCheckoutId,
  chatNames,
  chatCheckoutIds,
  branchFacts,
  conflicts,
  isBusy,
  onSwitch,
  onMerge,
  onDiscard,
  onCreate,
  onRename,
  onKeepSide,
  onOpenConflict,
  onAskChat,
  onFinishResolution,
  onResolveInEditor,
  conflictTexts,
  className,
}: RevisionBranchesProps): React.JSX.Element {
  const [renaming, setRenaming] = useState<string>();

  return (
    <section aria-labelledby='revision-branches-heading' className={cn('flex flex-col gap-2', className)}>
      <div className='flex items-center justify-between gap-2'>
        <h3 id='revision-branches-heading' className='text-xs font-medium text-muted-foreground'>
          Branches
        </h3>
        <NewBranchForm isBusy={isBusy} onCreate={onCreate} className='items-end' />
      </div>

      <ul aria-label='Branches' className='flex list-none flex-col'>
        {branches.map((branch) => {
          const isCurrent = branch.name === currentBranch;
          const conflict = conflicts.find((entry) => entry.branch === branch.name);
          const fact = branchFacts.get(branch.name);
          const placedChats = Object.entries(chatCheckoutIds).filter(
            ([, checkoutId]) => checkoutId === branch.checkoutId,
          );
          return (
            <li
              key={branch.name}
              /* The word "Current" is said once in the pane, by the row of the
                 revision it names; here the branch the workbench is on is
                 marked, not labelled again. */
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'group/branch flex flex-col gap-2 rounded-md px-1 py-1.5',
                conflict === undefined ? 'hover:bg-muted/50' : 'border-warning/40 bg-warning/10 border px-2 py-2',
                isCurrent && conflict === undefined ? 'bg-muted/40' : undefined,
              )}
            >
              <div className='flex flex-wrap items-center gap-2'>
                <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
                <InlineTextEditor
                  key={`${branch.name}:${renaming === branch.name ? 'editing' : 'idle'}`}
                  value={branch.name}
                  ariaLabel={`New name for ${branch.name}`}
                  isDisabled={isBusy}
                  shouldStartEditing={renaming === branch.name}
                  shouldSubmitOnBlur={false}
                  variant='ghost'
                  className='h-7 max-w-full min-w-24 flex-1'
                  onSave={(name) => {
                    onRename(branch.name, name);
                    setRenaming(undefined);
                  }}
                  onEditingChange={(editing) => {
                    if (!editing) {
                      setRenaming(undefined);
                    }
                  }}
                  renderDisplay={(name) => <span className='truncate text-sm font-medium'>{name}</span>}
                />
                {fact?.revisionNumber === undefined ? null : (
                  <span className='shrink-0 text-xs text-muted-foreground'>Rev {fact.revisionNumber}</span>
                )}
                {/* Checkout identity, not a path prefix (I2, C40): policy Rule 3
                    puts linked checkouts at `/checkouts/<id>` in a browser
                    authority and inside the host data directory on disk, so the
                    prefix test never fired on desktop or `tau serve`. */}
                {branch.checkoutId !== undefined && branch.checkoutId !== liveCheckoutId ? (
                  <Badge variant='outline' className='shrink-0 font-normal'>
                    Linked
                  </Badge>
                ) : branch.checkoutId === undefined ? (
                  <Badge variant='outline' className='shrink-0 font-normal'>
                    Remote only
                  </Badge>
                ) : null}
                {fact !== undefined && (fact.ahead > 0 || fact.behind > 0) ? (
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {fact.ahead > 0 ? `${fact.ahead} ahead` : ''}
                    {fact.ahead > 0 && fact.behind > 0 ? ' · ' : ''}
                    {fact.behind > 0 ? `${fact.behind} behind` : ''}
                  </span>
                ) : null}
                {placedChats.map(([chatId]) => (
                  <Badge key={chatId} variant='secondary' className='max-w-32 shrink-0 truncate font-normal'>
                    {chatNames[chatId] ?? 'Chat'}
                  </Badge>
                ))}
                {conflict === undefined ? null : (
                  <Badge variant='outline' className='shrink-0 gap-1 border-warning/40 bg-warning/10'>
                    <AlertTriangle aria-hidden className='text-warning' />
                    Needs resolution
                  </Badge>
                )}
                <span className='ml-auto flex shrink-0 items-center gap-1'>
                  {isCurrent ? <Check aria-hidden className='size-3.5 shrink-0 text-primary' /> : null}
                  {!isCurrent && conflict === undefined ? (
                    <Button
                      size='xs'
                      variant='ghost'
                      disabled={isBusy}
                      aria-label={`Switch to ${branch.name}`}
                      onClick={() => {
                        onSwitch(branch.name);
                      }}
                    >
                      Switch
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size='icon-xs'
                        variant='ghost'
                        aria-label={`Actions for ${branch.name}`}
                        disabled={isBusy}
                      >
                        <EllipsisVertical aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      {currentBranch === undefined || isCurrent ? null : (
                        <DropdownMenuItem
                          onSelect={() => {
                            onMerge(branch.name);
                          }}
                        >
                          {`Merge ${branch.name} into ${currentBranch}`}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenaming(branch.name);
                        }}
                      >
                        {`Rename ${branch.name}`}
                      </DropdownMenuItem>
                      {isCurrent ? null : (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant='destructive'
                            onSelect={() => {
                              onDiscard(branch.name, branch.checkoutId);
                            }}
                          >
                            {`Discard branch changes from ${branch.name}`}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
              {conflict === undefined ? null : (
                <ConflictCard
                  conflict={conflict}
                  into={currentBranch}
                  onKeepSide={onKeepSide}
                  onOpenConflict={onOpenConflict}
                  onAskChat={onAskChat}
                  onFinishResolution={onFinishResolution}
                  onResolveInEditor={onResolveInEditor}
                  conflictTexts={conflictTexts}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
