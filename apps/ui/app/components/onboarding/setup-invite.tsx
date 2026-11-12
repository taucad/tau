import { Sparkles, X } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { Heading } from '@taucad/ui/components/heading';
import { useFeature } from '#flags/use-feature.js';
import { useDeviceRecord } from '#preferences/use-device-record.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { setupEntryCopy } from '#components/onboarding/setup-copy.js';
import { setupHref } from '#components/onboarding/setup-entry.js';
import { shouldShowSetupInvite } from '#components/onboarding/should-offer-setup.js';

/**
 * The invite on home (Finding 3, E2): for everyone setup did not open for, until it is dismissed or setup is opened.
 * Dismissal is stored on the device.
 *
 * @returns The invite, or nothing.
 */
export function SetupInvite(): React.JSX.Element | undefined {
  const isOnboardingEnabled = useFeature('onboarding');
  const { onboarding } = usePersonRecord();
  const { device, writeDevice } = useDeviceRecord();
  if (!shouldShowSetupInvite({ isOnboardingEnabled, onboarding, isDismissed: device.inviteDismissed === true })) {
    return undefined;
  }
  return (
    <aside
      className='mx-4 my-4 flex max-w-2xl items-start gap-3 rounded-xl border bg-card p-4 sm:mx-auto'
      aria-labelledby='setup-invite-title'
      data-testid='setup-invite'
    >
      <Sparkles className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
      <div className='flex min-w-0 flex-1 flex-col gap-2'>
        <Heading id='setup-invite-title' level={2} variant='label'>
          {setupEntryCopy.inviteTitle}
        </Heading>
        <p className='text-xs text-muted-foreground'>{setupEntryCopy.inviteBody}</p>
        <Button asChild size='sm' className='self-start'>
          <Link to={setupHref('invite')}>{setupEntryCopy.inviteAction}</Link>
        </Button>
      </div>
      <Button
        variant='ghost'
        size='icon-sm'
        aria-label={setupEntryCopy.inviteDismiss}
        onClick={() => {
          writeDevice({ inviteDismissed: true });
        }}
      >
        <X />
      </Button>
    </aside>
  );
}
