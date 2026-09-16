/**
 * The two questions closing a project can ask (S46, I24, I28, A35).
 *
 * *Close* with runs in flight asks first, because stopping somebody's agents is
 * not a side effect of tidying the sidebar. And a refused open says what to
 * close, by name, with what each candidate is doing — a budget nobody can see
 * is a budget nobody can act on.
 *
 * Neither dialog decides anything: the registry owns both verbs and both
 * refusals, and these only put its own words on screen. Both use the design
 * system's own `AlertDialogCancel` / `AlertDialogAction`, because Radix focuses
 * the cancel ref on open and a plain `Button` leaves that ref null — focus then
 * never enters the dialog at all (R6).
 */

import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { useProjects } from '#hooks/use-projects.js';
import { useLiveProjectIds, useSessions } from '#hooks/use-sessions.js';
import { pluralize, useProjectSidebarRow, useSidebarCommands } from '#hooks/use-sidebar-status.js';
import type { ProjectSidebarRow } from '#hooks/use-sidebar-status.js';

/**
 * *Stop n agents and close X?* — asked only while agents are running.
 *
 * @param props - The project's row (read once by the item, R10), its name, and the caller's control.
 * @returns The dialog, while it is open.
 * @public
 */
export function CloseProjectDialog({
  row,
  name,
  isOpen,
  onOpenChange,
  onConfirm,
}: {
  readonly row: ProjectSidebarRow;
  readonly name: string;
  readonly isOpen: boolean;
  readonly onOpenChange: (next: boolean) => void;
  readonly onConfirm?: () => void;
}): React.JSX.Element {
  const { closeProject } = useSidebarCommands();
  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Stop ${pluralize(row.runs, 'agent')} and close ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Their work so far is saved locally as revisions. If backup is unavailable, it stays queued for the next
            connection. You can reopen the project any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (onConfirm === undefined) {
                closeProject(row.projectId);
              } else {
                onConfirm();
              }
            }}
          >
            Stop and close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** One candidate the budget dialog offers, with what it is doing. */
function BudgetCandidate({
  projectId,
  name,
  onChoose,
}: {
  readonly projectId: string;
  readonly name: string;
  readonly onChoose: (projectId: string) => void;
}): React.JSX.Element {
  const row = useProjectSidebarRow(projectId);
  /* Only the two things a person weighs: somebody is waiting on them, or
   * agents are working. A live project with neither is idle. */
  const doing = row.attention > 0 ? 'needs you' : row.runs > 0 ? pluralize(row.runs, 'agent') : 'idle';
  return (
    <button
      type='button'
      className='flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:focus-outline'
      onClick={() => {
        onChoose(projectId);
      }}
    >
      <span className='truncate'>{`Close ${name} and open`}</span>
      <span className='shrink-0 text-xs text-muted-foreground'>{doing}</span>
    </button>
  );
}

/** The dialog's body, mounted only while a refusal is outstanding. */
function BudgetRefusedBody({
  refusedProjectId,
  candidates,
  onChosen,
}: {
  readonly refusedProjectId: string;
  readonly candidates: readonly string[];
  readonly onChosen: () => void;
}): React.JSX.Element {
  const { projects } = useProjects();
  const liveProjectIds = useLiveProjectIds();
  const { closeProject } = useSidebarCommands();
  const nameOf = (projectId: string): string =>
    projects.find((entry) => entry.id === projectId)?.name ?? 'that project';
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{`Close a project to open ${nameOf(refusedProjectId)}`}</AlertDialogTitle>
        <AlertDialogDescription>
          {`${pluralize(liveProjectIds.length, 'project')} are live and none is idle. Pick one to close:`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className='flex flex-col gap-1.5'>
        {candidates.map((candidate) => (
          <BudgetCandidate
            key={candidate}
            projectId={candidate}
            name={nameOf(candidate)}
            onChoose={(chosen) => {
              /* One event, not two (R8): the registry remembered the refused
               * open, so closing the victim resumes it. Sending `open` here as
               * well would find the victim still in `refs` and close it twice. */
              closeProject(chosen);
              onChosen();
            }}
          />
        ))}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Not now</AlertDialogCancel>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

/**
 * *Close a project to open X* — the visible half of the live-project budget.
 *
 * It listens for the registry's own `budgetRefused`, so the candidates are the
 * registry's list and never a second policy. It mounts in `SessionsProvider`
 * rather than in the sidebar (R5): on mobile the sidebar is a sheet that
 * unmounts its children while closed, and that is exactly where the budget
 * bites hardest.
 *
 * @returns The dialog, while a refusal is outstanding.
 * @public
 */
export function BudgetRefusedDialog(): React.JSX.Element | undefined {
  const sessions = useSessions();
  const [refusal, setRefusal] = useState<{ projectId: string; suggestions: readonly string[] } | undefined>();

  useEffect(() => {
    const subscription = sessions.on('budgetRefused', (event) => {
      setRefusal({ projectId: event.projectId, suggestions: event.suggestions });
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [sessions]);

  if (refusal === undefined) {
    return undefined;
  }
  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) {
          /* *Not now*: the registry remembered the refused open, and nothing
           * else will ever forget it. */
          sessions.send({ type: 'cancelPendingOpen' });
          setRefusal(undefined);
        }
      }}
    >
      <BudgetRefusedBody
        refusedProjectId={refusal.projectId}
        candidates={refusal.suggestions}
        onChosen={() => {
          setRefusal(undefined);
        }}
      />
    </AlertDialog>
  );
}
