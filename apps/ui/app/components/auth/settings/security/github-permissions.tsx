import { useAuth, useListAccounts } from '@better-auth-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';
import { SettingsRow } from '#components/settings/settings-item.js';
import { LinkedAccount } from '#components/auth/settings/security/linked-account.js';
import { getGithubGistCapability, setGithubGistEnabled } from '#lib/share-providers.js';

/**
 * GitHub sign-in and its provider-verified Gist access, as two rows of the sign-in methods group.
 *
 * Repository access is a separate GitHub App connection and lives under Repositories.
 */
export function GithubPermissions(): React.JSX.Element {
  const { authClient } = useAuth();
  const { data: accounts } = useListAccounts(authClient);
  const account = accounts?.find(({ providerId }) => providerId === 'github');
  const queryClient = useQueryClient();
  const capability = useQuery({
    queryKey: ['github', 'gist-capability', account?.id],
    queryFn: getGithubGistCapability,
    enabled: accounts !== undefined,
    retry: false,
  });
  const useGists = useMutation({
    mutationFn: setGithubGistEnabled,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['github'] });
    },
  });
  const granted = capability.data?.grantedScopes.includes('gist') === true;
  const enabled = capability.data?.enabled === true;
  return (
    <>
      <LinkedAccount account={account} provider='github' />
      <SettingsRow
        settingId='github-permissions'
        title='Gist sharing'
        description={
          capability.isPending ? (
            <span role='status' aria-busy='true'>
              Checking GitHub…
            </span>
          ) : capability.error ? (
            <span role='alert'>GitHub access could not be checked.</span>
          ) : capability.data.status === 'reconnect-required' ? (
            'Reconnect GitHub to share Gists'
          ) : granted ? (
            enabled ? (
              'Share projects as GitHub Gists'
            ) : (
              'Off · Existing Gists stay on GitHub'
            )
          ) : (
            'Not granted yet · GitHub asks on your first share'
          )
        }
        control={
          <>
            {capability.error ? (
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  void capability.refetch();
                }}
              >
                Try again
              </Button>
            ) : null}
            {account && capability.data ? (
              <Button asChild variant='outline' size='sm'>
                <a href={capability.data.authorizationUrl} target='_blank' rel='noopener noreferrer'>
                  Review on GitHub
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : null}
            {granted ? (
              <Switch
                aria-label='Gist sharing'
                checked={enabled}
                disabled={useGists.isPending}
                onCheckedChange={(checked) => {
                  useGists.mutate(checked);
                }}
              />
            ) : null}
          </>
        }
      >
        {useGists.error ? (
          <p role='alert' className='text-xs text-destructive'>
            {useGists.error.message}
          </p>
        ) : null}
      </SettingsRow>
    </>
  );
}
