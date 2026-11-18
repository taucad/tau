import type { ReactNode } from 'react';
import { SettingsSectionsProvider } from '@taucad/settings-ui/components/settings/settings-item';
import { settingsSections } from '#components/settings/settings-registry.js';

/**
 * Offers the settings below it only as this deployment does: the catalogue after the Tau Cloud, desktop and
 * build-time flag gates, so a row this build does not offer renders nothing.
 *
 * @param props - The settings to gate.
 * @returns The provider.
 */
export function DeploymentSettingsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return <SettingsSectionsProvider sections={settingsSections}>{children}</SettingsSectionsProvider>;
}
