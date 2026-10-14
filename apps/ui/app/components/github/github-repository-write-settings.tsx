import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@taucad/ui/components/alert-dialog';
import { githubConnections, githubErrorMessage } from '#lib/github-connections.js';

/** Per-repository approval and a separate explicit push. Grant changes never push. */
export function GithubRepositoryWriteSettings({
  connectionId,
  repositoryId,
  onPush,
  pushUnavailable,
}: {
  readonly connectionId: string;
  readonly repositoryId: number;
  readonly onPush?: () => Promise<void>;
  readonly pushUnavailable?: string;
}): React.JSX.Element {
  const [confirm, setConfirm] = useState(false);
  const access = useQuery({
    queryKey: ['github', 'repository-access', connectionId, repositoryId],
    queryFn: async () => githubConnections.access(connectionId, repositoryId),
    retry: false,
    staleTime: 0,
  });
  const change = useMutation({
    mutationFn: async (enabled: boolean) => githubConnections.setWrite(connectionId, { repositoryId, enabled }),
    onSuccess: async () => {
      push.reset();
      setConfirm(false);
      await access.refetch();
    },
  });
  const push = useMutation({
    mutationFn: async () => {
      await onPush?.();
    },
    onSettled: async () => {
      await access.refetch();
    },
  });
  const enabled = access.data?.writeEnabled === true;
  const busy = change.isPending || push.isPending;
  return (
    <div className='flex flex-col gap-3'>
      {access.isPending ? (
        <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
          Checking repository access…
        </p>
      ) : access.error ? (
        <p role='alert' className='text-xs'>
          {githubErrorMessage(access.error)}{' '}
          <Button
            size='sm'
            variant='link'
            onClick={() => {
              void access.refetch();
            }}
          >
            Check again
          </Button>
        </p>
      ) : (
        <>
          <Card className='gap-0 p-0'>
            <CardContent className='p-0'>
              <div className='flex flex-wrap items-center gap-3 p-4'>
                <div className='min-w-0 flex-1 basis-52'>
                  <p className='text-sm font-medium'>Read access</p>
                  <p className='text-xs text-muted-foreground'>
                    {access.data.canRead
                      ? 'Read files and history; import branch designs.'
                      : 'This repository is no longer available to Tau.'}
                  </p>
                </div>
              </div>
              <div className='flex flex-wrap items-center gap-3 border-t p-4'>
                <div className='min-w-0 flex-1 basis-52'>
                  <p className='text-sm font-medium'>Writes from Tau</p>
                  <p className='text-xs text-muted-foreground'>
                    {enabled
                      ? 'Enabled for this repository. Each push is a separate action.'
                      : 'Off for this repository. Reading and importing remain available.'}
                  </p>
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy || (!enabled && !access.data.canWrite)}
                  onClick={() => {
                    if (enabled) {
                      change.mutate(false);
                    } else {
                      setConfirm(true);
                    }
                  }}
                >
                  {enabled ? 'Disable writes' : 'Enable writes'}
                </Button>
              </div>
            </CardContent>
          </Card>
          <p className='text-xs text-muted-foreground'>
            {access.data.canWrite
              ? 'GitHub permits read and write access. Turning off writes in Tau blocks new write credentials; it does not revoke the GitHub grant or credentials already issued.'
              : 'GitHub has not granted write access to this repository. Review the installation and your repository role on GitHub.'}
          </p>
          {onPush ? (
            <div className='flex flex-col items-start gap-2'>
              <p className='text-xs text-muted-foreground'>
                Review your revisions and what is included before pushing. Enabling writes does not upload anything.
              </p>
              <Button
                size='sm'
                disabled={!enabled || busy || pushUnavailable !== undefined}
                onClick={() => {
                  push.mutate();
                }}
              >
                {push.isPending ? 'Pushing…' : 'Push to GitHub'}
              </Button>
              {pushUnavailable ? <p className='text-xs text-muted-foreground'>{pushUnavailable}</p> : null}
              {push.isSuccess ? (
                <p role='status' className='text-xs'>
                  Push completed.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      {((confirm ? null : change.error) ?? push.error) ? (
        <p role='alert' className='text-xs'>
          {githubErrorMessage(change.error ?? push.error)}
        </p>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable writes to {access.data?.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              GitHub already permits writes for this repository. This lets Tau request write credentials until you turn
              it off. Nothing is pushed now. Each push still needs a separate action, and protected branches apply.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {change.error ? (
            <p role='alert' className='text-xs'>
              {githubErrorMessage(change.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>Cancel</AlertDialogCancel>
            <Button
              disabled={change.isPending}
              onClick={() => {
                change.mutate(true);
              }}
            >
              Enable repository writes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
