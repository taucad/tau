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
import { toast } from '#components/ui/sonner.js';
import { useProject } from '#hooks/use-project.js';
import { pluralize, useSidebarCommands } from '#hooks/use-sidebar-status.js';
import type { UnsavedParameterDraftsRefusal } from '#services/parameter-set-service.js';

/**
 * *Discard n unsaved parameter edits?* — asked when closing the project, or renaming or deleting a
 * model, would drop a value typed into a parameter row but never entered.
 *
 * The parameter service owns the refusal; this only puts it on screen. *Keep editing* leaves every
 * draft in place, and *Discard* drops them and resumes the close (a file operation is retried by
 * the person, because the file tree has already reported it).
 *
 * @param props - The project whose parameter service to observe.
 * @returns The dialog, while a refusal is outstanding.
 * @public
 */
export function UnsavedParameterDraftsDialog({ projectId }: { readonly projectId: string }): React.JSX.Element {
  const { parameterService } = useProject();
  const { closeProject } = useSidebarCommands();
  const [refusal, setRefusal] = useState<UnsavedParameterDraftsRefusal>();
  useEffect(() => parameterService.subscribeUnsavedDrafts(setRefusal), [parameterService]);
  const drafts = refusal?.drafts ?? [];
  const unsubmitted = drafts.filter(({ reason }) => reason === 'unsubmitted').length;
  return (
    <AlertDialog
      open={refusal !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          setRefusal(undefined);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Discard ${pluralize(drafts.length, 'unsaved parameter edit')}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {unsubmitted === drafts.length
              ? 'These values were typed but not entered, so the model has not used them.'
              : 'Some of these values were not entered and some are not valid, so the model has not used them.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className='flex flex-col gap-1 text-sm'>
          {drafts.map((draft) => (
            <li key={`${draft.entry}:${draft.label}`} className='flex justify-between gap-2'>
              <span className='min-w-0 truncate'>
                {draft.label} <span className='text-muted-foreground'>{draft.entry}</span>
              </span>
              <span className='shrink-0 text-muted-foreground'>
                {draft.reason === 'invalid' ? 'Not valid' : 'Not entered'}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              parameterService.discardDrafts();
              if (refusal?.operation === 'close') {
                closeProject(projectId);
              } else {
                toast.info('Parameter edits discarded. Rename or delete the file again.');
              }
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
