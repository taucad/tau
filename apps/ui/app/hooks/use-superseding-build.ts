import { useSyncExternalStore } from 'react';
import {
  buildId,
  isReloadOffered,
  readSupersedingBuildId,
  subscribeReloadOffer,
  subscribeSupersedingBuildId,
} from '#filesystem/build-skew.js';

const serverSnapshot = (): number => buildId;
const serverOffer = (): boolean => false;

/**
 * Whether the reload is offered (`#filesystem/build-skew`), for every surface that shows the prompt.
 *
 * @returns `true` while another bundle owns storage or a deploy replaced this build.
 */
export const useReloadOffered = (): boolean => useSyncExternalStore(subscribeReloadOffer, isReloadOffered, serverOffer);

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
