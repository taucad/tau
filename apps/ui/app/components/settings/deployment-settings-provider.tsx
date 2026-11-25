import type { ReactNode } from 'react';
import { SettingsSectionsProvider } from '@taucad/settings-ui/components/settings/settings-item';
import { settingsSectionsFor } from '#components/settings/settings-registry.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';

/**
 * Offers the settings below it only as this deployment does: the catalogue after the Tau Cloud, desktop and
 * build-time flag gates, so a row this build does not offer renders nothing. The Tau Cloud rows follow the display
 * mode (adaptive app deployment mode W4).
 *
 * @param props - The settings to gate.
 * @returns The provider.
 */
export function DeploymentSettingsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const sections = settingsSectionsFor(useDeploymentMode().state === 'funded');
  return <SettingsSectionsProvider sections={sections}>{children}</SettingsSectionsProvider>;
}
