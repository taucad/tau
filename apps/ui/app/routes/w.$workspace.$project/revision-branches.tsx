import { useState } from 'react';
import { AlertTriangle, Check, FileText, GitBranch, GitCompare, Pencil, Plus } from 'lucide-react';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { cn } from '@taucad/ui/utils/cn';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { RevisionConflictEditor } from '#routes/w.$workspace.$project/revision-conflict-editor.js';
import type { RevisionBranchFacet, RevisionConflictFacet } from '@taucad/revisions/project-revisions-machine';

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
        <form
          className='flex items-center gap-2'
          onSubmit={(event) => {
            event.preventDefault();
            const name = draft.trim();
            if (name === '') {
              return;
            }
            onCreate(name);
            setDraft(undefined);
          }}
        >
          <Input
            autoFocus
            aria-label='Name for the new branch'
            placeholder='enclosure-v2'
            value={draft}
            className='h-7'
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setDraft(undefined);
              }
            }}
          />
          <Button size='sm' type='submit' disabled={isBusy || draft.trim() === ''}>
            Create
          </Button>
        </form>
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
  const [comparing, setComparing] = useState<string>();

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
              <div className='flex items-center gap-2'>
                <FileText aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
                <span className='truncate font-mono text-xs'>{path}</span>
                <span className='flex-1' />
                <Button
                  size='xs'
                  variant={side === 'mine' ? 'secondary' : 'ghost'}
                  aria-pressed={side === 'mine'}
                  aria-label={`Keep mine in ${path}`}
                  disabled={conflict.busy}
                  onClick={() => {
                    onKeepSide(conflict.revisionId, path, 'mine');
                  }}
                >
                  Keep mine
                </Button>
                <Button
                  size='xs'
                  variant={side === 'theirs' ? 'secondary' : 'ghost'}
                  aria-pressed={side === 'theirs'}
                  aria-label={`Keep theirs in ${path}`}
                  disabled={conflict.busy}
                  onClick={() => {
                    onKeepSide(conflict.revisionId, path, 'theirs');
                  }}
                >
                  Keep theirs
                </Button>
                {/* Both read the same materialization, so both are offered only
                  where there is text to read: a parametric or binary conflict is
                  choose-one, which is the canvas's own rule (A22). */}
                {openable ? (
                  <Button
                    size='xs'
                    variant='ghost'
                    aria-label={`Compare ${path}`}
                    aria-pressed={comparing === path}
                    onClick={() => {
                      setComparing((current) => (current === path ? undefined : path));
                      onOpenConflict(conflict.revisionId, path);
                    }}
                  >
                    <GitCompare aria-hidden className='size-3' />
                  </Button>
                ) : null}
                {openable ? (
                  <Button
                    size='xs'
                    variant='ghost'
                    aria-label={`Open ${path}`}
                    disabled={conflict.busy}
                    onClick={() => {
                      onOpenConflict(conflict.revisionId, path);
                    }}
                  >
                    <Pencil aria-hidden className='size-3' />
                  </Button>
                ) : null}
              </div>
              {/* *Open* is the editable mode: the markers in a buffer with no file
                behind them, because a conflicted revision's tree holds no marker
                byte and never will (A22, P43). */}
              {materialized?.text === undefined ? null : (
                <RevisionConflictEditor
                  path={path}
                  text={materialized.text}
                  isBusy={conflict.busy}
                  onResolved={(content) => {
                    onResolveInEditor(conflict.revisionId, path, content);
                  }}
                />
              )}
              {/* A27/D19's third *Compare* surface. The markers say what the two
                sides are; this says it the way the History rows already do, and
                it is the same component (review R9). */}
              {comparing === path ? (
                <DiffViewer
                  originalContent={materialized?.ours ?? ''}
                  modifiedContent={materialized?.theirs ?? ''}
                  language={path}
                  className='rounded-md border'
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className='flex items-center justify-between gap-2'>
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
export type ConflictMaterialization = Readonly<{ text: string; ours: string; theirs: string }>;

export type RevisionBranchesProps = {
  /** Every branch the project has, from the `RevisionStatus` projection. */
  readonly branches: readonly RevisionBranchFacet[];
  /** The branch the workbench is on; its row is marked and has no verbs. */
  readonly currentBranch: string | undefined;
  /** Chat names by id, for the chips that say who is working where. */
  readonly chatNames: Readonly<Record<string, string>>;
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
  chatNames,
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
  const [renaming, setRenaming] = useState<Readonly<{ branch: string; draft: string }>>();

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
          return (
            <li
              key={branch.name}
              /* The word "Current" is said once in the pane, by the row of the
                 revision it names; here the branch the workbench is on is
                 marked, not labelled again. */
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'group/branch flex flex-col gap-2 rounded-md px-1 py-1.5',
                conflict === undefined ? 'hover:bg-muted/50' : 'border-amber-500/40 bg-amber-500/10 border px-2 py-2',
                isCurrent && conflict === undefined ? 'bg-muted/40' : undefined,
              )}
            >
              <div className='flex items-center gap-2'>
                <GitBranch aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />
                {renaming?.branch === branch.name ? (
                  <form
                    className='flex flex-1 items-center gap-2'
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = renaming.draft.trim();
                      setRenaming(undefined);
                      if (name !== '' && name !== branch.name) {
                        onRename(branch.name, name);
                      }
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label={`New name for ${branch.name}`}
                      value={renaming.draft}
                      className='h-6'
                      onChange={(event) => {
                        setRenaming({ branch: branch.name, draft: event.target.value });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setRenaming(undefined);
                        }
                      }}
                    />
                    <Button size='xs' type='submit' aria-label={`Rename ${branch.name}`} disabled={isBusy}>
                      Save
                    </Button>
                  </form>
                ) : (
                  <span className='truncate text-sm font-medium'>{branch.name}</span>
                )}
                {/* ponytail: no `Rev N` per row. The ordinal is a first-parent
                  walk of *that* branch (I3), so a row that showed one would cost
                  a `log(branch)` per branch on every render; the canvas's number
                  arrives with the ahead/behind read, which is one graph question
                  for both. */}
                {branch.leaseChatIds.map((chatId) => (
                  <Badge key={chatId} variant='secondary' className='max-w-32 shrink-0 truncate font-normal'>
                    {chatNames[chatId] ?? 'Chat'}
                  </Badge>
                ))}
                {conflict === undefined ? null : (
                  <Badge className='border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400 shrink-0 gap-1'>
                    <AlertTriangle aria-hidden />
                    Needs resolution
                  </Badge>
                )}
                <span className='flex-1' />
                {isCurrent ? (
                  <Check aria-hidden className='size-3.5 shrink-0 text-primary' />
                ) : conflict === undefined ? (
                  <span className='flex shrink-0 items-center gap-1 opacity-0 group-hover/branch:opacity-100 focus-within:opacity-100'>
                    <Button
                      size='xs'
                      variant='ghost'
                      disabled={isBusy}
                      onClick={() => {
                        onSwitch(branch.name);
                      }}
                    >
                      Switch
                    </Button>
                    {currentBranch === undefined ? null : (
                      <Button
                        size='xs'
                        variant='ghost'
                        disabled={isBusy}
                        onClick={() => {
                          onMerge(branch.name);
                        }}
                      >
                        {`Merge into ${currentBranch}`}
                      </Button>
                    )}
                    {renaming?.branch === branch.name ? null : (
                      <Button
                        size='xs'
                        variant='ghost'
                        disabled={isBusy}
                        aria-label={`Rename ${branch.name}`}
                        onClick={() => {
                          setRenaming({ branch: branch.name, draft: branch.name });
                        }}
                      >
                        Rename
                      </Button>
                    )}
                    <Button
                      size='xs'
                      variant='ghost'
                      disabled={isBusy}
                      onClick={() => {
                        onDiscard(branch.name, branch.checkoutId);
                      }}
                    >
                      Discard
                    </Button>
                  </span>
                ) : null}
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
