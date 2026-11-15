/**
 * A session project runtime stand-in, for rows that compose the registry or the real app runtime without building a
 * project runtime (A6d).
 *
 * The session's `project` child reads only the runtime's root ref, its facts and their changes, asks it for chats,
 * asks whether its kernel is current, and closes what it built. So a plain object a test moves stands in for the
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
    /** Whether `close` ran. */
    isClosed: () => boolean;
    /** Every parking signal and focused-chat retry the child sent, in order (A7b). */
    signals: readonly string[];
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
  const signals: string[] = [];
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
    isClosed: () => closed,
    signals,
  };
}

/** An opener over stand-ins, with every runtime it built and a way to announce a change of the device's choices. @public */
export type SessionRuntimeOpenerStandIn = SessionRuntimeOpener &
  Readonly<{
    built: readonly SessionRuntimeStandIn[];
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
  const choices = new Topic<void>({ name: 'test.sessionRuntime.choices' });
  return {
    built,
    open: async (input) => {
      const standIn = openSessionRuntimeStandIn(input, facts);
      built.push(standIn);
      return standIn;
    },
    onChoicesChanged: (listener) => choices.subscribe(listener),
    changeChoices: () => {
      choices.emit();
    },
  };
}
