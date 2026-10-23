/**
 * Build-id skew guard (blueprint DF20).
 *
 * Tabs share one IndexedDB, so a tab left open on an older bundle keeps running
 * its own discovery + garbage-collection logic against state a newer bundle
 * writes. During the Phase-3 flat-layout cutover that produced a silent
 * tug-of-war: the old code deleted configs the new code had just re-minted.
 * `versionchange` only guards schema bumps, not app-logic vintage.
 *
 * Every tab announces its build id on boot; a tab that hears a newer one
 * suspends its durable writes at once (reads stay fine) and asks the user to
 * reload. Answering an older announcement with our own id is what lets the
 * *older* tab find out — the newer tab may have booted first.
 *
 * Newer is not always live: after a rollback the server renders an older build,
 * and a tab still on the replaced newer one would otherwise keep superseding every
 * freshly loaded live tab. So the write stop a peer's announcement causes is
 * provisional until the tab has asked the server (`/health/build`) itself:
 *
 * - The server names this tab's build: the stop is lifted and the tab answers
 *   `{ buildId, live: true }`, so the announcer checks in turn and steps aside.
 * - The server names another build: the tab is superseded by that build for good.
 * - No answer: the peer's word stands and the tab is superseded by it.
 *
 * A peer's `live` claim is checked the same way, never taken on trust. Once the
 * server has spoken, its build outranks anything a tab says.
 *
 * A deploy noticed in a lone tab (`#lib/stale-build-recovery`) only offers the
 * reload: no other bundle shares storage, so writes go on until the user reloads.
 */

import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';
import { fetchLiveBuildId, readBuildId } from '#lib/build-identity.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** This build's timestamp (`#lib/build-identity`); `0` in a context without one. */
export const buildId: number = readBuildId();

/** Where word of the superseding build came from: another tab, or the server, which is the authority. */
export type BuildSource = 'tab' | 'server';

/** Another bundle owns storage now: writes stop and the reload is offered, for good. */
let superseded = false;
/** A peer announced another build and the server has not answered yet: writes stop meanwhile. */
let provisional = false;
/** A deploy replaced this build in a lone tab: the reload is offered, writes go on. */
let deployNoticed = false;
let supersedingBuildId = buildId;
let supersedingSource: BuildSource | undefined;
const writeStopTopic = new Topic<void>({ name: 'build-skew' });
const reloadOfferTopic = new Topic<void>({ name: 'build-reload-offer' });
const supersedingBuildTopic = new Topic<void>({ name: 'superseding-build' });

/** `true` while durable writes must stop: another bundle owns storage, or may (provisionally). Reads are unaffected. */
export const isBuildSuperseded = (): boolean => superseded || provisional;

/** `true` once the reload is offered: another bundle owns storage, or a deploy replaced this build. */
export const isReloadOffered = (): boolean => superseded || deployNoticed;

const setProvisional = (next: boolean): void => {
  const before = isBuildSuperseded();
  provisional = next;
  if (isBuildSuperseded() !== before) {
    writeStopTopic.emit();
  }
};

const recordSupersedingBuild = (otherBuildId: number, source: BuildSource): void => {
  const changes =
    source === 'server'
      ? otherBuildId !== supersedingBuildId || supersedingSource !== 'server'
      : // A tab's word never outranks the server's, and only a newer tab outranks an earlier one.
        supersedingSource === undefined || (supersedingSource === 'tab' && otherBuildId > supersedingBuildId);
  if (changes) {
    supersedingBuildId = otherBuildId;
    supersedingSource = source;
    supersedingBuildTopic.emit();
  }
};

const offer = (): void => {
  const before = isReloadOffered();
  deployNoticed = true;
  if (!before) {
    reloadOfferTopic.emit();
  }
};

/**
 * Record the build the server renders pages for, as soon as it is known, so the
 * prompt names it (a rollback included) before anything is decided.
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function recordLiveBuild(liveBuildId: number): void {
  if (liveBuildId !== buildId) {
    recordSupersedingBuild(liveBuildId, 'server');
  }
}

/**
 * Offer the reload into a build a deploy put live, without stopping writes: in a
 * lone tab no other bundle shares storage (`#lib/stale-build-recovery`).
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function offerReload(liveBuildId: number): void {
  recordLiveBuild(liveBuildId);
  offer();
}

/**
 * Mark this build superseded for good by another bundle: writes stop and the reload is offered.
 *
 * @param otherBuildId - The superseding build's id.
 * @param source - Who said so; defaults to another tab, whose word never outranks the server's.
 */
export function markBuildSuperseded(otherBuildId: number, source: BuildSource = 'tab'): void {
  recordSupersedingBuild(otherBuildId, source);
  const wroteBefore = !isBuildSuperseded();
  const offeredBefore = isReloadOffered();
  superseded = true;
  provisional = false;
  if (wroteBefore) {
    writeStopTopic.emit();
  }
  if (!offeredBefore) {
    reloadOfferTopic.emit();
  }
}

/** A tab whose build the server confirmed live; whoever hears it checks with the server in turn. */
type LiveAnnouncement = { readonly buildId: number; readonly live: true };

const isLiveAnnouncement = (message: unknown): message is LiveAnnouncement =>
  typeof message === 'object' && message !== null && 'live' in message && message.live === true;

let liveBuildProbe: Promise<number | undefined> | undefined;

/** One `/health/build` request at a time, shared by the announcements waiting on it. */
const askServer = async (): Promise<number | undefined> => {
  const probe = async (): Promise<number | undefined> => {
    try {
      return await fetchLiveBuildId();
    } catch {
      return undefined;
    } finally {
      liveBuildProbe = undefined;
    }
  };
  liveBuildProbe ??= probe();
  return liveBuildProbe;
};

const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);

/** Settle a peer's claim that another build owns storage, stopping writes until the server answers. */
const checkPeerClaim = async (claimedBuildId: number): Promise<void> => {
  if (superseded && supersedingSource === 'server') {
    return;
  }
  setProvisional(true);
  const liveBuildId = await askServer();
  if (liveBuildId === buildId) {
    setProvisional(false);
    if (!superseded) {
      channel?.postMessage({ buildId, live: true } satisfies LiveAnnouncement);
    }
    return;
  }
  if (liveBuildId === undefined) {
    markBuildSuperseded(claimedBuildId);
    return;
  }
  markBuildSuperseded(liveBuildId, 'server');
};

if (channel) {
  // Node keeps the event loop alive for an open channel; browsers have no unref.
  (channel as { unref?: () => void }).unref?.();
  channel.addEventListener('message', (event: MessageEvent) => {
    const message: unknown = event.data;
    const isLive = isLiveAnnouncement(message);
    const other = Number(isLive ? message.buildId : message);
    if (!Number.isFinite(other) || other === buildId) {
      return;
    }
    if (!isLive && other < buildId) {
      channel.postMessage(buildId);
      return;
    }
    // async-iife: bootstrap -- a channel listener cannot await; the check acts on its own.
    void checkPeerClaim(other);
  });
  channel.postMessage(buildId);
}

/** Stop listening to other tabs. A page never needs this; tests that load the module afresh do. */
export const closeBuildSkewChannel = (): void => {
  channel?.close();
};

/**
 * The build that superseded this one: the build the server named, or else the newest heard
 * from any tab. A rollback names an older build. This tab's own id while nothing superseded it.
 */
export const readSupersedingBuildId = (): number => supersedingBuildId;

/** Subscribe to each change of the superseding build. */
export const subscribeSupersedingBuildId = (listener: () => void): (() => void) => {
  return supersedingBuildTopic.subscribe(listener);
};

/** The prompt shared by every surface that offers the reload. */
export const describeSupersession = (superseding: number): string =>
  superseding < buildId
    ? 'This version of Tau has been replaced. Reload to continue with the current version.'
    : 'A newer version of Tau is available. Reload to continue with the latest version.';

/** Subscribe to each change of the durable write stop ({@link isBuildSuperseded}). */
export const subscribeBuildSkew = (listener: () => void): (() => void) => {
  return writeStopTopic.subscribe(listener);
};

/** Subscribe to the one-way transition into offering the reload ({@link isReloadOffered}). */
export const subscribeReloadOffer = (listener: () => void): (() => void) => {
  return reloadOfferTopic.subscribe(listener);
};
