import { providerIcons, useAuth, useListAccounts } from '@better-auth-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import { SettingsItem } from '#components/settings/settings-item.js';
import { LinkedAccount } from '#components/auth/settings/security/linked-account.js';
import { getGithubGistCapability, setGithubGistEnabled } from '#lib/share-providers.js';
import { githubConnections, githubErrorMessage } from '#lib/github-connections.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';

/** The independent OAuth and repository App connections, with provider-verified Gist access. */
export function GithubPermissions(): React.JSX.Element {
  const { authClient } = useAuth();
  const { data: accounts } = useListAccounts(authClient);
  const account = accounts?.find(({ providerId }) => providerId === 'github');
  const settings = useSettingsDialog();
  const queryClient = useQueryClient();
  const capability = useQuery({
    queryKey: ['github', 'gist-capability', account?.id],
    queryFn: getGithubGistCapability,
    enabled: accounts !== undefined,
    retry: false,
  });
  const connections = useQuery({ queryKey: ['github', 'connections'], queryFn: githubConnections.list, retry: false });
  const useGists = useMutation({
    mutationFn: setGithubGistEnabled,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['github'] });
    },
  });
  const GithubIcon = providerIcons.github;
  const granted = capability.data?.grantedScopes.includes('gist') === true;
  const enabled = capability.data?.enabled === true;
  return (
    <SettingsItem settingId='github-permissions'>
      <div className='flex flex-col gap-4 md:gap-6'>
        <section aria-label='GitHub sign-in and Gists'>
          <h2 className='mb-3 text-sm font-semibold'>GitHub sign-in and Gists</h2>
          <Card className='gap-0 p-0'>
            <LinkedAccount account={account} provider='github' />
            <CardContent className='flex flex-col items-start gap-3 border-t p-4'>
              {capability.isPending ? (
                <p role='status' aria-busy='true' className='text-xs text-muted-foreground'>
                  Checking GitHub authorization…
                </p>
              ) : capability.error ? (
                <p role='alert' className='text-xs'>
                  GitHub authorization could not be checked.{' '}
                  <Button
                    variant='link'
                    size='sm'
                    onClick={() => {
                      void capability.refetch();
                    }}
                  >
                    Try again
                  </Button>
                </p>
              ) : (
                <p className='text-xs text-muted-foreground'>
                  {capability.data.status === 'reconnect-required'
                    ? 'Reconnect GitHub before using Gists.'
                    : granted
                      ? `Gist access granted · ${enabled ? 'Sharing enabled in Tau' : 'Sharing off in Tau'}`
                      : 'Gist access not granted. You’ll be asked when you first share a Gist.'}
                </p>
              )}
              <div className='flex flex-wrap gap-2'>
                {account && capability.data ? (
                  <Button
                    asChild
                    variant='outline'
                    size='sm'
                    className='h-auto min-h-8 max-w-full text-left whitespace-normal'
                  >
                    <a href={capability.data.authorizationUrl} target='_blank' rel='noopener noreferrer'>
                      Review authorization on GitHub
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                ) : null}
                {granted ? (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={useGists.isPending}
                    onClick={() => {
                      useGists.mutate(!enabled);
                    }}
                  >
                    {enabled ? 'Turn off Gist sharing' : 'Enable Gist sharing'}
                  </Button>
                ) : null}
              </div>
              {useGists.error ? (
                <p role='alert' className='text-xs'>
                  {useGists.error.message}
                </p>
              ) : null}
              {granted && !enabled ? (
                <p className='text-xs text-muted-foreground'>
                  Existing Gists remain. GitHub still holds your authorization.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
        <section aria-label='GitHub repositories'>
          <h2 className='mb-3 text-sm font-semibold'>GitHub repositories</h2>
          <Card className='p-0'>
            <CardContent className='flex flex-wrap items-start gap-3 p-4'>
              <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'>
                <GithubIcon aria-hidden className='size-4.5' />
              </div>
              <div className='flex min-w-0 flex-1 basis-52 flex-col items-start gap-3'>
                <span className='text-sm leading-tight font-medium'>
                  {connections.isPending
                    ? 'Checking repository connections…'
                    : connections.error
                      ? 'Repository access could not be checked'
                      : connections.data.length > 0
                        ? connections.data.map((connection) => `@${connection.login}`).join(', ')
                        : 'No repository connection'}
                </span>
                {connections.error ? (
                  <p role='alert' className='text-xs'>
                    {githubErrorMessage(connections.error)}
                  </p>
                ) : (
                  <p className='text-xs text-muted-foreground'>
                    Choose which repositories Tau can access. Enable writes for each repository before pushing. This
                    connection is separate from sign-in and Gists.
                  </p>
                )}
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    settings.open('repositories');
                  }}
                >
                  {connections.data?.length ? 'Manage repositories' : 'Connect repositories'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </SettingsItem>
  );
}
