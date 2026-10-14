import { providerIcons, useAuth, useListAccounts } from '@better-auth-ui/react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent } from '@taucad/ui/components/card';
import { SettingsItem } from '#components/settings/settings-item.js';

/**
 * Where GitHub lists the grant Tau's sign-in holds (R9).
 *
 * Sign-in and Gist access come from Tau's GitHub OAuth App, so the grant sits
 * under GitHub's authorized OAuth Apps. The app's own page,
 * `settings/connections/applications/<client id>`, needs a client id the
 * browser is never sent.
 */
export const githubGrantReviewUrl = 'https://github.com/settings/applications';

/**
 * A way to the GitHub grant behind sign-in and Gist access (R9).
 *
 * GitHub shows its consent page only while the grant lacks a scope, so once
 * Gist access is allowed Tau cannot ask again: the decision is changed by
 * revoking the grant on GitHub, after which Tau asks the next time it needs it.
 * Renders nothing until a GitHub account is linked.
 *
 * @returns The settings entry, or nothing without a linked GitHub account.
 */
export function GithubPermissions(): React.JSX.Element | undefined {
  const { authClient } = useAuth();
  const { data: accounts } = useListAccounts(authClient);
  const account = accounts?.find(({ providerId }) => providerId === 'github');
  if (account === undefined) {
    return undefined;
  }
  const GithubIcon = providerIcons.github;

  return (
    <SettingsItem settingId='github-permissions'>
      <h2 className='mb-3 text-sm font-semibold'>GitHub permissions</h2>
      <Card className='p-0'>
        <CardContent className='flex flex-wrap items-center gap-3 p-4'>
          <div className='flex size-10 shrink-0 items-center justify-center rounded-md bg-muted'>
            <GithubIcon aria-hidden className='size-4.5' />
          </div>
          <div className='flex min-w-0 flex-1 flex-col'>
            <span className='text-sm leading-tight font-medium'>
              {account.scopes.includes('gist') ? 'Sign-in and Gist access' : 'Sign-in access'}
            </span>
            <span className='text-xs text-muted-foreground'>
              Revoke it on GitHub, and Tau asks again the next time it needs it.
            </span>
          </div>
          <Button asChild variant='outline' size='sm' className='shrink-0'>
            <a href={githubGrantReviewUrl} target='_blank' rel='noopener noreferrer'>
              Review GitHub permissions
              <ExternalLink aria-hidden />
            </a>
          </Button>
        </CardContent>
      </Card>
    </SettingsItem>
  );
}
