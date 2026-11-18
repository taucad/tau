/**
 * The external-agent sign-ins this page has open, and how each one ended (ACP agent policy rule 10).
 *
 * A sign-in card asks for one by agent id; the workbench draws one tab per id beside its other tabs. An exit is
 * recorded here as the exit code alone, never anything the tab showed: an exit 0 is held until the card waiting on that
 * agent takes it and tries its turn again, and a non-zero exit stays until the next sign-in for that agent so the card
 * can say how it ended. The list lives for the page, not in any saved layout, so a reload never reopens a sign-in.
 */

import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { DesktopAgentSignInBridge } from '@taucad/types/desktop-agent-sign-in';
import { isDesktopTarget } from '#lib/build-target.js';

/** How a sign-in that failed ended: its exit code, or `undefined` when a signal stopped it. @public */
export type AgentSignInFailure = Readonly<{ exitCode: number | undefined }>;

let open: readonly string[] = [];
/** Exit-0 sign-ins no card has taken yet. */
const succeeded = new Set<string>();
const failures = new Map<string, AgentSignInFailure>();
const changes = new Topic<void>({ name: 'AgentSignIns.changes' });
/** The agent whose tab a card last asked to bring forward, until the workbench does. */
let focusRequest: string | undefined;

const changed = (): void => {
  changes.emit();
};

/**
 * Open the sign-in tab for one agent, or bring its open tab forward: there is never a second one.
 *
 * @param agentId - The agent to sign in to; main decides what runs for it.
 * @public
 */
export const requestAgentSignIn = (agentId: string): void => {
  succeeded.delete(agentId);
  failures.delete(agentId);
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
  if (exitCode === 0) {
    failures.delete(agentId);
    succeeded.add(agentId);
  } else {
    succeeded.delete(agentId);
    failures.set(agentId, { exitCode });
  }
  changed();
};

/**
 * Take an agent's exit-0 sign-in, once: the caller that gets `true` is the one that carries on.
 *
 * @param agentId - The agent a card is waiting on.
 * @returns Whether a sign-in for it ended with exit 0 since it was last taken.
 * @public
 */
export const takeAgentSignInSuccess = (agentId: string): boolean => succeeded.delete(agentId);

/**
 * How an agent's last sign-in ended, re-rendering on each change.
 *
 * @param agentId - The agent a card is waiting on.
 * @returns `succeeded` while an exit 0 is untaken, the failure, or `undefined`.
 * @public
 */
export const useAgentSignInOutcome = (agentId: string): 'succeeded' | AgentSignInFailure | undefined =>
  useSyncExternalStore(
    subscribeAgentSignIns,
    () => (succeeded.has(agentId) ? 'succeeded' : failures.get(agentId)),
    () => undefined,
  );

/**
 * The preload's sign-in bridge, on a desktop build whose shell has one: the only place Tau can run a sign-in itself.
 *
 * @returns The bridge, or `undefined` in the browser, against a remote host and on an older shell.
 * @public
 */
export const desktopAgentSignInBridge = (): DesktopAgentSignInBridge | undefined =>
  isDesktopTarget() ? (globalThis as { tau?: { agentSignIn?: DesktopAgentSignInBridge } }).tau?.agentSignIn : undefined;
