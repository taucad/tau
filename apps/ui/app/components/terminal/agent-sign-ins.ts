/**
 * The external-agent sign-ins this page has open, and how each one ended (ACP agent policy rule 10).
 *
 * A sign-in card asks for one by agent id and names its chat; the workbench draws one tab per id beside its other tabs.
 * An exit is recorded here as the exit code alone, never anything the tab showed: an exit 0 is held for each chat that
 * asked for that sign-in until its card takes it and tries its turn again, so another chat's card for the same agent
 * never carries on in its place, and a non-zero exit stays until the next sign-in for that agent so the card can say how
 * it ended. Asking again after a sign-in ended starts a fresh attempt in the same tab. The list lives for the page, not
 * in any saved layout, so a reload never reopens a sign-in.
 */

import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { DesktopAgentSignInBridge } from '@taucad/types/desktop-agent-sign-in';
import { isDesktopTarget } from '#lib/build-target.js';

/** How a sign-in that failed ended: its exit code, or `undefined` when a signal stopped it. @public */
export type AgentSignInFailure = Readonly<{ exitCode: number | undefined }>;

let open: readonly string[] = [];
/** The chats that asked for each agent's current sign-in. */
const requesters = new Map<string, ReadonlySet<string>>();
/** Exit-0 sign-ins, by agent, and the requesting chats whose cards have not taken theirs yet. */
const succeeded = new Map<string, Set<string>>();
const failures = new Map<string, AgentSignInFailure>();
/** Agents whose sign-in exited, stopped or was refused since it was last asked for. */
const ended = new Set<string>();
/** Each agent's attempt number, which a fresh sign-in in an open tab moves on. */
const attempts = new Map<string, number>();
const changes = new Topic<void>({ name: 'AgentSignIns.changes' });
/** The agent whose tab a card last asked to bring forward, until the workbench does. */
let focusRequest: string | undefined;

const changed = (): void => {
  changes.emit();
};

/**
 * Open the sign-in tab for one agent, or bring its open tab forward: there is never a second one. A tab whose sign-in
 * has ended starts a fresh attempt; one still waiting or running is only brought forward.
 *
 * @param agentId - The agent to sign in to; main decides what runs for it.
 * @param chatId - The chat asking, which carries on after an exit 0; none for a request no chat waits on.
 * @public
 */
export const requestAgentSignIn = (agentId: string, chatId?: string): void => {
  if (!open.includes(agentId) || ended.has(agentId)) {
    succeeded.delete(agentId);
    failures.delete(agentId);
    requesters.delete(agentId);
    if (ended.delete(agentId)) {
      attempts.set(agentId, (attempts.get(agentId) ?? 0) + 1);
    }
  }
  if (chatId !== undefined) {
    requesters.set(agentId, new Set([...(requesters.get(agentId) ?? []), chatId]));
  }
  if (!open.includes(agentId)) {
    open = [...open, agentId];
  }
  focusRequest = agentId;
  changed();
};

/**
 * Close one sign-in tab, which stops its CLI if it still runs.
 *
 * @param agentId - The tab's agent.
 * @public
 */
export const dismissAgentSignIn = (agentId: string): void => {
  if (open.includes(agentId)) {
    open = open.filter((id) => id !== agentId);
    if (focusRequest === agentId) {
      focusRequest = undefined;
    }
    changed();
  }
};

/**
 * The agents whose sign-in tabs are open, in the order they were asked for.
 *
 * @returns The agent ids.
 * @public
 */
export const openAgentSignIns = (): readonly string[] => open;

/**
 * Follow the open sign-ins and their exits.
 *
 * @param listener - Called after each change.
 * @returns The unsubscribe.
 * @public
 */
export const subscribeAgentSignIns = (listener: () => void): (() => void) => changes.subscribe(listener);

/**
 * Take the tab a card last asked to bring forward, once.
 *
 * @returns The agent id, or `undefined` when nothing waits to be brought forward.
 * @public
 */
export const takeAgentSignInFocus = (): string | undefined => {
  const agentId = focusRequest;
  focusRequest = undefined;
  return agentId;
};

/**
 * Record how a started sign-in ended. Only the exit code is kept.
 *
 * @param agentId - The tab's agent.
 * @param exitCode - The CLI's exit code, or `undefined` when a signal stopped it.
 * @public
 */
export const reportAgentSignInExit = (agentId: string, exitCode: number | undefined): void => {
  ended.add(agentId);
  if (exitCode === 0) {
    failures.delete(agentId);
    succeeded.set(agentId, new Set(requesters.get(agentId)));
  } else {
    succeeded.delete(agentId);
    failures.set(agentId, { exitCode });
  }
  requesters.delete(agentId);
  changed();
};

/**
 * Record that main refused a sign-in, so asking again starts a fresh attempt. The tab says why.
 *
 * @param agentId - The tab's agent.
 * @public
 */
export const reportAgentSignInRefused = (agentId: string): void => {
  ended.add(agentId);
};

/**
 * Take an agent's exit-0 sign-in for one chat, once: the card that gets `true` is the one that carries on.
 *
 * @param agentId - The agent a card is waiting on.
 * @param chatId - The card's chat.
 * @returns Whether a sign-in this chat asked for ended with exit 0 since the chat last took it.
 * @public
 */
export const takeAgentSignInSuccess = (agentId: string, chatId: string): boolean =>
  succeeded.get(agentId)?.delete(chatId) ?? false;

/**
 * How an agent's last sign-in ended for one chat, re-rendering on each change.
 *
 * @param agentId - The agent a card is waiting on.
 * @param chatId - The card's chat.
 * @returns `succeeded` while an exit 0 this chat asked for is untaken, the failure, or `undefined`.
 * @public
 */
export const useAgentSignInOutcome = (agentId: string, chatId: string): 'succeeded' | AgentSignInFailure | undefined =>
  useSyncExternalStore(
    subscribeAgentSignIns,
    () => (succeeded.get(agentId)?.has(chatId) === true ? 'succeeded' : failures.get(agentId)),
    () => undefined,
  );

/**
 * An agent's sign-in attempt, which moves on when a request restarts an ended sign-in in its open tab.
 *
 * @param agentId - The tab's agent.
 * @returns The attempt number, for the tab to key its session on.
 * @public
 */
export const useAgentSignInAttempt = (agentId: string): number =>
  useSyncExternalStore(
    subscribeAgentSignIns,
    () => attempts.get(agentId) ?? 0,
    () => 0,
  );

/**
 * The preload's sign-in bridge, on a desktop build whose shell has one: the only place Tau can run a sign-in itself.
 *
 * @returns The bridge, or `undefined` in the browser, against a remote host and on an older shell.
 * @public
 */
export const desktopAgentSignInBridge = (): DesktopAgentSignInBridge | undefined =>
  isDesktopTarget() ? (globalThis as { tau?: { agentSignIn?: DesktopAgentSignInBridge } }).tau?.agentSignIn : undefined;
