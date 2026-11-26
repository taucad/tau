import type { ReactNode } from 'react';
import { SettingsSectionsProvider } from '@taucad/settings-ui/components/settings/settings-item';
import { settingsSectionsFor, withFolderAccess } from '#components/settings/settings-registry.js';
import { useHasFolderAccess } from '#hooks/use-has-folder-access.js';
import { useDeploymentMode } from '#cloud/use-deployment-mode.js';

/**
 * Offers the settings below it only as this deployment does: the catalogue after the Tau Cloud, desktop and
 * build-time flag gates, and without Workspaces where no folder can be connected, so a row this host does not offer
 * renders nothing. The Tau Cloud rows follow the display
 * mode (adaptive app deployment mode W4).
 *
 * @param props - The settings to gate.
 * @returns The provider.
 */
export function DeploymentSettingsProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const sections = withFolderAccess(settingsSectionsFor(useDeploymentMode().state === 'funded'), useHasFolderAccess());
  return <SettingsSectionsProvider sections={sections}>{children}</SettingsSectionsProvider>;
}
