/**
 * A session project runtime stand-in, for rows that compose the registry or the real app runtime without building a
 * project runtime (A6d).
 *
 * The session's `project` child reads only the runtime's root ref, its facts and their changes, asks it for chats,
 * asks whether its kernel is current, flushes it before a replacement (A6e) and closes what it built. So a plain object a test moves stands in for the
 * runtime, and a no-op actor for its root.
 */
import { Topic } from '@taucad/events';
import { createActor, createCallbackLogic } from 'xstate';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { ProjectSessionOpenRequest } from '#machines/project-session.machine.js';
import type {
  SessionRuntime,
  SessionRuntimeChat,
  SessionRuntimeFacts,
  SessionRuntimeOpener,
} from '#services/sessions-store.js';

/** One built stand-in, with what a row reads back and moves. @public */
export type SessionRuntimeStandIn = SessionRuntime &
  Readonly<{
    /** What the child built it for. */
    input: Readonly<{
      projectId: string;
      fileManagerRef: FileManagerRef;
      request: ProjectSessionOpenRequest | undefined;
    }>;
    /** Move its facts; its subscribers hear the change. */
    set: (facts: Partial<SessionRuntimeFacts>) => void;
    /** Every chat the child asked the editor for, in order. */
    chats: readonly SessionRuntimeChat[];
    /** Make `kernelIsCurrent` answer `false` from now on, as a change of compute placement does. */
    supersede: () => void;
    /** Make it answer `true` again, as choices that come back to its kernel do. */
    restore: () => void;
    /** Whether `close` ran. */
    isClosed: () => boolean;
    /** Writes the runtime owes until its next `flush` lands them (A6e). */
    owed: string[];
    /** Writes a `flush` landed, in order. */
    landed: readonly string[];
    /** Run `next` as the flush from now on, after the owed writes land: a row holds or refuses the flush with it. */
    flushWith: (next: () => Promise<void>) => void;
    /** Every parking signal and focused-chat retry the child sent, and every flush and close it asked, in order. */
    signals: readonly string[];
    /**
     * Hold every flush and close the session asks, or only those whose signal `only` accepts (`flush:close`, say), until
     * the row releases them (A7c).
     */
    hold: (only?: (signal: string) => boolean) => () => void;
    /** Hear each flush and close the session asks as it starts, so a row can interleave them with its own steps. */
    onSignal: (listener: (signal: string) => void) => void;
    /**
     * Make every close flush from now on refuse with `reason`, as unsaved parameter drafts do, or stop refusing with
     * `undefined`; `signal` names another step to refuse instead (`closeRuntime`, say).
     */
    refuse: (reason: string | undefined, signal?: string) => void;
  }>;

/** The facts of a runtime whose project loaded and whose editor focused its chat. @public */
export const loadedSessionRuntimeFacts: SessionRuntimeFacts = {
  loaded: true,
  kernelRefusal: undefined,
  chatReady: true,
  chatDeferred: false,
  focusedChat: undefined,
};

/**
 * Build a stand-in for one session.
 *
 * @param input - What the child built it for.
 * @param facts - Its first facts; a loaded project with a ready chat session by default.
 * @returns The stand-in, its root started.
 * @public
 */
export function openSessionRuntimeStandIn(
  input: SessionRuntimeStandIn['input'],
  facts: Partial<SessionRuntimeFacts> = {},
): SessionRuntimeStandIn {
  const root = createActor(createCallbackLogic(() => undefined)).start();
  let current: SessionRuntimeFacts = { ...loadedSessionRuntimeFacts, ...facts };
  const changes = new Topic<void>({ name: `test.sessionRuntime.${input.projectId}` });
  const chats: SessionRuntimeChat[] = [];
  let kernelCurrent = true;
  let closed = false;
  const owed: string[] = [];
  const landed: string[] = [];
  let flushRest: () => Promise<void> = async () => undefined;
  const signals: string[] = [];
  let held: Promise<void> | undefined;
  let holds: ((signal: string) => boolean) | undefined;
  const refusals = new Map<string, string>();
  let heard: ((signal: string) => void) | undefined;
  const work = async (signal: string): Promise<void> => {
    signals.push(signal);
    heard?.(signal);
    if (holds?.(signal) ?? true) {
      await held;
    }
    const refusal = refusals.get(signal);
    if (refusal !== undefined) {
      throw new Error(refusal);
    }
  };
  return {
    input,
    runtimeRef: root,
    facts: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    requestChat: (chat) => {
      chats.push(chat);
    },
    kernelIsCurrent: () => kernelCurrent,
    park: (parked) => {
      signals.push(parked ? 'parkRuntime' : 'resumeRuntime');
    },
    retryFocusedChat: () => {
      signals.push('retryEnsureFocusedChat');
    },
    /* A replacement's flush lands what is owed and runs the row's own (A6e); the session's flushes are signals (A7c). */
    flush: async (kind) => {
      if (kind === 'replace') {
        landed.push(...owed.splice(0));
        await flushRest();
        return;
      }
      await work(`flush:${kind}`);
    },
    closeParameters: async () => work('closeParameters'),
    closeRuntime: async () => work('closeRuntime'),
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      root.stop();
      changes.dispose();
    },
    set: (next) => {
      current = { ...current, ...next };
      changes.emit();
    },
    chats,
    supersede: () => {
      kernelCurrent = false;
    },
    restore: () => {
      kernelCurrent = true;
    },
    isClosed: () => closed,
    owed,
    landed,
    flushWith: (next) => {
      flushRest = next;
    },
    signals,
    hold: (only) => {
      const gate = Promise.withResolvers<void>();
      held = gate.promise;
      holds = only;
      return () => {
        held = undefined;
        holds = undefined;
        gate.resolve();
      };
    },
    onSignal: (listener) => {
      heard = listener;
    },
    refuse: (reason, signal = 'flush:close') => {
      if (reason === undefined) {
        refusals.delete(signal);
      } else {
        refusals.set(signal, reason);
      }
    },
  };
}

/** An opener over stand-ins, with every runtime it built and a way to announce a change of the device's choices. @public */
export type SessionRuntimeOpenerStandIn = SessionRuntimeOpener &
  Readonly<{
    built: readonly SessionRuntimeStandIn[];
    /** The latest stand-in built for a project, if any. */
    latest: (projectId: string) => SessionRuntimeStandIn | undefined;
    /** Run `prepare` on each stand-in as it is built for `projectId`, before the session hears of it. */
    onBuilt: (projectId: string, prepare: (standIn: SessionRuntimeStandIn) => void) => void;
    /** Tell every child the device's choices changed. */
    changeChoices: () => void;
  }>;

/**
 * An opener that builds a stand-in for each open.
 *
 * @param facts - Each stand-in's first facts.
 * @returns The opener.
 * @public
 */
export function sessionRuntimeOpenerStandIn(facts: Partial<SessionRuntimeFacts> = {}): SessionRuntimeOpenerStandIn {
  const built: SessionRuntimeStandIn[] = [];
  const preparers = new Map<string, (standIn: SessionRuntimeStandIn) => void>();
  const choices = new Topic<void>({ name: 'test.sessionRuntime.choices' });
  return {
    built,
    latest: (projectId) => built.findLast((standIn) => standIn.input.projectId === projectId),
    onBuilt: (projectId, prepare) => {
      preparers.set(projectId, prepare);
    },
    open: async (input) => {
      const standIn = openSessionRuntimeStandIn(input, facts);
      preparers.get(input.projectId)?.(standIn);
      built.push(standIn);
      return standIn;
    },
    onChoicesChanged: (listener) => choices.subscribe(listener),
    changeChoices: () => {
      choices.emit();
    },
  };
}
