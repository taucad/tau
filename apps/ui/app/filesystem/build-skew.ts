/**
 * The app's binding of the build-skew guard (`@taucad/files-ui/filesystem/build-skew`).
 *
 * The guard lives in files-ui; this binding starts the page's one instance with this bundle's identity
 * (`#lib/build-identity`, which reads the build globals and `window.ENV`) when the module loads, as the guard did
 * when it lived here. App readers import it from here, so a suite that mocks this module replaces it for all of
 * them, and a suite that loads this module afresh gets a fresh guard.
 */
import {
  createBuildSkew,
  lookupConfirmDelay as skewLookupConfirmDelay,
  peerRecheckDelay as skewPeerRecheckDelay,
  serverConfirmations as skewServerConfirmations,
} from '@taucad/files-ui/filesystem/build-skew';
import type { ServerVerdict } from '@taucad/files-ui/filesystem/build-skew';
import { askLiveBuild, liveBuildIdTimeout, readBuildId } from '#lib/build-identity.js';

const skew = createBuildSkew({ buildId: readBuildId(), askLiveBuild, liveBuildIdTimeout });

/** This build's timestamp (`#lib/build-identity`); `0` in a context without one. */
export const buildId: number = skew.buildId;

/** Milliseconds between server checks while this tab is superseded only on a peer's word. */
export const peerRecheckDelay: number = skewPeerRecheckDelay;

/** Milliseconds between the confirmations a lookup asks for itself ({@link queryLiveBuild}). */
export const lookupConfirmDelay: number = skewLookupConfirmDelay;

/** Further answers needed before the server's word changes. */
export const serverConfirmations: number = skewServerConfirmations;

/** Milliseconds one lookup ({@link queryLiveBuild}) may take. */
export const lookupBudget: number = skew.lookupBudget;

/** `true` while durable writes must stop: another bundle owns storage, or may (provisionally). Reads are unaffected. */
export const isBuildSuperseded = (): boolean => skew.isBuildSuperseded();

/** `true` while the reload is offered: another bundle owns storage, or a deploy replaced this build. */
export const isReloadOffered = (): boolean => skew.isReloadOffered();

/** `true` once writes have stopped on a word that stands: not while a peer's claim awaits the server, nor for an offer alone. */
export const haveWritesStopped = (): boolean => skew.haveWritesStopped();

/** What the server last said about this build. */
export const readServerVerdict = (): ServerVerdict => skew.readServerVerdict();

/**
 * Ask the server which build is live (`/health/build`) and apply the answers until the verdict settles: the single
 * lookup every consumer shares. Each caller waits at most {@link lookupBudget} from its own call.
 *
 * @returns Once the verdict has settled or the budget passed; read {@link readServerVerdict} for it.
 */
export const queryLiveBuild = async (): Promise<void> => skew.queryLiveBuild();

/**
 * Offer the reload into a build a deploy put live, without stopping writes: in a lone tab no other bundle shares
 * storage (`#lib/stale-build-recovery`).
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function offerReload(liveBuildId: number): void {
  skew.offerReload(liveBuildId);
}

/** Stop listening to other tabs. A page never needs this; tests that load the module afresh do. */
export const closeBuildSkewChannel = (): void => {
  skew.closeBuildSkewChannel();
};

/** The build that superseded this one, or this tab's own id while nothing superseded it. */
export const readSupersedingBuildId = (): number => skew.readSupersedingBuildId();

/** Subscribe to each change of the superseding build. */
export const subscribeSupersedingBuildId = (listener: () => void): (() => void) =>
  skew.subscribeSupersedingBuildId(listener);

/** The prompt shared by every surface that offers the reload. */
export const describeSupersession = (superseding: number): string => skew.describeSupersession(superseding);

/** Subscribe to each change of the durable write stop ({@link isBuildSuperseded}). */
export const subscribeBuildSkew = (listener: () => void): (() => void) => skew.subscribeBuildSkew(listener);

/** Subscribe to each change of the reload offer ({@link isReloadOffered}) and of {@link haveWritesStopped}. */
export const subscribeReloadOffer = (listener: () => void): (() => void) => skew.subscribeReloadOffer(listener);

/** Subscribe to each change of {@link readServerVerdict}. */
export const subscribeServerVerdict = (listener: () => void): (() => void) => skew.subscribeServerVerdict(listener);
