/**
 * One revision, wherever a person meets it (charter D7; canvas rounds 3–21).
 *
 * `RevisionRow` is a History row: at rest the whole row is one button that opens
 * it, with its marker on the line, its title, who made it and `Rev N`. Opened,
 * it shows the files it changed (each row opening its own comparison), one
 * actions row, and the Details disclosure. `RevisionMenu` and `RevisionDetails`
 * are that row's More and Details, shared with the chat marker so a person
 * reaches the same verbs from either place.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  EllipsisVertical,
  GitBranch,
  GitCompare,
  GitMerge,
  Link2,
  RotateCcw,
  Tag,
  Trash2,
  Undo2,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@taucad/ui/components/dialog';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { cn } from '@taucad/ui/utils/cn';
import type { RevisionDiffEntry } from '@taucad/revisions';
import { Spinner } from '#components/ui/spinner.js';
import { CopyButton } from '#components/copy-button.js';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { ActionButton, ActionsRow, disclosureMotion } from '#components/revisions/revision-actions.js';
import { NamePopover } from '#components/revisions/name-popover.js';
import {
  timelineGutter,
  timelineMarker,
  timelineOpenBlock,
  timelineRowButton,
  timelineRowContent,
  timelineRowHover,
} from '#components/revisions/revision-timeline.js';
import { useTickAnimation } from '#hooks/use-tick-animation.js';
import { resolveHighlightLanguageForPath } from '#lib/code-language-resolution.js';
import { describeRevisionFailure } from '#lib/revision-failure-copy.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionChanges, useRevisionChangesSince, useRevisionFileComparison } from '#hooks/use-revisions.js';
import type { RevisionCard } from '#hooks/use-revisions.js';
import { useProjectRole, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useProjectWorkspace } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { consumeRevisionReveal, useRevisionReveal } from '#routes/w.$workspace.$project/revision-reveal.js';
import { requestRefRemoval } from '#routes/w.$workspace.$project/revision-ref-removal.js';
import type { AffectedPublication } from '#routes/w.$workspace.$project/revision-ref-removal.js';
import { revisionName, revisionTriggerLabel } from '#routes/w.$workspace.$project/revision-vocabulary.js';

/** Whether a revision is one of the autosaves History folds. */
export const isAutosave = (revision: RevisionCard): boolean =>
  revision.trigger === 'idle' || revision.trigger === 'hidden' || revision.trigger === 'close';

/* The file's state is muted at 90%, the lightest step that keeps 4.5:1 on the
   file list in every theme; a hovered row returns it to the full muted colour. */
const changeLabels: Readonly<Record<RevisionDiffEntry['kind'], string>> = {
  added: 'Added',
  modified: 'Changed',
  deleted: 'Deleted',
};

/**
 * What *Compare* opens under a file row: the shared `DiffViewer` flush inside
 * the file list, or why there is nothing to read yet.
 *
 * @param props - The revision, the file, and what it is compared with.
 * @returns The comparison.
 */
function FileComparison({
  id,
  revisionId,
  path,
  compareAgainst,
  n,
}: {
  readonly id: string;
  readonly revisionId: string;
  readonly path: string;
  readonly compareAgainst: 'parent' | 'checkout';
  /** The revision's number, which a comparison with the current files names. */
  readonly n: number | undefined;
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const { original, modified, isLoading, isLoaded, error, retry } = useRevisionFileComparison(
    revisionId,
    path,
    compareAgainst === 'checkout' ? 'checkout' : undefined,
  );
  const label = `Comparison for ${path}`;
  if (isLoading) {
    return (
      <div
        id={id}
        role='status'
        aria-label={label}
        aria-busy='true'
        className='flex items-center gap-2 border-t px-2 py-1.5 text-xs text-muted-foreground'
      >
        <Spinner className='size-3' /> Loading comparison…
      </div>
    );
  }
  if (error !== undefined) {
    return (
      <div
        id={id}
        role='alert'
        aria-label={label}
        className='flex flex-wrap items-center gap-2 border-t px-2 py-1.5 text-xs'
      >
        <span className='min-w-0 flex-auto'>{`Could not compare ${path}. ${error}`}</span>
        <ActionButton verb='Retry' icon={RotateCcw} className='ml-auto' onClick={retry} />
      </div>
    );
  }
  if (!isLoaded) {
    return null;
  }
  if (original === modified) {
    return (
      <p id={id} role='note' aria-label={label} className='border-t px-2 py-1.5 text-xs text-muted-foreground'>
        {compareAgainst === 'checkout'
          ? `No changes since ${revisionName(n) ?? 'this revision'}.`
          : 'No changes in this file.'}
      </p>
    );
  }
  return (
    /* A region that scrolls sideways must be reachable by keyboard to scroll. */
    <div
      id={id}
      role='region'
      aria-label={label}
      tabIndex={0}
      /* An empty Shiki line keeps its height, and the hidden-lines label keeps the 12 px floor (round 5). */
      className='[scrollbar-width:thin] overflow-x-auto border-t bg-background focus-visible:focus-outline [&_.line:empty]:min-h-[1.6em] [&_.whitespace-nowrap]:text-xs'
    >
      <DiffViewer
        originalContent={original}
        modifiedContent={modified}
        language={resolveHighlightLanguageForPath(path).shikiLanguage}
      />
    </div>
  );
}

/**
 * The files a revision changed, on their own bordered surface. Each whole row
 * is the disclosure for its comparison, one open at a time: what the revision
 * changed or, on the current row of a modified checkout, what has changed since
 * it (S38).
 *
 * @param props - The revision and what its files are compared with.
 * @returns The list, or nothing until the files are known.
 */
export function FileRows({
  revision,
  compareAgainst,
}: {
  readonly revision: RevisionCard;
  readonly compareAgainst: 'parent' | 'checkout';
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const changes = useRevisionChanges(revision);
  return <FileList revision={revision} changes={changes} compareAgainst={compareAgainst} label='Changed files' />;
}

/**
 * The file list itself, for whichever paths a row shows: what the revision
 * changed, or what differs from it now.
 *
 * @param props - The revision, its paths, what they are compared with, and the list's name.
 * @returns The list, or nothing for no paths.
 */
function FileList({
  revision,
  changes,
  compareAgainst,
  label,
}: {
  readonly revision: RevisionCard;
  readonly changes: readonly RevisionDiffEntry[];
  readonly compareAgainst: 'parent' | 'checkout';
  readonly label: string;
  // oxlint-disable-next-line typescript/no-restricted-types -- required by React
}): React.JSX.Element | null {
  const [comparing, setComparing] = useState<string>();
  const id = useId();
  if (changes.length === 0) {
    return null;
  }
  return (
    <ul aria-label={label} className='flex flex-col divide-y overflow-hidden rounded-md border bg-background'>
      {changes.map((change, index) => (
        <Collapsible
          key={change.path}
          asChild
          open={comparing === change.path}
          onOpenChange={(isOpen) => {
            setComparing(isOpen ? change.path : undefined);
          }}
        >
          <li className='flex flex-col'>
            <CollapsibleTrigger asChild>
              <button
                type='button'
                aria-label={
                  compareAgainst === 'checkout'
                    ? `Compare ${change.path} with the current file`
                    : `Compare ${change.path}`
                }
                className='group/file flex min-h-6 w-full min-w-0 cursor-action items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:focus-outline motion-reduce:transition-none'
              >
                <FileExtensionIcon filename={change.path} className='size-3.5 shrink-0' />
                <span className='min-w-0 flex-1 truncate'>{change.path}</span>
                <span className='shrink-0 text-muted-foreground/90 group-hover/file:text-muted-foreground'>
                  {changeLabels[change.kind]}
                </span>
                <ChevronDown
                  aria-hidden
                  className='size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/file:rotate-180 motion-reduce:transition-none'
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className={disclosureMotion}>
              <FileComparison
                id={`${id}-${String(index)}`}
                revisionId={revision.revisionId}
                path={change.path}
                compareAgainst={compareAgainst}
                n={revision.n}
              />
            </CollapsibleContent>
          </li>
        </Collapsible>
      ))}
    </ul>
  );
}

/**
 * *Compare with current* (canvas round 4b): the whole revision against the
 * files as they are now — every path that differs from the checkout's head,
 * each opening the same checkout comparison a file row does — until the person
 * stops comparing.
 *
 * @param props - The revision, and how to go back to its own changes.
 * @returns The comparison.
 */
function CurrentComparison({
  revision,
  onStop,
}: {
  readonly revision: RevisionCard;
  readonly onStop: () => void;
}): React.JSX.Element {
  const { changes, isLoaded } = useRevisionChangesSince(revision);
  const name = revisionName(revision.n) ?? 'this revision';
  const body = isLoaded ? (
    changes.length === 0 ? (
      <p role='note' className='text-xs text-muted-foreground'>{`No changes since ${name}.`}</p>
    ) : (
      <FileList revision={revision} changes={changes} compareAgainst='checkout' label={`Changed since ${name}`} />
    )
  ) : (
    <p role='status' aria-busy='true' className='flex items-center gap-2 text-xs text-muted-foreground'>
      <Spinner className='size-3' /> Loading comparison…
    </p>
  );
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground'>
        <span className='min-w-0 flex-auto'>Compared with the current files</span>
        <ActionButton verb='Stop comparing' icon={X} variant='ghost' onClick={onStop} />
      </div>
      {body}
    </div>
  );
}

/**
 * A revision's exact facts, opened by the Details toggle in the same
 * `Collapsible`. The revision's id lives here and nowhere else a person reads
 * (EQ9); copying it is More's.
 *
 * @param props - The revision and the line it is on.
 * @returns The Details content.
 */
export function RevisionDetails({
  revision,
  branch,
}: {
  readonly revision: RevisionCard;
  readonly branch: string | undefined;
}): React.JSX.Element {
  /* The first parent the graph named; a branch's first revision follows none. A card
     from elsewhere (a remote settlement) has neither a parent nor a number here. */
  const parent =
    revision.parent === undefined ? (
      revision.n === 1 ? (
        'None (first revision)'
      ) : undefined
    ) : (
      <code key='parent' className='font-mono break-all'>
        {revision.parent}
      </code>
    );
  const rows: ReadonlyArray<readonly [string, React.ReactNode]> = [
    [
      'Revision',
      <code key='id' className='font-mono break-all'>
        {revision.revisionId}
      </code>,
    ],
    /* The tree the revision carries: two revisions with the same bytes name the same one. */
    ...(revision.treeId === undefined
      ? []
      : ([
          [
            'Tree',
            <code key='tree' className='font-mono break-all'>
              {revision.treeId}
            </code>,
          ],
        ] as const)),
    ...(parent === undefined ? [] : ([['Parent', parent]] as const)),
    ...(branch === undefined ? [] : ([['Branch', branch]] as const)),
    ['Trigger', revisionTriggerLabel(revision.trigger)],
    ...(revision.createdAt > 0
      ? ([
          [
            'Recorded',
            <span key='recorded' className='tabular-nums'>
              {new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>,
          ],
        ] as const)
      : []),
    ...(revision.actor === '' ? [] : ([['By', revision.actor]] as const)),
  ];
  return (
    <CollapsibleContent className={disclosureMotion}>
      <dl
        aria-label={`Details for ${revisionName(revision.n) ?? 'this revision'}`}
        className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 px-1 pt-1 text-xs'
      >
        {rows.map(([term, value]) => (
          <div key={term} className='contents'>
            <dt className='text-muted-foreground'>{term}</dt>
            <dd className='min-w-0'>{value}</dd>
          </div>
        ))}
      </dl>
    </CollapsibleContent>
  );
}

type NameRemoval = Readonly<{
  name: string;
  publication: AffectedPublication | undefined;
  error: string | undefined;
  isBusy: boolean;
}>;

/**
 * Removing a version name, confirmed and named (L3-F5, D24): the audited server
 * verb first when the project backs up to Tau Cloud, then this device's name.
 *
 * @returns The removal in progress, and its verbs.
 */
function useNameRemoval(): Readonly<{
  removal: NameRemoval | undefined;
  ask: (name: string) => void;
  remove: (name: string, publication?: AffectedPublication) => Promise<void>;
  dismiss: () => void;
}> {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const [removal, setRemoval] = useState<NameRemoval>();
  const isTauCloud = status?.remote.kind === 'tau' && status.remote.phase === 'connected';

  const remove = async (name: string, publication?: AffectedPublication): Promise<void> => {
    setRemoval({ name, publication, error: undefined, isBusy: true });
    const answer = isTauCloud
      ? await requestRefRemoval(projectId, `refs/tags/${name}`, publication?.id)
      : ({ kind: 'removed' } as const);
    if (answer.kind === 'published') {
      /* The person sees what the removal affects before anything changes. */
      setRemoval({ name, publication: answer.publication, error: undefined, isBusy: false });
      return;
    }
    if (answer.kind === 'refused') {
      setRemoval({
        name,
        publication,
        error: describeRevisionFailure('removeName', answer.code).description,
        isBusy: false,
      });
      return;
    }
    try {
      await commands.deleteTag(name);
      setRemoval(undefined);
    } catch {
      setRemoval({
        name,
        publication,
        error: describeRevisionFailure('removeName', undefined).description,
        isBusy: false,
      });
    }
  };

  return {
    removal,
    ask: (name) => {
      setRemoval({ name, publication: undefined, error: undefined, isBusy: false });
    },
    remove,
    dismiss: () => {
      setRemoval(undefined);
    },
  };
}

/**
 * Copy revision id: it says Copied with a check for two seconds, or Copy failed
 * with the shared copy button's glyph and an announcement, and the menu stays
 * open so the person sees which.
 *
 * @param props - The revision id.
 * @returns The menu item.
 */
function CopyRevisionId({ revisionId }: { readonly revisionId: string }): React.JSX.Element {
  const { ticked, trigger } = useTickAnimation();
  const [outcome, setOutcome] = useState<'copied' | 'failed'>('copied');
  const isCopied = ticked && outcome === 'copied';
  const isFailed = ticked && outcome === 'failed';
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(revisionId);
      setOutcome('copied');
    } catch {
      setOutcome('failed');
    }
    trigger();
  };
  return (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          void copy();
        }}
      >
        {isFailed ? (
          <X aria-hidden className='text-feature' />
        ) : isCopied ? (
          <Check aria-hidden className='text-success' />
        ) : (
          <Copy aria-hidden />
        )}
        {isFailed ? 'Copy failed' : isCopied ? 'Copied' : 'Copy revision id'}
      </DropdownMenuItem>
      {isFailed ? (
        <span role='alert' className='sr-only'>
          Copy failed. Select the id in Details and copy it.
        </span>
      ) : null}
    </>
  );
}

/**
 * *Publish* for a revision older than the one you are on (canvas: a row's More).
 *
 * The head publishes from the Share panel; an older revision is named and
 * published here, through the same `publish.machine` with its id, so the link
 * points at exactly this revision (W1b). The link is public: private links and
 * invitations stay in the Share panel.
 *
 * @param props - The revision, how to close, and where focus returns.
 * @returns The dialog.
 */
function PublishRevisionDialog({
  revision,
  onClose,
  restoreFocus,
}: {
  readonly revision: RevisionCard;
  readonly onClose: () => void;
  /** Puts focus back on the More that opened it. */
  readonly restoreFocus: () => void;
}): React.JSX.Element {
  const status = useRevisionStatus();
  const commands = useRevisionCommands();
  const { projectRef } = useProject();
  const project = useSelector(projectRef, (state) => state.context.project);
  const inputId = useId();
  const [name, setName] = useState(revision.tags?.[0] ?? '');
  /* The facet is the project's one publish machine; this dialog reads it only for the publish it sent. */
  const [isSent, setIsSent] = useState(false);
  const facet = isSent ? status?.publish : undefined;
  const link = facet?.phase === 'success' ? facet.shareUrl : undefined;
  const error = facet?.phase === 'error' ? facet.error : undefined;
  const isBusy = facet?.phase === 'choosingVersion' || facet?.phase === 'working';
  const title = `Publish ${revisionName(revision.n) ?? 'this revision'}`;
  const close = (): void => {
    if (isSent) {
      commands.resetPublish();
    }
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A published link always points at a named version that is backed up on Tau Cloud.
          </DialogDescription>
        </DialogHeader>
        {link === undefined ? (
          <form
            className='flex flex-col gap-3'
            onSubmit={(event) => {
              event.preventDefault();
              const tag = name.trim();
              const projectName = project?.name ?? 'Untitled';
              commands.publishProject(tag, revision.revisionId);
              commands.confirmPublish({
                tag,
                projectName,
                entryPath: project?.assets.main.entryPath ?? '',
                visibility: 'public',
                title: projectName,
              });
              setIsSent(true);
            }}
          >
            <Label htmlFor={inputId} className='text-xs font-normal'>
              Version name
            </Label>
            <Input
              autoFocus
              id={inputId}
              value={name}
              placeholder='e.g. Ready for print v2'
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {error === undefined ? null : (
              <p role='alert' className='text-sm'>
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type='button' variant='outline' size='sm' onClick={close}>
                Cancel
              </Button>
              <Button type='submit' size='sm' disabled={name.trim() === '' || isBusy}>
                {isBusy ? <Spinner aria-hidden /> : <Link2 aria-hidden />}
                Publish
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className='flex flex-col gap-3'>
            <p role='status' className='text-sm'>
              {`${name.trim()} is published. Anyone with the link can open it.`}
            </p>
            <div className='flex items-center gap-2'>
              <Input
                readOnly
                value={link}
                aria-label='Published link'
                onFocus={(event) => {
                  event.target.select();
                }}
              />
              <CopyButton size='icon' tooltip='Copy link' getText={() => link} />
            </div>
            <DialogFooter>
              <Button variant='outline' size='sm' onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A revision's More, one menu on its History row and in the chat marker, so the
 * chat reaches what History does: naming it, publishing it, a new branch from
 * it, copying its id, and removing its name. Naming and a new branch open the one
 * naming form under this menu's button; a removal asks by name first.
 *
 * @param props - The revision, whether it is the checkout's head, and its line.
 * @returns The menu.
 */
export function RevisionMenu({
  revision,
  isCurrent,
  branch,
  onCompareWithCurrent,
}: {
  readonly revision: RevisionCard;
  readonly isCurrent: boolean;
  readonly branch: string | undefined;
  /** History's row compares the whole revision with the current files; absent where nothing would show it. */
  readonly onCompareWithCurrent?: () => void;
}): React.JSX.Element {
  const status = useRevisionStatus();
  const role = useProjectRole();
  const commands = useRevisionCommands();
  const workspace = useProjectWorkspace({ enableNoContext: true });
  const { removal, ask, remove, dismiss } = useNameRemoval();
  const moreRef = useRef<HTMLButtonElement>(null);
  /* A menu item that opens a form or a dialog opens it once the menu has closed,
     so the menu's focus trap neither keeps focus from it nor takes it back. */
  const opens = useRef<'name' | 'branch' | 'remove' | 'publish'>(undefined);
  const [form, setForm] = useState<'name' | 'branch'>('name');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const name = revisionName(revision.n) ?? 'this revision';
  const named = revision.tags?.[0];
  const canWrite = role !== 'read' && role !== 'revoked';
  const isTauCloud = status?.remote.kind === 'tau' && status.remote.phase === 'connected';
  /* Only the owner may remove a name the Hosted Remote holds; the verb the server would refuse is absent. */
  const canRemoveName = canWrite && (!isTauCloud || role === 'owner');

  const formCopy =
    form === 'name'
      ? {
          label: `Name ${name}`,
          placeholder: 'e.g. Ready for print',
          note: 'A name makes this revision easy to find and to publish.',
          saveLabel: named === undefined ? 'Save name' : 'Rename version',
          initial: named ?? '',
          onSave: async (value: string): Promise<void> => {
            if (value === named) {
              return;
            }
            await commands.tag({ name: value, revisionId: revision.revisionId });
            /* A rename removes the old name through the same confirmed path. */
            if (named !== undefined) {
              void remove(named);
            }
          },
        }
      : {
          label: 'Name for the new branch',
          placeholder: 'enclosure-v2',
          note: `Starts from ${name}.${branch === undefined ? '' : ` ${branch} stays as it is.`}`,
          saveLabel: 'Create branch',
          initial: '',
          onSave: (value: string): void => {
            // oxlint-disable-next-line promise/prefer-await-to-then, tau-lint/no-async-iife -- the toast channel owns this refusal; only the loose rejection is ours
            void commands.createBranch(value, revision.revisionId).catch(() => undefined);
          },
        };

  return (
    <>
      <DropdownMenu>
        <NamePopover
          anchor={
            <DropdownMenuTrigger asChild>
              <Button ref={moreRef} size='icon-xs' variant='outline' aria-label={`More actions for ${name}`}>
                <EllipsisVertical aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          }
          isOpen={isFormOpen}
          returnFocus={moreRef}
          onOpenChange={setIsFormOpen}
          {...formCopy}
        />
        <DropdownMenuContent
          align='end'
          onCloseAutoFocus={(event) => {
            const next = opens.current;
            if (next === undefined) {
              return;
            }
            opens.current = undefined;
            event.preventDefault();
            if (next === 'remove') {
              if (named !== undefined) {
                ask(named);
              }
              return;
            }
            if (next === 'publish') {
              setIsPublishOpen(true);
              return;
            }
            setForm(next);
            setIsFormOpen(true);
          }}
        >
          {onCompareWithCurrent === undefined ? null : (
            <DropdownMenuItem onSelect={onCompareWithCurrent}>
              <GitCompare aria-hidden />
              Compare with current
            </DropdownMenuItem>
          )}
          {canWrite ? (
            <DropdownMenuItem
              onSelect={() => {
                opens.current = 'name';
              }}
            >
              <Tag aria-hidden />
              {named === undefined ? 'Name version…' : 'Rename version…'}
            </DropdownMenuItem>
          ) : null}
          {/* The revision you are on publishes from the Share panel; an older one names and publishes itself here. */}
          {canWrite && isTauCloud && (!isCurrent || workspace !== undefined) ? (
            <DropdownMenuItem
              onSelect={() => {
                if (isCurrent) {
                  workspace?.openPanel('share');
                  return;
                }
                opens.current = 'publish';
              }}
            >
              <Link2 aria-hidden />
              {isCurrent ? 'Publish…' : named === undefined ? 'Publish as a named version…' : `Publish ${named}…`}
            </DropdownMenuItem>
          ) : null}
          {canWrite ? (
            <DropdownMenuItem
              onSelect={() => {
                opens.current = 'branch';
              }}
            >
              <GitBranch aria-hidden />
              {`New branch from ${name}…`}
            </DropdownMenuItem>
          ) : null}
          <CopyRevisionId revisionId={revision.revisionId} />
          {named === undefined || !canRemoveName ? null : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onSelect={() => {
                  opens.current = 'remove';
                }}
              >
                <Trash2 aria-hidden />
                Remove version name…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {isPublishOpen ? (
        <PublishRevisionDialog
          revision={revision}
          restoreFocus={() => {
            moreRef.current?.focus();
          }}
          onClose={() => {
            setIsPublishOpen(false);
            /* Mounted only while open: focus goes back to More before the dialog unmounts. */
            moreRef.current?.focus();
          }}
        />
      ) : null}
      <AlertDialog
        open={removal !== undefined}
        onOpenChange={(open) => {
          if (!open) {
            dismiss();
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
            <AlertDialogTitle>{`Remove the name “${removal?.name ?? ''}” from ${name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {removal?.publication === undefined
                ? ''
                : `“${removal.publication.title}” is published from this name. Removing the name also retires that publication, so its link stops opening. `}
              The revision itself stays in History.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removal?.error === undefined ? null : (
            <p role='alert' className='text-sm'>
              {removal.error}
            </p>
          )}
          <AlertDialogFooter>
            <Button autoFocus variant='outline' onClick={dismiss}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={removal?.isBusy ?? false}
              onClick={() => {
                if (removal !== undefined) {
                  void remove(removal.name, removal.publication);
                }
              }}
            >
              Remove name
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * A marker that means something (L3-F12): conflicted, current, restored,
 * merged, named, or an ordinary revision's dot.
 *
 * @param props - The revision and whether it is the checkout's head.
 * @returns The marker.
 */
function RevisionMarkerGlyph({
  revision,
  isCurrent,
}: {
  readonly revision: RevisionCard;
  readonly isCurrent: boolean;
}): React.JSX.Element {
  if (revision.conflicted) {
    return (
      <span className={timelineMarker}>
        <GitMerge aria-label='Conflicted revision' className='size-3.5 text-warning' />
      </span>
    );
  }
  if (isCurrent) {
    return (
      <span className={timelineMarker}>
        <span aria-label='Current' className='size-2.5 rounded-full border-2 border-foreground' />
      </span>
    );
  }
  /* A9: a Restored row is named by what it restored, never by its trigger. */
  if (revision.restoredFrom !== undefined) {
    return (
      <span className={timelineMarker}>
        <RotateCcw aria-label='Restored' className='size-3.5 text-muted-foreground' />
      </span>
    );
  }
  if (revision.trigger === 'merge') {
    return (
      <span className={timelineMarker}>
        <GitMerge aria-label='Merged' className='size-3.5 text-muted-foreground' />
      </span>
    );
  }
  if ((revision.tags?.length ?? 0) > 0) {
    return (
      <span className={timelineMarker}>
        <Tag aria-label='Named version' className='size-3.5 text-muted-foreground' />
      </span>
    );
  }
  return (
    <span className={timelineMarker}>
      <span aria-hidden className='size-1.5 rounded-full bg-muted-foreground' />
    </span>
  );
}

export type RevisionRowProps = {
  readonly revision: RevisionCard;
  /** The row's title, from `revisionTitle`. */
  readonly title: string;
  /** The revision the checkout reflects: it reads Current and offers no Restore. */
  readonly isCurrent: boolean;
  /** The checkout has changes since its head, so the current row compares with them. */
  readonly isDirty: boolean;
  /** The line History is showing. */
  readonly branch: string | undefined;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** A restore is in flight or asking: the row's verbs wait. */
  readonly isBusy: boolean;
  readonly onRestore: (revisionId: string) => void;
  readonly onUndoRestore: () => void;
  /** The newest row shown: the line starts at its marker. */
  readonly isFirst?: boolean;
  /** The oldest row, with nothing hidden after it: the line ends at its marker. */
  readonly isLast?: boolean;
};

/**
 * One History row: at rest the whole row is one button — marker, title, who made
 * it, `Rev N` and the time — and opened it shows the files, one actions row and
 * Details (canvas rounds 3–20).
 *
 * @param props - The revision, where the checkout is, and the row's verbs.
 * @returns The row, an item of the History list.
 */
export function RevisionRow({
  revision,
  title,
  isCurrent,
  isDirty,
  branch,
  isOpen,
  onOpenChange,
  isBusy,
  onRestore,
  onUndoRestore,
  isFirst = false,
  isLast = false,
}: RevisionRowProps): React.JSX.Element {
  const { projectId } = useProject();
  const role = useProjectRole();
  const isRevealed = useRevisionReveal(projectId) === revision.revisionId;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  /* Canvas round 4b: the row shows its own changes, or the whole revision against the current files. */
  const [isComparingCurrent, setIsComparingCurrent] = useState(false);
  useEffect(() => {
    if (!isRevealed) {
      return;
    }
    buttonRef.current?.scrollIntoView({ block: 'nearest' });
    buttonRef.current?.focus({ preventScroll: true });
    consumeRevisionReveal(projectId, revision.revisionId);
  }, [isRevealed, projectId, revision.revisionId]);

  const name = revisionName(revision.n);
  const time =
    revision.createdAt > 0
      ? new Date(revision.createdAt).toLocaleTimeString(undefined, { timeStyle: 'short' })
      : undefined;
  /* Your own revisions need no attribution; everyone else's say who (HQ4). */
  const actor = revision.actor === 'You' || revision.actor === '' ? undefined : revision.actor;
  const canRestore = role !== 'revoked';
  /* D2, M1: Undo restore lives on the restore row while nothing has landed after it, and only where this
     device's restore machine holds its undo target — never after a reload or another device's restore. */
  const isUndoable = useRevisionStatus()?.restore.undoable === true;
  const canUndoRestore = isCurrent && isUndoable && !isDirty && canRestore;

  return (
    <Collapsible
      asChild
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          setIsComparingCurrent(false);
        }
        onOpenChange(next);
      }}
    >
      <li className='flex flex-col rounded-md transition-colors data-[state=open]:bg-accent/50 motion-reduce:transition-none'>
        <CollapsibleTrigger asChild>
          <button
            ref={buttonRef}
            type='button'
            data-revision-row={revision.revisionId}
            aria-label={`${name ?? 'Revision'} · ${title}`}
            className={cn(timelineRowButton, !isOpen && timelineRowHover)}
          >
            <span aria-hidden className={timelineGutter({ hasTop: !isFirst, hasBottom: !isLast })}>
              <RevisionMarkerGlyph revision={revision} isCurrent={isCurrent} />
            </span>
            <span className={timelineRowContent}>
              <span className='min-w-0 flex-1'>
                <span
                  className={cn(
                    'line-clamp-2 min-w-0 text-sm break-words',
                    isAutosave(revision) ? 'text-muted-foreground' : 'font-medium',
                  )}
                >
                  {title}
                </span>
                {isCurrent || actor !== undefined ? (
                  <span className='flex min-w-0 flex-wrap items-center gap-x-2 text-xs leading-4 text-muted-foreground'>
                    {isCurrent ? <span className='text-foreground'>Current</span> : null}
                    {actor === undefined ? null : (
                      <span className='flex min-w-0 items-center gap-1'>
                        {actor === 'Tau agent' ? <Bot aria-hidden className='size-3 shrink-0' /> : null}
                        <span className='min-w-0'>{actor}</span>
                      </span>
                    )}
                  </span>
                ) : null}
              </span>
              <span className='flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-muted-foreground'>
                {name === undefined ? null : <span className='font-mono'>{name}</span>}
                {time === undefined ? null : (
                  <time
                    dateTime={new Date(revision.createdAt).toISOString()}
                    className='hidden min-w-[8ch] text-right tabular-nums @[22rem]:inline'
                  >
                    {time}
                  </time>
                )}
                <ChevronDown
                  aria-hidden
                  className='size-3 transition-transform group-data-[state=open]/row:rotate-180 motion-reduce:transition-none'
                />
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className={disclosureMotion}>
          <div className={timelineOpenBlock(!isLast)}>
            <Collapsible
              open={isDetailsOpen}
              className='flex flex-col gap-2 pt-0.5 pb-2'
              onOpenChange={setIsDetailsOpen}
            >
              {isComparingCurrent ? (
                <CurrentComparison
                  revision={revision}
                  onStop={() => {
                    setIsComparingCurrent(false);
                  }}
                />
              ) : (
                <FileRows revision={revision} compareAgainst={isCurrent && isDirty ? 'checkout' : 'parent'} />
              )}
              {role === 'read' && isCurrent ? (
                <p className='text-xs text-muted-foreground'>
                  You can view this project. Restore changes only your copy.
                </p>
              ) : null}
              <ActionsRow
                slot='row-actions'
                end={
                  <RevisionMenu
                    revision={revision}
                    isCurrent={isCurrent}
                    branch={branch}
                    /* The current row already compares its files with your edits (S38), so only another revision offers it. */
                    {...(isCurrent
                      ? {}
                      : {
                          onCompareWithCurrent: () => {
                            setIsComparingCurrent(true);
                          },
                        })}
                  />
                }
              >
                {isCurrent ? (
                  canUndoRestore ? (
                    <ActionButton
                      verb='Undo restore'
                      short='Undo'
                      icon={Undo2}
                      disabled={isBusy}
                      onClick={onUndoRestore}
                    />
                  ) : null
                ) : canRestore ? (
                  /* The row names the revision, so the label is the short Restore; the name keeps its object. */
                  <ActionButton
                    verb='Restore'
                    icon={RotateCcw}
                    aria-label={name === undefined ? 'Restore this revision' : `Restore ${name}`}
                    disabled={isBusy}
                    onClick={() => {
                      onRestore(revision.revisionId);
                    }}
                  />
                ) : null}
              </ActionsRow>
              <RevisionDetails revision={revision} branch={branch} />
            </Collapsible>
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
