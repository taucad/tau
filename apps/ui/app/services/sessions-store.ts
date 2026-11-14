/**
 * The app's one sessions registry (S44, A38).
 *
 * Composed here and created by the app runtime as its `sessions` child (D5),
 * never in React, so neither Strict Mode nor a remount below the billing fence
 * builds a second one (B9). `SessionsProvider` hands it down; every reader is
 * a selector over its snapshot.
 *
 * The registry owns *liveness*. Three of a session's four startup regions own a
 * resource outright here: the project's file manager (A6c), compute admission
 * and the agent-host attachment. The fourth, the runtime, is still reported by
 * the subtree that holds the project and editor actors, until A6d makes it a
 * child too. The session still decides when they exist: the project route
 * renders a project's resources iff the registry says it is live, and
 * `closing` completes — flush, lease release — before the registry drops it.
 */

import { Topic } from '@taucad/events';
import { randomUuid } from '@taucad/utils/id';
import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, EventObject } from 'xstate';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';
import { liveProjectBudgetFor, sessionsMachine } from '#machines/sessions.machine.js';
import { isMemoryConstrainedDevice } from '@taucad/ui-core/lib/device-memory-class';
import type {
  SessionsMachineContext,
  SessionsMachineInput,
  SessionsProjectStatus,
} from '#machines/sessions.machine.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import type { ProjectSessionActorRef } from '#machines/project-session.machine.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { faultMessage } from '#runtime/app-runtime-faults.js';
import { openSessionFileManager, trackSessionFileManager } from '#runtime/session-file-manager.js';
import type { SessionFileManager, SessionFileManagerPorts } from '#runtime/session-file-manager.js';
import { registerProjectAgentHost } from '#services/project-agent-host-registration.js';
import type { ProjectAgentHostRegistration } from '#services/project-agent-host-registration.js';

/**
 * One project session's flush and lease work, supplied by the subtree that
 * owns the project's resources.
 *
 * The registry imports no worker and no port: the project route registers
 * these when its session opens and unregisters when it closes, so `closing`
 * calls the live implementation and does nothing when the subtree never came
 * up. `flushSync` is W13's `awaitSyncSettled` seam through the revision
 * client — never a second copy of it.
 */
export type ProjectSessionServices = Readonly<{
  flushProducers: () => Promise<void>;
  flushSync: (boundMilliseconds: number) => Promise<void>;
  cancelRuns: (chatIds: readonly string[]) => Promise<void>;
  closeRuntime: () => Promise<void>;
}>;

const noServices: ProjectSessionServices = {
  flushProducers: async () => undefined,
  flushSync: async () => undefined,
  cancelRuns: async () => undefined,
  closeRuntime: async () => undefined,
};

const services = new Map<string, ProjectSessionServices>();

/**
 * Register the live implementations for one project session.
 *
 * @param projectId - The project whose subtree is registering.
 * @param implementation - What `closing` and `opening.pulling` call.
 * @returns The unregistration, for the subtree's effect cleanup.
 */
export const registerProjectSessionServices = (
  projectId: string,
  implementation: ProjectSessionServices,
): (() => void) => {
  services.set(projectId, implementation);
  return () => {
    if (services.get(projectId) === implementation) {
      services.delete(projectId);
    }
  };
};

const servicesFor = (projectId: string): ProjectSessionServices => services.get(projectId) ?? noServices;

// ---------------------------------------------------------------------------
// Region readiness
// ---------------------------------------------------------------------------

type RegionOutcome = Readonly<{ ready: true } | { ready: false; reason: string }>;

/** The one region the subtree still reports: the project and editor actors, until A6d (A6c made `views` a child). */
type RelayedRegion = 'runtime';

const regionKey = (projectId: string, region: RelayedRegion): string => `${projectId}:${region}`;
const regionOutcomes = new Map<string, RegionOutcome>();
/* One fan-out for every region of every project; the key rides on the event so
 * a session's relay child filters to its own (event-fanout policy). */
const regionTopic = new Topic<{
  readonly key: string;
  readonly outcome: RegionOutcome;
}>({
  name: 'sessions.regions',
});

const publishRegion = (projectId: string, region: RelayedRegion, outcome: RegionOutcome): void => {
  const key = regionKey(projectId, region);
  regionOutcomes.set(key, outcome);
  regionTopic.emit({ key, outcome });
};

/** The project's runtime (project + editor) is up. @public */
export const reportRegionReady = (projectId: string, region: RelayedRegion): void => {
  publishRegion(projectId, region, { ready: true });
};

/** That region could not come up, with the reason the failed row shows. @public */
export const reportRegionFailed = (projectId: string, region: RelayedRegion, reason: string): void => {
  publishRegion(projectId, region, { ready: false, reason });
};

/** Forget what a closed project's subtree last said. @public */
export const forgetProjectRegions = (projectId: string): void => {
  regionOutcomes.delete(regionKey(projectId, 'runtime'));
};

/*
 * The runtime region's relay, until A6d builds the runtime in the session.
 *
 * The subtree reports through `reportRegionReady`; this child turns that report
 * into the machine event and holds the region open for the session's life, so
 * stopping the child is what ends it.
 */
const relayRegion = (region: RelayedRegion) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    const key = regionKey(input.projectId, region);
    const deliver = (outcome: RegionOutcome): void => {
      sendBack(
        outcome.ready ? { type: 'childReady', region } : { type: 'childFailed', region, reason: outcome.reason },
      );
    };
    const unsubscribe = regionTopic.subscribe({
      handler: (event) => {
        deliver(event.outcome);
      },
      interestedIn: (event) => event.key === key,
    });
    const known = regionOutcomes.get(key);
    if (known !== undefined) {
      deliver(known);
    }
    return unsubscribe;
  });

// ---------------------------------------------------------------------------
// The project's file manager (A6c)
// ---------------------------------------------------------------------------

/**
 * Open one project's file manager for its session. The app runtime gives the registry the file-manager host's builder
 * and the wait on its clock (S17 to S19); a composition that runs the registry alone gives none.
 *
 * @public
 */
export type SessionFileManagerOpener = (projectId: string) => SessionFileManager;

/**
 * The file-manager host's shared worker, which a session's file manager is built on (A6c): the worker `rootFiles` holds
 * now, and a listener called after each change. @public
 */
export type SessionFileManagerWorker = Readonly<{
  current: () => Worker | undefined;
  subscribe: (listener: (worker: Worker | undefined) => void) => () => void;
}>;

/**
 * The `fileManager` child: it builds the project's file manager through the host for `/projects/<id>`, owns it for
 * the session's life and closes it when the session stops the child (I23). It tells the session the file manager's
 * ref, then reports the views region each time the file manager comes up, from its snapshot rather than from a mount
 * (I5), and fails the region when the file manager goes to `error`. A build that throws fails the region with its
 * reason.
 *
 * With the host's shared worker it follows `rootFiles`, as the shared-worker gate made the mounted subtree follow it
 * before A6c: it builds only once `rootFiles` holds a worker, so a session opened while the root connects or restarts
 * never starts a second worker on the same store, and when the worker is lost or replaced it closes the file manager
 * built on the old one and builds a fresh one on the new one. A nested file manager never restarts its parent's
 * worker, so the one built on a dead worker would otherwise stay down for the session's life.
 */
const fileManagerRegionOn = (open: SessionFileManagerOpener, worker: SessionFileManagerWorker | undefined) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    let current: Readonly<{ opened: SessionFileManager; release: () => void }> | undefined;

    const closeCurrent = (): void => {
      if (current === undefined) {
        return;
      }
      const { release } = current;
      current = undefined;
      sendBack({ type: 'fileManagerChanged', fileManagerRef: undefined });
      release();
    };

    const openCurrent = (): void => {
      let opened: SessionFileManager;
      try {
        opened = open(input.projectId);
      } catch (error) {
        sendBack({
          type: 'childFailed',
          region: 'views',
          reason: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const fileManager: FileManagerRef = opened.fileManagerRef;
      const untrack = trackSessionFileManager(opened);
      sendBack({ type: 'fileManagerChanged', fileManagerRef: fileManager });
      /* Edge-triggered, as the binding's effect was: one report each time the file manager enters `ready` or `error`. */
      let last: 'ready' | 'error' | undefined;
      const observe = (snapshot: ReturnType<FileManagerRef['getSnapshot']>): void => {
        const now = snapshot.matches('ready') ? 'ready' : snapshot.matches('error') ? 'error' : undefined;
        if (now === 'ready' && last !== 'ready') {
          sendBack({ type: 'childReady', region: 'views' });
        }
        if (now === 'error' && last !== 'error') {
          sendBack({
            type: 'childFailed',
            region: 'views',
            reason: faultMessage(snapshot.context.error, 'file manager error'),
          });
        }
        last = now;
      };
      const subscription = fileManager.subscribe(observe);
      current = {
        opened,
        release: () => {
          subscription.unsubscribe();
          untrack();
          opened.close();
        },
      };
      observe(fileManager.getSnapshot());
    };

    if (worker === undefined) {
      openCurrent();
      return closeCurrent;
    }
    let builtOn = worker.current();
    if (builtOn !== undefined) {
      openCurrent();
    }
    const unsubscribe = worker.subscribe((next) => {
      if (next === builtOn) {
        return;
      }
      builtOn = next;
      closeCurrent();
      if (next !== undefined) {
        openCurrent();
      }
    });
    return () => {
      unsubscribe();
      closeCurrent();
    };
  });

/**
 * The views region of a registry composed with no file-manager host (rows that run the registry alone): no file
 * manager is built, and the region is up at once, as the subtree's report made it up before A6c.
 */
const withoutFileManager = createCallbackLogic<EventObject, { projectId: string }>(({ sendBack }) => {
  sendBack({ type: 'childReady', region: 'views' });
  return undefined;
});

/**
 * Open session file managers through a host builder and a services wait: what the app runtime composes.
 *
 * @param ports - The file-manager host's builder and the wait on the runtime's clock.
 * @returns The opener the registry gives each session's `fileManager` child.
 * @public
 */
export const sessionFileManagerOpener =
  (ports: SessionFileManagerPorts): SessionFileManagerOpener =>
  (projectId) =>
    openSessionFileManager(projectId, ports);

// ---------------------------------------------------------------------------
// Cross-process identity
// ---------------------------------------------------------------------------

/**
 * This document's session epoch (W3c-R4): one id per client session, which
 * names this document's registration with the resident agent host.
 *
 * @public
 */
export const sessionEpoch: string = randomUuid();

// ---------------------------------------------------------------------------
// Compute admission
// ---------------------------------------------------------------------------

/**
 * Compute admission, per live project (brief item 4).
 *
 * The worker holds a *set* of admitted ids; a project's channels are disposed
 * on its own close, never on another project's open. The session is what says
 * "this project is live", so it is what admits and releases.
 */
const computeRegionOn = (sharedWorker: () => Worker | undefined) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    /* Read when the region starts and when it ends: the file-manager host's worker, once `rootFiles` has one (S28). */
    sharedWorker()?.postMessage({
      type: 'computeStoreAdmission',
      projectId: input.projectId,
    });
    sendBack({ type: 'childReady', region: 'compute' });
    return () => {
      sharedWorker()?.postMessage({
        type: 'computeStoreRelease',
        projectId: input.projectId,
      });
    };
  });

const agentHostRegistrations = new Map<string, Promise<ProjectAgentHostRegistration>>();

/** The real browser probe or desktop launcher attachment owned by one session. */
const agentHostRegion = createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
  const registration = registerProjectAgentHost(input.projectId, `${sessionEpoch}:${input.projectId}`);
  agentHostRegistrations.set(input.projectId, registration);
  // async-iife: bootstrap -- `createCallbackLogic` is synchronous; the registration settles through `sendBack`.
  void (async () => {
    try {
      await registration;
      sendBack({ type: 'childReady', region: 'agentHost' });
    } catch (error) {
      sendBack({
        type: 'childFailed',
        region: 'agentHost',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return () => {
    if (agentHostRegistrations.get(input.projectId) !== registration) {
      return;
    }
    agentHostRegistrations.delete(input.projectId);
    // async-iife: bootstrap -- teardown is synchronous and a failed release has nobody to report to.
    void (async () => {
      try {
        const registered = await registration;
        await registered.release();
      } catch {
        // The registration never came up; there is nothing left to release.
      }
    })();
  };
});

// ---------------------------------------------------------------------------
// The registry actor
// ---------------------------------------------------------------------------

const projectSessionOn = ({ sharedWorker, openFileManager, fileManagerWorker }: SessionsRegistryFiles) =>
  projectSessionMachine.provide({
    actors: {
      cancelRuns: createAsyncLogic<void, { projectId: string; runs: readonly string[] }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).cancelRuns(input.runs);
        },
      }),
      flushProducers: createAsyncLogic<void, { projectId: string }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).flushProducers();
        },
      }),
      flushSync: createAsyncLogic<void, { projectId: string; boundMilliseconds: number }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).flushSync(input.boundMilliseconds);
        },
      }),
      releaseAgentHost: createAsyncLogic<void, { projectId: string }>({
        run: async ({ input }) => {
          await servicesFor(input.projectId).closeRuntime();
          const registration = agentHostRegistrations.get(input.projectId);
          if (registration !== undefined) {
            const registered = await registration;
            await registered.release();
            agentHostRegistrations.delete(input.projectId);
          }
        },
      }),
      fileManager:
        openFileManager === undefined ? withoutFileManager : fileManagerRegionOn(openFileManager, fileManagerWorker),
      project: relayRegion('runtime'),
      agentHost: agentHostRegion,
      compute: computeRegionOn(sharedWorker),
    },
  });

/** What a registry root takes from its composition (MC-R4); production passes none. @public */
export type SessionsActorOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>;

/**
 * What the registry's sessions take from the file-manager host. @public
 */
export type SessionsRegistryFiles = Readonly<{
  /** The shared file-manager worker, read when a session's compute region starts and ends (S28). */
  sharedWorker: () => Worker | undefined;
  /** Opens each session's file manager (A6c). Without it the views region is up with no file manager. */
  openFileManager?: SessionFileManagerOpener;
  /**
   * The shared worker each session's file manager is built on (A6c). With it a file manager is built once `rootFiles`
   * holds a worker and rebuilt when the worker is replaced; without it, at once.
   */
  fileManagerWorker?: SessionFileManagerWorker;
}>;

/**
 * The registry's logic with its session children provided: the app runtime's `sessions` child (D5). The runtime gives
 * it the file-manager host's shared worker, which admits and releases each live project's compute (S28), and the
 * opener each session's file manager is built through (A6c).
 *
 * @param files - The shared worker and the session file-manager opener.
 * @returns The registry's logic.
 * @public
 */
export const createSessionsRegistryLogic = (files: SessionsRegistryFiles): typeof sessionsMachine =>
  sessionsMachine.provide({ actors: { projectSession: projectSessionOn(files) } });

/**
 * The registry's logic with no file-manager host: for compositions that run the registry alone.
 *
 * @public
 */
export const sessionsRegistryLogic = createSessionsRegistryLogic({ sharedWorker: () => undefined });

/**
 * The registry's input for this host (PV-S5).
 *
 * Desktop is bounded by memory rather than a count (A35): its budget is the
 * absence of one, and the idle window still applies. A phone or low-memory
 * browser holds one live project (B-08).
 *
 * @returns The input the composition reads once, when it creates the registry.
 * @public
 */
export const sessionsRegistryInput = (): SessionsMachineInput => ({
  budget: liveProjectBudgetFor({ desktop: isDesktopTarget, constrained: isMemoryConstrainedDevice() }),
});

/**
 * Create a registry of its own, unstarted (MC-R4). The app's registry is the runtime's `sessions` child; this root
 * is for compositions that run the registry alone.
 *
 * @param options - The clock, inspector and rejected-event hook for this root, the shared worker its compute
 *   regions admit on (none by default), the session file-manager opener (none by default) and the shared worker its
 *   file managers are built on (none: each is built at once).
 * @returns The registry actor; the caller starts it once.
 * @public
 */
export const createSessionsActor = ({
  sharedWorker,
  openFileManager,
  fileManagerWorker,
  ...options
}: SessionsActorOptions & Partial<SessionsRegistryFiles> = {}): Actor<typeof sessionsMachine> =>
  createActor(
    createSessionsRegistryLogic({
      sharedWorker: sharedWorker ?? (() => undefined),
      ...(openFileManager === undefined ? {} : { openFileManager }),
      ...(fileManagerWorker === undefined ? {} : { fileManagerWorker }),
    }),
    { ...options, input: sessionsRegistryInput() },
  );

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Which projects are live right now, in open order. @public */
export const selectLiveProjectIds = (context: SessionsMachineContext): readonly string[] => Object.keys(context.refs);

/**
 * A session's file manager, as its `fileManager` child reported it (A6c): what the session subtree's provider is a view
 * of.
 *
 * @param snapshot - The session's snapshot.
 * @returns The file manager, or `undefined` before the child reports it, after it stops, or with no host.
 * @public
 */
export const selectProjectSessionFileManager = (
  snapshot: ReturnType<ProjectSessionActorRef['getSnapshot']>,
): FileManagerRef | undefined => snapshot.context.fileManagerRef;

/** One project's session actor, or `undefined` when it is closed. @public */
export const selectProjectSession = (
  context: SessionsMachineContext,
  projectId: string,
): ProjectSessionActorRef | undefined => context.refs[projectId];

/**
 * The coalesced per-project status object W20's `use-sidebar-status.ts` reads.
 *
 * One object per project (S46) — never four machine snapshots per row. W20
 * joins the worker's `RevisionStatus` projection and the chat sessions'
 * `statusChanged` onto this shape; it is named here so the sidebar has one
 * seam rather than a second derivation of the same facts.
 *
 * @public
 */
export type ProjectLivenessStatus = Readonly<{
  projectId: string;
  live: boolean;
  status: SessionsProjectStatus | undefined;
  /** Why it closed, when it is closed: `Closed to save memory`, and so on. */
  closedReason: string | undefined;
  /** What stopped a policy from closing it, when one tried (I24, I25). */
  policyRefusal: string | undefined;
}>;

/**
 * The registry's half of one project's sidebar row.
 *
 * @param context - The registry snapshot's context.
 * @param projectId - The project the row is about.
 * @returns The coalesced liveness facts for that project.
 * @public
 */
export const selectProjectLiveness = (context: SessionsMachineContext, projectId: string): ProjectLivenessStatus => ({
  projectId,
  live: context.refs[projectId] !== undefined,
  status: context.status[projectId],
  closedReason: context.closed[projectId]?.reason,
  policyRefusal: context.refusals[projectId],
});
