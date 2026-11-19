import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Cloud, EllipsisVertical } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { useDeleteCloudProject } from '#hooks/use-cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';
import { useRevisionSessionUser } from '@taucad/revisions-ui/lib/revision-actor';

/** One overflow owner for cloud-only, downloaded and trashed projects. */
export function ProjectActionMenu({
  name,
  cloud,
  isCloudOnly = false,
  children,
  onCloseAutoFocus,
}: {
  readonly name: string;
  readonly cloud?: CloudProject;
  readonly isCloudOnly?: boolean;
  readonly children?: ReactNode;
  readonly onCloseAutoFocus?: (event: Event) => void;
}): React.JSX.Element {
  const trigger = useRef<HTMLButtonElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRequestingDialog, setIsRequestingDialog] = useState(false);
  const isDeleting = cloud?.cloudState === 'deleting';
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant='ghost' size='icon' aria-label={`Actions for ${name}`}>
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          onCloseAutoFocus={(event) => {
            if (isRequestingDialog) {
              event.preventDefault();
              setIsRequestingDialog(false);
              setIsConfirming(true);
            } else {
              onCloseAutoFocus?.(event);
            }
          }}
        >
          {children}
          {cloud?.canDeleteCloud === true || isDeleting ? (
            <>
              {children ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                variant={isDeleting ? 'default' : 'destructive'}
                onSelect={() => {
                  setIsRequestingDialog(true);
                }}
              >
                <Cloud />
                {isDeleting ? 'Check deletion…' : 'Delete cloud copy…'}
              </DropdownMenuItem>
            </>
          ) : null}
          {isCloudOnly && cloud?.canDeleteCloud !== true && !isDeleting ? (
            <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {isConfirming && cloud ? (
        <CloudDeleteDialog
          project={{ ...cloud, name }}
          isCloudOnly={isCloudOnly}
          onRestoreFocus={() => {
            if (trigger.current?.isConnected) {
              trigger.current.focus();
            } else {
              document.querySelector<HTMLElement>('input[placeholder="Search projects…"]')?.focus();
            }
          }}
          onClose={() => {
            setIsConfirming(false);
          }}
        />
      ) : null}
    </>
  );
}

function CloudDeleteDialog({
  project,
  isCloudOnly,
  onRestoreFocus,
  onClose,
}: {
  readonly project: CloudProject;
  readonly isCloudOnly: boolean;
  readonly onRestoreFocus: () => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const deletion = useDeleteCloudProject();
  const account = useRevisionSessionUser()?.id;
  const [confirmationAccount, setConfirmationAccount] = useState(account);
  // Bind this confirmation to its first resolved account, never a later account switch.
  if (confirmationAccount === undefined && account !== undefined) {
    setConfirmationAccount(account);
  }
  const isSessionReady = account !== undefined && account === confirmationAccount;
  const isPending = project.cloudState === 'deleting' || deletion.isPending;
  const isChecking = project.isCheckingDeletion === true || deletion.data === 'checking';
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the cloud copy of “{project.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes its backup and published links from the cloud, and people you shared it with lose access.
            Copies already on anyone’s devices, and duplicates, are kept. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isCloudOnly ? (
          <p className='text-sm'>If this project isn’t on one of your devices, you won’t be able to open it again.</p>
        ) : null}
        <p className='text-xs text-muted-foreground'>
          Tau keeps the deleted files for at least 30 days, then removes them for good. They can’t be restored in Tau.
        </p>
        {isPending ? (
          <p role='status' aria-busy='true' className='text-sm'>
            {isChecking ? 'Checking deletion…' : 'Deleting cloud copy…'} You can close this dialog; Tau will check again
            when you return.
          </p>
        ) : null}
        {!isPending && account === undefined ? (
          <p role='status' className='text-sm'>
            Checking that you’re signed in. If this takes long, refresh the page.
          </p>
        ) : null}
        {!isPending && account !== undefined && !isSessionReady ? (
          <p role='alert' className='text-sm'>
            You’re signed in to a different account now. Close this and start again.
          </p>
        ) : null}
        {deletion.isError ? (
          <p role='alert' className='text-sm'>
            {deletion.error.message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{isPending ? 'Close' : 'Cancel'}</AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={isPending || !isSessionReady || project.canDeleteCloud !== true}
            aria-busy={deletion.isPending}
            onClick={() => {
              deletion.mutate(project, {
                onSuccess: (state) => {
                  if (state === 'deleted') {
                    onClose();
                  }
                },
              });
            }}
          >
            Delete cloud copy
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
