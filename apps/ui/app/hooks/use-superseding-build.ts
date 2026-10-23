import { useSyncExternalStore } from 'react';
import { buildId, readSupersedingBuildId, subscribeSupersedingBuildId } from '#filesystem/build-skew.js';

const serverSnapshot = (): number => buildId;

/**
 * The build every reload prompt names (`#filesystem/build-skew`), and whether it is a
 * rollback to an older build rather than an update.
 *
 * @returns The superseding build id (this build's own while nothing superseded it) and
 * whether it is older than this build.
 */
export const useSupersedingBuild = (): { readonly supersedingBuildId: number; readonly isRolledBack: boolean } => {
  const supersedingBuildId = useSyncExternalStore(subscribeSupersedingBuildId, readSupersedingBuildId, serverSnapshot);
  return { supersedingBuildId, isRolledBack: supersedingBuildId < buildId };
};
