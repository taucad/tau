import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { App } from 'electron';

import type { DesktopChannel } from '#main/environment.js';

/** Select channel-owned state before Electron acquires its single-instance lock or opens sessions. */
export const configureDesktopProfile = (
  application: Pick<App, 'getPath' | 'setPath' | 'setName'> & {
    readonly commandLine: Pick<App['commandLine'], 'getSwitchValue'>;
  },
  channel: DesktopChannel,
): void => {
  application.setName(channel === 'staging' ? 'Tau Staging' : 'Tau');
  if (channel === 'staging') {
    const explicitUserData = application.commandLine.getSwitchValue('user-data-dir');
    const directory = explicitUserData
      ? resolve(explicitUserData)
      : join(application.getPath('appData'), 'Tau Staging');
    mkdirSync(directory, { recursive: true });
    application.setPath('userData', directory);
    application.setPath('sessionData', directory);
  }
};
