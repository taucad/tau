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
 * - The server names another build: the tab is superseded by that build. It asks
 *   `serverConfirmations` more times, a `peerRecheckDelay` apart, in case an edge was
 *   answering for a build it is leaving, and resumes if the server then names its build.
 * - No answer: the peer's word stands and the tab is superseded by it, but only
 *   until the server answers. The tab asks again every `peerRecheckDelay` and on the
 *   next announcement; when the server then names this build, the tab resumes.
 * - No build endpoint (desktop and `tau serve` answer with their SPA document): the
 *   newer announcement wins, as it did before, and nothing is asked again.
 *
 * A tab answers older announcements while it still writes, so the older tab stops;
 * once superseded it stays silent and a live tab answers instead.
 *
 * A peer's `live` claim is checked the same way, never taken on trust. Once the
 * server has spoken, its build outranks anything a tab says.
 *
 * A deploy noticed in a lone tab (`#lib/stale-build-recovery`) only offers the
 * reload: no other bundle shares storage, so writes go on until the user reloads.
 */

import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';
import { askLiveBuild, readBuildId } from '#lib/build-identity.js';
import type { LiveBuildAnswer } from '#lib/build-identity.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** This build's timestamp (`#lib/build-identity`); `0` in a context without one. */
export const buildId: number = readBuildId();

/** Where word of the superseding build came from: another tab, or the server, which is the authority. */
type BuildSource = 'tab' | 'server';

type Superseding = { readonly buildId: number; readonly source: BuildSource };

/**
 * Where this tab stands. One phase at a time, each with its own timer:
 *
 * - `idle`: this tab writes and offers nothing.
 * - `offered`: a deploy replaced this build in a lone tab; the reload is offered, writes go on.
 * - `provisional`: a peer announced another build; writes stop until the server answers, then the
 *   tab returns to `resumeTo` if the claim does not stand.
 * - `peer-superseded`: only a peer's word supersedes this tab (no server answer). With `recheck`
 *   (the server could not be reached) it asks again every `peerRecheckDelay`.
 * - `server-confirming`: the server named another build; it asks `checksLeft` more times in case an
 *   edge was answering for a build it is leaving.
 * - `server-superseded`: the server's word stands; nothing is asked again.
 *
 * `superseding` is the build the prompt names, kept across phases: the server's word outranks a tab's.
 */
type SkewPhase =
  | { readonly phase: 'idle' }
  | { readonly phase: 'offered' }
  | { readonly phase: 'provisional'; readonly resumeTo: 'idle' | 'offered' }
  | { readonly phase: 'peer-superseded'; readonly claimedBuildId: number; readonly recheck: boolean }
  | { readonly phase: 'server-confirming'; readonly checksLeft: number }
  | { readonly phase: 'server-superseded' };

type SkewState = SkewPhase & { readonly superseding: Superseding | undefined };

/** Something that moves the state: a server answer, a peer's claim or an offer. */
type SkewEvent =
  | { readonly type: 'server-names'; readonly buildId: number }
  | { readonly type: 'offer'; readonly buildId: number }
  | { readonly type: 'peer-claim' }
  | { readonly type: 'answer'; readonly answer: LiveBuildAnswer; readonly claimedBuildId: number };

/** Milliseconds between server checks while this tab is superseded only on a peer's word. */
export const peerRecheckDelay = 30_000;

/**
 * Rechecks after a server answer named another build. During a deploy or rollback an edge may
 * briefly answer for the build it is leaving, so the tab asks again before the answer stands;
 * writes stay stopped meanwhile.
 */
export const serverConfirmations = 2;

const idle: SkewState = { phase: 'idle', superseding: undefined };

let state: SkewState = idle;
/** Bumped on each phase change, so a server answer asked for an earlier phase is not applied to this one. */
let epoch = 0;
let phaseTimer: ReturnType<typeof setTimeout> | undefined;

const writeStopTopic = new Topic<void>({ name: 'build-skew' });
const reloadOfferTopic = new Topic<void>({ name: 'build-reload-offer' });
const supersedingBuildTopic = new Topic<void>({ name: 'superseding-build' });
const liveBuildConfirmedTopic = new Topic<void>({ name: 'live-build-confirmed' });

const stopsWrites = (current: SkewState): boolean => current.phase !== 'idle' && current.phase !== 'offered';

/** Writes have stopped on a word that stands (a peer's unanswered claim, or the server's): not merely provisional. */
const hasStopped = (current: SkewState): boolean =>
  current.phase === 'peer-superseded' || current.phase === 'server-confirming' || current.phase === 'server-superseded';

const offers = (current: SkewState): boolean =>
  current.phase === 'offered' ||
  (current.phase === 'provisional' && current.resumeTo === 'offered') ||
  hasStopped(current);

const supersedingOf = (current: SkewState): number => current.superseding?.buildId ?? buildId;

/** `true` while durable writes must stop: another bundle owns storage, or may (provisionally). Reads are unaffected. */
export const isBuildSuperseded = (): boolean => stopsWrites(state);

/** `true` while the reload is offered: another bundle owns storage, or a deploy replaced this build. */
export const isReloadOffered = (): boolean => offers(state);

/** `true` once writes have stopped on a word that stands: not while a peer's claim awaits the server, nor for an offer alone. */
export const haveWritesStopped = (): boolean => hasStopped(state);

/** The superseding build after `source` names `otherBuildId`: the server outranks a tab, a newer tab an earlier one. */
const nameSuperseding = (
  current: Superseding | undefined,
  otherBuildId: number,
  source: BuildSource,
): Superseding | undefined => {
  if (source === 'server') {
    return { buildId: otherBuildId, source };
  }
  return current === undefined || (current.source === 'tab' && otherBuildId > current.buildId)
    ? { buildId: otherBuildId, source }
    : current;
};

/** The single transition function: the next state for `event`, or `current` when nothing changes. */
const reduce = (current: SkewState, event: SkewEvent): SkewState => {
  switch (event.type) {
    case 'server-names': {
      return { ...current, superseding: nameSuperseding(current.superseding, event.buildId, 'server') };
    }
    case 'offer': {
      const superseding =
        event.buildId === buildId ? current.superseding : nameSuperseding(current.superseding, event.buildId, 'server');
      if (current.phase === 'idle') {
        return { phase: 'offered', superseding };
      }
      if (current.phase === 'provisional') {
        return { phase: 'provisional', resumeTo: 'offered', superseding };
      }
      return { ...current, superseding };
    }
    case 'peer-claim': {
      return current.phase === 'idle' || current.phase === 'offered'
        ? { phase: 'provisional', resumeTo: current.phase, superseding: current.superseding }
        : current;
    }
    case 'answer': {
      return settle(current, event.answer, event.claimedBuildId);
    }
  }
};

/** Act on the server's answer about which build is live (`#lib/build-identity`). */
const settle = (current: SkewState, answer: LiveBuildAnswer, claimedBuildId: number): SkewState => {
  if (answer === buildId) {
    // The server named this build live: whatever rested on a peer's word or an older deploy is void.
    return idle;
  }
  if (current.phase === 'server-superseded') {
    return typeof answer === 'number' ? { ...current, superseding: { buildId: answer, source: 'server' } } : current;
  }
  if (current.phase === 'server-confirming') {
    // Each check counts down, answered or not: the server's earlier word stands until one names this build.
    const superseding: Superseding | undefined =
      typeof answer === 'number' ? { buildId: answer, source: 'server' } : current.superseding;
    const checksLeft = current.checksLeft - 1;
    return checksLeft > 0
      ? { phase: 'server-confirming', checksLeft, superseding }
      : { phase: 'server-superseded', superseding };
  }
  if (typeof answer === 'number') {
    // The first answer naming another build, however the question came about, enters the confirmations.
    return {
      phase: 'server-confirming',
      checksLeft: serverConfirmations,
      superseding: { buildId: answer, source: 'server' },
    };
  }
  /* Without the server's word only a newer build stops this tab, as before there was a server to
   * ask: a peer claiming an older build is live never does (no endpoint on desktop or `tau serve`,
   * or a server that cannot be reached). */
  if (claimedBuildId < buildId) {
    return current.phase === 'provisional' ? { phase: current.resumeTo, superseding: current.superseding } : current;
  }
  const claimed =
    current.phase === 'peer-superseded' ? Math.max(current.claimedBuildId, claimedBuildId) : claimedBuildId;
  return {
    phase: 'peer-superseded',
    claimedBuildId: claimed,
    recheck: answer === 'unreachable',
    superseding: nameSuperseding(current.superseding, claimedBuildId, 'tab'),
  };
};

/** A tab whose build the server confirmed live; whoever hears it checks with the server in turn. */
type LiveAnnouncement = { readonly buildId: number; readonly live: true };

const isLiveAnnouncement = (message: unknown): message is LiveAnnouncement =>
  typeof message === 'object' && message !== null && 'live' in message && message.live === true;

const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);

/** Ask the server which build is live and apply the answer, unless the phase changed while it was asked. */
const askServer = async (claimedBuildId: number): Promise<void> => {
  const askedIn = epoch;
  const answer = await askLiveBuild();
  if (askedIn === epoch) {
    dispatch({ type: 'answer', answer, claimedBuildId });
  }
};

/** The timer a phase runs while it lasts: rechecks for a peer's unanswered word and for the confirmations. */
const startPhaseTimer = (current: SkewState): void => {
  const claimedBuildId =
    current.phase === 'peer-superseded' && current.recheck
      ? current.claimedBuildId
      : current.phase === 'server-confirming'
        ? supersedingOf(current)
        : undefined;
  if (claimedBuildId === undefined) {
    return;
  }
  phaseTimer = setTimeout(() => {
    phaseTimer = undefined;
    // async-iife: bootstrap -- a timer cannot await; the check acts on its own.
    void askServer(claimedBuildId);
  }, peerRecheckDelay);
};

/** Apply `event`, run the new phase's timer, and tell each subscriber whose derived value changed. */
const dispatch = (event: SkewEvent): void => {
  const before = state;
  const next = reduce(before, event);
  if (next === before) {
    return;
  }
  state = next;
  // A phase entered again (another check, a later unanswered recheck) restarts its timer too.
  if (next.phase !== before.phase || event.type === 'answer') {
    epoch += 1;
    clearTimeout(phaseTimer);
    phaseTimer = undefined;
    startPhaseTimer(next);
  }
  if (supersedingOf(next) !== supersedingOf(before)) {
    supersedingBuildTopic.emit();
  }
  if (stopsWrites(next) !== stopsWrites(before)) {
    writeStopTopic.emit();
  }
  // The offer topic also marks when writes stop for good, which makes an offer urgent (`BrowserUpdate`).
  if (offers(next) !== offers(before) || hasStopped(next) !== hasStopped(before)) {
    reloadOfferTopic.emit();
  }
  if (next === idle) {
    channel?.postMessage({ buildId, live: true } satisfies LiveAnnouncement);
    liveBuildConfirmedTopic.emit();
  }
};

/**
 * Record the build the server renders pages for, as soon as it is known, so the
 * prompt names it (a rollback included) before anything is decided. When it names
 * this build, whatever an earlier answer or a peer left behind is withdrawn.
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function recordLiveBuild(liveBuildId: number): void {
  dispatch(
    liveBuildId === buildId
      ? { type: 'answer', answer: liveBuildId, claimedBuildId: liveBuildId }
      : { type: 'server-names', buildId: liveBuildId },
  );
}

/**
 * Offer the reload into a build a deploy put live, without stopping writes: in a
 * lone tab no other bundle shares storage (`#lib/stale-build-recovery`).
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function offerReload(liveBuildId: number): void {
  dispatch({ type: 'offer', buildId: liveBuildId });
}

/** Settle a peer's claim that another build owns storage, stopping writes until the server answers. */
const checkPeerClaim = async (claimedBuildId: number): Promise<void> => {
  if (state.phase === 'server-confirming' || state.phase === 'server-superseded') {
    return;
  }
  dispatch({ type: 'peer-claim' });
  await askServer(claimedBuildId);
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
      /* While this tab still writes, an older tab must hear it and stop, or two bundles write (DF20),
       * even when a deploy already replaced this build. Once its own writes have stopped it is not the
       * build to vouch for; a live tab answers instead. */
      if (!hasStopped(state)) {
        channel.postMessage(buildId);
      }
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
  clearTimeout(phaseTimer);
  phaseTimer = undefined;
};

/**
 * The build that superseded this one: the build the server named, or else the newest heard
 * from any tab. A rollback names an older build. This tab's own id while nothing superseded it.
 */
export const readSupersedingBuildId = (): number => supersedingOf(state);

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

/**
 * Subscribe to each change of the reload offer ({@link isReloadOffered}) and of whether writes have
 * stopped for good ({@link haveWritesStopped}). The offer is withdrawn when the server names this build.
 */
export const subscribeReloadOffer = (listener: () => void): (() => void) => {
  return reloadOfferTopic.subscribe(listener);
};

/**
 * Subscribe to each time the server names this build live after something had said otherwise: a
 * deploy's offer withdrawn, a rollback ended, a peer's claim refuted (`#lib/stale-build-recovery`
 * then decides every failure a deploy explained as genuine).
 */
export const subscribeLiveBuildConfirmed = (listener: () => void): (() => void) => {
  return liveBuildConfirmedTopic.subscribe(listener);
};
