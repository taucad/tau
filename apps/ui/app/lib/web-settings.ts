import { searchParameterName } from '@taucad/ui-core/constants/search-parameter.constants';
import type { SettingsSection } from '@taucad/settings-ui/components/settings/settings-section';
import { shareOrigin } from '#lib/share-origin.js';

/**
 * A setting's page on Tau's website: the settings dialog opened at its section, revealing the setting. Tau Desktop
 * sends the person there for what its sign-in may not change (desktop sign-in ruling D1=A).
 *
 * @param section - The settings section.
 * @param setting - The setting to reveal in it.
 * @returns The absolute URL on the web deployment.
 */
export const webSettingsUrl = (section: SettingsSection, setting?: string): string => {
  const url = new URL('/', shareOrigin());
  url.searchParams.set(searchParameterName.settings, section);
  if (setting !== undefined) {
    url.searchParams.set(searchParameterName.settingsTarget, setting);
  }
  return url.href;
};
