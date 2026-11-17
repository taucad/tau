import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import { version } from '#package.json';

/**
 * Meta config. Contains infrequently changing information about the app.
 *
 * The version-free fields live in `@taucad/ui-core/constants/meta.constants`;
 * this binding adds the two read from the app's `package.json`.
 */
export const metaConfig = {
  ...appMetaConfig,
  /**
   * The version of the app.
   */
  version,
  /**
   * The user agent of the app.
   */
  userAgent: `TauCAD/${version}`,
} as const;
