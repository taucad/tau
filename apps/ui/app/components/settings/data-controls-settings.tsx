import { useState } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { AgentObservabilitySettings } from '#components/settings/agent-observability-settings.js';
import { CookiePreferencesDialog } from '#components/cookie-preferences.js';
import { CloudAccountClosure } from '#cloud/settings-billing.js';
import { useCommercialFeatures } from '#cloud/commercial-features.js';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';
import { telemetryCopy, useTelemetrySwitch } from '#hooks/use-telemetry-switch.js';
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

/** Whether the owner's chats may improve the service; paid plans carry a no-train guarantee instead of a choice. */
function ImproveServiceRow(): React.JSX.Element {
  const { preferences, isLoading, error, updatePreferences, isUpdating } = usePrivacyPreferences();
  // T15/AD15: paid tiers carry a contractual no-train guarantee — the projection forces `trainingConsent: false`.
  const { hasNoTrainGuarantee } = useCommercialFeatures();

  const description = hasNoTrainGuarantee ? (
    <>
      Your plan never uses your chats to improve the service. <LearnMore />
    </>
  ) : error ? (
    'Couldn’t load this setting. Check your connection and refresh.'
  ) : (
    <>
      Control whether your chats are used for improving the service. <LearnMore />
    </>
  );

  return (
    <SettingsRow
      settingId='improve-service'
      title='Improve the service for everyone'
      description={description}
      control={
        <Switch
          aria-label='Improve the service for everyone'
          checked={!hasNoTrainGuarantee && preferences?.allowsAiTraining === true}
          disabled={hasNoTrainGuarantee || isLoading || Boolean(error) || isUpdating}
          onCheckedChange={(checked) => {
            updatePreferences({ allowsAiTraining: checked });
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
        {/* Works signed out, so it reads no account preference; usage metrics are not training data, so the
         * no-train guarantee does not replace it. */}
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
      <AgentObservabilitySettings />
      <CloudAccountClosure />
      <CookiePreferencesDialog isOpen={isCookiePreferencesOpen} onOpenChange={setIsCookiePreferencesOpen} />
    </div>
  );
}
