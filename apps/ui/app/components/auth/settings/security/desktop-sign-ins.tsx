import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { SettingsGroup, SettingsRow } from '@taucad/settings-ui/components/settings/settings-item';
import { Button } from '@taucad/ui/components/button';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { Spinner } from '@taucad/ui-kit/components/spinner';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';
import { ENV } from '#environment.config.js';

/** One Tau Desktop sign-in as `GET /v1/account/desktop-sign-ins` answers it. */
export type DesktopSignIn = {
  readonly id: string;
  readonly client: string;
  readonly signedInAt: string;
  readonly lastActiveAt: string;
  readonly endsAt: string;
};

const queryKey = ['account', 'desktop-sign-ins'] as const;

const listDesktopSignIns = async (): Promise<DesktopSignIn[]> => {
  const response = await fetch(`${ENV.TAU_API_URL}/v1/account/desktop-sign-ins`, {
    credentials: 'include',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw recordApiRequestId(new Error(`Failed to list desktop sign-ins: ${response.status}`), response);
  }
  const body = (await response.json()) as { signIns: DesktopSignIn[] };
  return body.signIns;
};

const revokeDesktopSignIn = async (signInId: string): Promise<void> => {
  const response = await fetch(
    `${ENV.TAU_API_URL}/v1/account/desktop-sign-ins/${encodeURIComponent(signInId)}/revoke`,
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok && response.status !== 404) {
    throw recordApiRequestId(new Error(`Failed to end the desktop sign-in: ${response.status}`), response);
  }
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/**
 * The account's Tau Desktop sign-ins, each with Sign out (operator ruling D5=B: the web's list of signed-in apps is
 * the after-the-fact signal for a desktop sign-in). Web only: the desktop reaches this page through its hand-off row.
 *
 * @returns The settings group.
 */
export function DesktopSignIns(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: listDesktopSignIns,
    meta: { handlesErrorLocally: true },
  });
  const revoke = useMutation({
    mutationFn: revokeDesktopSignIn,
    async onSettled() {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <SettingsGroup title='Tau Desktop'>
      {isPending ? (
        <div role='status' aria-busy='true' aria-label='Loading Tau Desktop sign-ins'>
          <div className='flex items-center justify-between gap-4 py-3.5'>
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-8 w-20 rounded-md' />
          </div>
        </div>
      ) : isError ? (
        <div role='alert'>
          <SettingsRow
            title={
              <>
                <CircleAlert aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                Couldn’t load your Tau Desktop sign-ins.
              </>
            }
            control={
              <Button
                variant='outline'
                disabled={isFetching}
                onClick={async () => {
                  await refetch();
                }}
              >
                {isFetching ? <Spinner /> : <RefreshCw aria-hidden='true' />}
                Try again
              </Button>
            }
          />
        </div>
      ) : data.length === 0 ? (
        <SettingsRow title='Tau Desktop is not signed in to this account.' />
      ) : (
        data.map((signIn) => (
          <SettingsRow
            key={signIn.id}
            title={
              <>
                <MonitorSmartphone aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
                {signIn.client}
              </>
            }
            description={`Signed in ${dateFormat.format(new Date(signIn.signedInAt))} · Last active ${dateFormat.format(new Date(signIn.lastActiveAt))} · Ends ${dateFormat.format(new Date(signIn.endsAt))}`}
            control={
              <Button
                variant='outline'
                disabled={revoke.isPending}
                onClick={() => {
                  revoke.mutate(signIn.id);
                }}
              >
                {revoke.isPending && revoke.variables === signIn.id ? <Spinner /> : undefined}
                Sign out
              </Button>
            }
          />
        ))
      )}
    </SettingsGroup>
  );
}
