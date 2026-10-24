import { useSyncExternalStore } from 'react';
import {
  buildId,
  isReloadOffered,
  readSupersedingBuildId,
  subscribeReloadOffer,
  subscribeSupersedingBuildId,
} from '#filesystem/build-skew.js';
import { isReloadPromptShown, readReloadState, subscribeReloadState } from '#lib/stale-build-recovery.js';
import type { ReloadState } from '#lib/stale-build-recovery.js';

const serverSnapshot = (): number => buildId;
const serverOffer = (): boolean => false;

const serverReloadState = (): ReloadState => 'idle';

/**
 * Whether the reload prompt shows (`#filesystem/build-skew`, {@link isReloadPromptShown}), for every
 * surface that shows it.
 *
 * @returns `true` while another bundle owns storage or a deploy replaced this build, and the page is
 * not already reloading on its own.
 */
export const useReloadOffered = (): boolean => {
  const offered = useSyncExternalStore(subscribeReloadOffer, isReloadOffered, serverOffer);
  const reloadState = useSyncExternalStore(subscribeReloadState, readReloadState, serverReloadState);
  return isReloadPromptShown(offered, reloadState);
};

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
