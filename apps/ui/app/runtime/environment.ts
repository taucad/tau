/**
 * `environment`: the app runtime's one owner of the page's DOM listeners (app state orchestration charter D4, D5,
 * D26).
 *
 * A callback actor that reports document visibility, window focus and the device's memory class to the runtime root
 * as events; the root folds them and emits each one. The listeners live in this closure, never in a machine's
 * context, and stopping the actor removes them.
 *
 * It is also the only sequencer of the ordered unload flush (D26, A5b). On `hidden` it runs every producer
 * registration and waits for each to settle, then every session registration; on `pagehide` it runs only the session
 * registrations, synchronously; on a desktop quit it runs the producer stage and then asks the registry to quit, whose
 * sessions take their close cuts in their own `closing`. The registrations are held by the {@link UnloadSequencer} the
 * composition builds: actor-owned producers register into it directly, React-owned ones through `useFlushOnClose`.
 *
 * D26 as amended by A7c: a reload or a navigation fires `pagehide` and then `hidden` only as the document goes, and a
 * write first issued there does not reliably land before the page's workers do. So while a producer owes a write
 * ({@link OwedWritesPort}), `beforeunload` runs the producer stage too, as the navigation starts, and no session stage.
 * It never prompts. The listener is held only while a write is owed, so a settled page stays eligible for the
 * back/forward cache, and `hidden`, `pagehide` and a quit still run the whole order.
 *
 * Two reactions to the same DOM events are outside that order and are kept (D26, row S41): the editor document
 * session's synchronous save stays in React, and on a constrained device `hidden` and `pagehide` ask the registry to
 * release memory, whose closes each run a session's whole close sequence. The memory release also runs when focus's
 * route moves to another project (rows S9, S22).
 *
 * The memory class is `isMemoryConstrainedDevice`: the web gives a page no memory-pressure signal, and of its two
 * hints only the coarse-pointer media query can change while the page is open.
 */
import { createCallbackLogic } from 'xstate';
import type { AnyActorRef, CallbackActorLogic } from 'xstate';
import { isMemoryConstrainedDevice } from '@taucad/ui-core/lib/device-memory-class';

/** What `environment` reports. @public */
export type EnvironmentEvent =
  | { readonly type: 'visibilityChanged'; readonly visible: boolean }
  | { readonly type: 'focusChanged'; readonly focused: boolean }
  | { readonly type: 'memoryClassChanged'; readonly constrained: boolean }
  /** The desktop quit hold: whether it shows, and the producer refusal it shows, if any. */
  | { readonly type: 'quitHoldChanged'; readonly held: boolean; readonly error?: string };

/** What `environment` takes from the root: the person's retry of a quit whose producers refused. @public */
export type EnvironmentCommand = { readonly type: 'quitRetried' };

/**
 * The peers `environment` reaches, as the root hands them over (MC-R13): the registry for the quit hold and the memory
 * release, and focus for the project the release keeps. Either may be absent in a host that spawns neither.
 *
 * @public
 */
export type EnvironmentInput = Readonly<{ registry?: AnyActorRef; focus?: AnyActorRef }> | undefined;

/** The DOM objects `environment` listens to: the browser's in the app, a stand-in in tests. @public */
export type EnvironmentHost = Readonly<{
  document: EventTarget & Readonly<{ visibilityState: DocumentVisibilityState; hasFocus: () => boolean }>;
  window: EventTarget;
  /** The `(pointer: coarse)` media query, whose change can move the memory class. */
  coarsePointer: (EventTarget & Readonly<{ matches: boolean }>) | undefined;
  isMemoryConstrained: () => boolean;
}>;

/**
 * Which half of the two-phase unload is running (A38).
 *
 * `hidden` is the real close in a browser: the document is still alive, so a callback can send, await and see an
 * answer. `pagehide` is best-effort: the document is going away and nothing asynchronous will finish, so a callback
 * that has one last thing to say says it there and expects no reply.
 *
 * @public
 */
export type FlushPhase = 'hidden' | 'pagehide';

/** Producer flushes settle before any session's close stage begins. @public */
export type FlushStage = 'producer' | 'session';

/** One registered flush. @public */
export type FlushCallback = (phase: FlushPhase) => void | Promise<void>;

/**
 * The unload registrations and their order (D26). It holds no listener: `environment` is the only caller of
 * {@link UnloadSequencer.hidden} and {@link UnloadSequencer.pagehide}.
 *
 * @public
 */
export type UnloadSequencer = Readonly<{
  /** Add a flush at a stage. @returns Its removal. */
  register: (stage: FlushStage, callback: FlushCallback) => () => void;
  /** Run every producer in the `hidden` phase and wait for each to settle; rejects naming every refusal. */
  flushProducers: () => Promise<void>;
  /** The `hidden` pass: every producer settles, then every session registration runs. */
  hidden: () => Promise<void>;
  /** The `pagehide` pass: every session registration, synchronously, and no producer. */
  pagehide: () => void;
}>;

/** Flatten only presentation; the aggregate keeps its original error tree. */
const refusalMessages = (reason: unknown, fallback: string): string[] =>
  reason instanceof AggregateError && reason.errors.length > 0
    ? reason.errors.flatMap((error: unknown) => refusalMessages(error, fallback))
    : [reason instanceof Error ? reason.message : fallback];

/**
 * Run one session's pagehide flush. The callback starts synchronously; one registrant's throw or rejection is logged
 * and never skips the rest, nor the memory release after them.
 */
const pageHideSafely = async (callback: FlushCallback): Promise<void> => {
  try {
    await callback('pagehide');
  } catch (error) {
    console.error('A session could not flush on pagehide.', error);
  }
};

/**
 * Build the unload sequencer. A plain registry, not an actor: `environment` drives it.
 *
 * @returns The sequencer.
 * @public
 */
export const createUnloadSequencer = (): UnloadSequencer => {
  const registrations = new Set<Readonly<{ stage: FlushStage; callback: FlushCallback }>>();
  /** Run one stage's callbacks in the phase that can still await, and wait for every one to settle. */
  const flushStage = async (
    snapshot: ReadonlyArray<Readonly<{ stage: FlushStage; callback: FlushCallback }>>,
    stage: FlushStage,
  ): Promise<void> => {
    const outcomes = await Promise.allSettled(
      snapshot.filter((registration) => registration.stage === stage).map(async ({ callback }) => callback('hidden')),
    );
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    if (failures.length > 0) {
      const reasons = failures.map((failure) => failure.reason as unknown);
      // The quit hold shows this message: it names what is not saved, not the stage.
      throw new AggregateError(
        reasons,
        [...new Set(reasons.flatMap((reason) => refusalMessages(reason, `${stage} flush failed`)))].join(' '),
      );
    }
  };
  return {
    register: (stage, callback) => {
      const registration = { stage, callback };
      registrations.add(registration);
      return () => {
        registrations.delete(registration);
      };
    },
    flushProducers: async () => flushStage([...registrations], 'producer'),
    hidden: async () => {
      const snapshot = [...registrations];
      await flushStage(snapshot, 'producer');
      await flushStage(snapshot, 'session');
    },
    pagehide: () => {
      for (const registration of registrations) {
        if (registration.stage === 'session') {
          /* Each callback's synchronous part runs here, before the memory release: pagehide can only emit data
           * prepared by hidden and cannot wait for a fresh producer flush. */
          // async-iife: bootstrap -- the document is going; each registrant settles, or logs, on its own.
          void pageHideSafely(registration.callback);
        }
      }
    },
  };
};

/** The desktop quit seam `environment` listens to; the web build's never asks. @public */
export type EnvironmentDesktopQuit = Readonly<{
  onQuitRequested: (handler: (attemptId: string) => void) => () => void;
  reportQuiesced: (attemptId: string, forced: boolean) => void;
}>;

/**
 * Whether a producer owes a write now, and when that changes (A7c, D26's `beforeunload` trigger). The listener reads
 * {@link OwedWritesPort.owes} again on each change.
 *
 * @public
 */
export type OwedWritesPort = Readonly<{
  owes: () => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

/** What `environment` is composed with besides the page. @public */
export type EnvironmentOptions = Readonly<{
  /** The unload registrations it sequences (D26). */
  sequencer?: UnloadSequencer;
  /** Whether a producer owes a write, which holds the `beforeunload` producer stage; none holds none. */
  owedWrites?: OwedWritesPort;
  /** The desktop quit seam; none outside the desktop build. */
  desktopQuit?: EnvironmentDesktopQuit;
}>;

/**
 * The browser's objects, read when the actor starts; `undefined` where there is no document.
 *
 * @returns The host, or `undefined` outside a browser.
 * @public
 */
export const browserEnvironmentHost = (): EnvironmentHost | undefined =>
  typeof document === 'undefined'
    ? undefined
    : {
        document,
        window: globalThis,
        coarsePointer:
          typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia('(pointer: coarse)') : undefined,
        isMemoryConstrained: () => isMemoryConstrainedDevice(),
      };

/** The project focus's route is on, read off its snapshot: the one a memory release keeps. */
const focusKeepOf = (focus: AnyActorRef | undefined): string | undefined => {
  const snapshot = focus?.getSnapshot() as
    | { context?: { request?: { home?: boolean; projectId?: string } } }
    | undefined;
  const request = snapshot?.context?.request;
  return request === undefined || request.home === true ? undefined : request.projectId;
};

/**
 * The desktop quit hold (D31, P49). Main asks; every producer settles first (W15), then every live session runs its own
 * `closing`, which takes its close cut, and the person sees what is being waited for and can cut it short. `quiesced`
 * answers main. The browser needs none of this: `pagehide` is its quit.
 *
 * @returns The hold's teardown.
 */
const holdQuit = ({
  registry,
  report,
  receive,
  sequencer,
  desktopQuit,
}: Readonly<{
  registry: () => AnyActorRef | undefined;
  report: (event: EnvironmentEvent) => void;
  receive: (listener: (event: EnvironmentCommand) => void) => void;
  sequencer: UnloadSequencer | undefined;
  desktopQuit: EnvironmentDesktopQuit | undefined;
}>): (() => void) => {
  let attempt: string | undefined;
  const requestQuit = async (): Promise<void> => {
    const requestId = attempt;
    if (requestId === undefined) {
      return;
    }
    try {
      await sequencer?.flushProducers();
      if (attempt !== requestId) {
        return;
      }
    } catch (error) {
      report({
        type: 'quitHoldChanged',
        held: true,
        error: error instanceof Error ? error.message : 'Pending changes could not be saved.',
      });
      return;
    }
    const sessions = registry();
    if (sessions === undefined) {
      return;
    }
    const snapshot = sessions.getSnapshot() as { status: string; matches: (state: string) => boolean };
    if (snapshot.status === 'done') {
      desktopQuit?.reportQuiesced(requestId, snapshot.matches('forced'));
      report({ type: 'quitHoldChanged', held: false });
      return;
    }
    report({ type: 'quitHoldChanged', held: true });
    sessions.send({ type: 'quit' });
  };
  const quiesced = registry()?.on('quiesced', (event: { forced: boolean }) => {
    if (attempt !== undefined) {
      desktopQuit?.reportQuiesced(attempt, event.forced);
    }
    report({ type: 'quitHoldChanged', held: false });
  });
  const stopQuitRequests = desktopQuit?.onQuitRequested((attemptId) => {
    attempt = attemptId;
    void requestQuit();
  });
  /* `quitRetried` is the one command: the person's retry runs the producer stage again. */
  receive(() => {
    void requestQuit();
  });
  return () => {
    quiesced?.unsubscribe();
    stopQuitRequests?.();
  };
};

/**
 * Build the `environment` callback logic over one host.
 *
 * The registry and focus are the root's `sessions` and `focus` children, handed over as the invoke's input
 * (`EnvironmentInput`); a root composed without them (a test's) runs neither the memory release nor the quit hold.
 *
 * @param readHost - Returns the host when the actor starts; the default reads the browser's.
 * @param options - The unload sequencer, the owed-writes port and the desktop quit seam.
 * @returns The callback logic. It reports the current reading on start and each change after it.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- One owner of the page's listeners: each reaction shares the host and the registry.
export const createEnvironmentLogic = (
  readHost: () => EnvironmentHost | undefined = browserEnvironmentHost,
  { sequencer, owedWrites, desktopQuit }: EnvironmentOptions = {},
): CallbackActorLogic<EnvironmentCommand, EnvironmentInput> =>
  createCallbackLogic<EnvironmentCommand, EnvironmentInput>(({ input, sendBack, receive }) => {
    const registry = (): AnyActorRef | undefined => input?.registry;
    const focus = (): AnyActorRef | undefined => input?.focus;
    const report = (event: EnvironmentEvent): void => {
      sendBack(event);
    };
    /* The quit hold needs no page: main can ask before the renderer has one to read (a buffered ask). */
    const stopQuitHold = holdQuit({ registry, report, receive, sequencer, desktopQuit });
    const host = readHost();
    if (host === undefined) {
      return stopQuitHold;
    }
    let constrained = host.isMemoryConstrained();

    /* B-08: a phone cannot keep a project it left warm; elsewhere I22 holds. Outside the unload order (D26). */
    const releaseMemory = (): void => {
      if (!constrained) {
        return;
      }
      const keepProjectId = focusKeepOf(focus());
      registry()?.send(
        keepProjectId === undefined ? { type: 'releaseMemory' } : { type: 'releaseMemory', keepProjectId },
      );
    };

    const flushHidden = async (): Promise<void> => {
      try {
        await sequencer?.hidden();
      } catch (error) {
        console.error('Pending changes could not be saved before the page was hidden.', error);
      }
    };

    const onVisibilityChange = (): void => {
      const visible = host.document.visibilityState !== 'hidden';
      report({ type: 'visibilityChanged', visible });
      if (!visible) {
        // async-iife: bootstrap -- visibility events have no caller to await the producer stage.
        void flushHidden();
        releaseMemory();
      }
    };
    const onPageHide = (): void => {
      sequencer?.pagehide();
      releaseMemory();
    };
    /* D26 as amended (A7c): a navigation's `pagehide` and `hidden` come as the document goes, too late for a write first
     * issued there to land. `beforeunload` comes as it starts: the producer stage runs then, and no session stage. No
     * `preventDefault` and no `returnValue`, so the page never prompts; `hidden` still runs the whole order, and a
     * producer with nothing left owed writes nothing again. */
    const flushBeforeUnload = async (): Promise<void> => {
      try {
        await sequencer?.flushProducers();
      } catch (error) {
        console.error('Pending changes could not be saved before the page unloaded.', error);
      }
    };
    const onBeforeUnload = (): void => {
      // async-iife: bootstrap -- the navigation has no caller to await the producer stage.
      void flushBeforeUnload();
    };
    /* The listener is held only while a producer owes a write, so a settled page stays eligible for the bfcache. */
    let holdsBeforeUnload = false;
    const followOwedWrites = (): void => {
      const owes = owedWrites?.owes() ?? false;
      if (owes === holdsBeforeUnload) {
        return;
      }
      holdsBeforeUnload = owes;
      if (owes) {
        host.window.addEventListener('beforeunload', onBeforeUnload);
      } else {
        host.window.removeEventListener('beforeunload', onBeforeUnload);
      }
    };
    const onFocus = (): void => {
      report({ type: 'focusChanged', focused: true });
    };
    const onBlur = (): void => {
      report({ type: 'focusChanged', focused: false });
    };
    const onMemoryClassChange = (): void => {
      constrained = host.isMemoryConstrained();
      report({ type: 'memoryClassChanged', constrained });
      releaseMemory();
    };

    /* The other half of B-08: leaving a project, or arriving at another, frees the ones behind it. */
    let keep = focusKeepOf(focus());
    const focusSubscription = focus()?.subscribe(() => {
      const next = focusKeepOf(focus());
      if (next !== keep) {
        keep = next;
        releaseMemory();
      }
    });

    /* The first reading is a report, not an unload: a page that starts hidden has nothing to flush yet. */
    report({ type: 'visibilityChanged', visible: host.document.visibilityState !== 'hidden' });
    report({ type: 'focusChanged', focused: host.document.hasFocus() });
    report({ type: 'memoryClassChanged', constrained });

    host.document.addEventListener('visibilitychange', onVisibilityChange);
    host.window.addEventListener('pagehide', onPageHide);
    const stopOwedWrites = owedWrites?.subscribe(followOwedWrites);
    followOwedWrites();
    host.window.addEventListener('focus', onFocus);
    host.window.addEventListener('blur', onBlur);
    host.coarsePointer?.addEventListener('change', onMemoryClassChange);
    return () => {
      host.document.removeEventListener('visibilitychange', onVisibilityChange);
      host.window.removeEventListener('pagehide', onPageHide);
      stopOwedWrites?.();
      if (holdsBeforeUnload) {
        holdsBeforeUnload = false;
        host.window.removeEventListener('beforeunload', onBeforeUnload);
      }
      host.window.removeEventListener('focus', onFocus);
      host.window.removeEventListener('blur', onBlur);
      host.coarsePointer?.removeEventListener('change', onMemoryClassChange);
      focusSubscription?.unsubscribe();
      stopQuitHold();
    };
  });
