import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { PersonSettingsProvider } from '@taucad/settings-ui/components/settings/person-settings';
import type { PersonSettings } from '@taucad/settings-ui/components/settings/person-settings';
import { useAnalytics } from '#hooks/use-analytics.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import { osClass } from '#telemetry/platform-class.js';

/**
 * Hands this device's person record, the onboarding events, analytics and the OS class to the person-record settings
 * (Settings → Viewer, Settings → Agents' Setup answers row) in `@taucad/settings-ui`.
 *
 * @param props - The settings that read them.
 * @returns The provider.
 */
export function PersonSettingsHost({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const { profile, viewer, writeProfile, writeViewer } = usePersonRecord();
  const telemetry = useOnboardingTelemetry();
  const analytics = useAnalytics();
  const value = useMemo<PersonSettings>(
    () => ({ profile, viewer, writeProfile, writeViewer, telemetry, analytics, osClass }),
    [profile, viewer, writeProfile, writeViewer, telemetry, analytics],
  );
  return <PersonSettingsProvider value={value}>{children}</PersonSettingsProvider>;
}
