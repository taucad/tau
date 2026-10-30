import { useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';
import { useSession } from '@better-auth-ui/react';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { CookiePreferencesDialog } from '#components/cookie-preferences.js';
import { CloudAccountClosure } from '#cloud/settings-billing.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { useTelemetryPurposes } from '#hooks/use-telemetry-purposes.js';
import type { TelemetryPurpose } from '#hooks/use-telemetry-purposes.js';
import { telemetryCopy, useTelemetrySwitch } from '#hooks/use-telemetry-switch.js';
import { authClient } from '#lib/auth-client.js';
import { legalUrl } from '#lib/legal-url.js';

function LearnMore(): React.JSX.Element {
  return (
    <a
      href={legalUrl('privacy#9.2.1-ai-service-improvement')}
      target='_blank'
      rel='noopener noreferrer'
      className='underline hover:text-foreground'
    >
      Learn more
    </a>
  );
}

/**
 * The recording purposes this one switch grants. Ratings are asked for when the user rates, and incident review per
 * support report, so neither rides on it; turning the switch off also withdraws the rating grant.
 */
const improvementPurposes: readonly TelemetryPurpose[] = ['summary', 'content', 'reuse', 'training'];

/**
 * Whether the owner's chats may improve the service. The server answers with the effective consent: on by default for
 * Free, off for a paid plan until its owner turns it on here. Turning it on or off also records an explicit decision
 * for each improvement purpose once a recording notice is in force; the Free default alone records nothing.
 */
function ImproveServiceRow(): React.JSX.Element {
  const { data: session } = useSession(authClient);
  const isSignedIn = session !== null && session !== undefined;
  const { preferences, isLoading, error, updatePreferences, isUpdating } = usePrivacyPreferences({
    enabled: isSignedIn,
  });
  const purposes = useTelemetryPurposes();

  return (
    <SettingsRow
      settingId='improve-service'
      title='Improve the service for everyone'
      info={
        <>
          <p>Covers your chats, the designs Tau generates for you and summaries of agent tasks.</p>
          <p>On by default on the free plan. Off on paid plans until you turn it on.</p>
          <p>Rating a reply shares that rating and the reply it rates.</p>
        </>
      }
      description={
        isSignedIn ? (
          error ? (
            'Couldn’t load this setting. Check your connection and refresh.'
          ) : (
            <>
              Control whether your chats are used for improving the service. <LearnMore />
            </>
          )
        ) : (
          'Sign in to choose'
        )
      }
      control={
        <Switch
          aria-label='Improve the service for everyone'
          checked={preferences?.allowsAiTraining === true}
          disabled={!isSignedIn || isLoading || Boolean(error) || isUpdating || purposes.isDeciding}
          onCheckedChange={async (checked) => {
            updatePreferences({ allowsAiTraining: checked });
            if (!purposes.canDecide) {
              return;
            }
            const decided: readonly TelemetryPurpose[] = checked
              ? improvementPurposes
              : [...improvementPurposes, 'feedback'];
            try {
              await purposes.decide(decided.map((purpose) => ({ purpose, granted: checked })));
            } catch {
              /* A refused decision refetches the server's answer, which the next render shows. */
            }
          }}
        />
      }
    />
  );
}

/**
 * Data controls: every choice about what Tau collects, keeps and uses, and closing the account.
 */
export function DataControlsSettings(): React.JSX.Element {
  const telemetrySwitch = useTelemetrySwitch();
  const [isCookiePreferencesOpen, setIsCookiePreferencesOpen] = useState(false);

  return (
    <div className='flex flex-col gap-6 pb-6'>
      <SettingsGroup>
        {/* Works signed out, so it reads no account preference; usage metrics are not training data. */}
        <SettingsRow
          settingId='usage-diagnostics'
          title={telemetryCopy.label}
          info={telemetrySwitch.details.map((line) => (
            <p key={line}>{line}</p>
          ))}
          description={telemetrySwitch.forcedOff ? telemetryCopy.forcedOff : telemetryCopy.description}
          control={
            <Switch
              aria-label={telemetryCopy.label}
              checked={telemetrySwitch.checked}
              disabled={telemetrySwitch.pending || telemetrySwitch.forcedOff}
              onCheckedChange={telemetrySwitch.onCheckedChange}
            />
          }
        />
        <ImproveServiceRow />
        <SettingsRow
          settingId='cookie-preferences'
          title='Cookie preferences'
          description='Choose whether Tau uses optional analytics'
          control={
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setIsCookiePreferencesOpen(true);
              }}
            >
              Manage
            </Button>
          }
        />
      </SettingsGroup>
      <CloudAccountClosure />
      <CookiePreferencesDialog isOpen={isCookiePreferencesOpen} onOpenChange={setIsCookiePreferencesOpen} />
    </div>
  );
}
