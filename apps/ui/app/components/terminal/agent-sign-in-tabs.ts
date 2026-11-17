/**
 * Which external-agent sign-in tabs the Terminal shows (ACP agent policy rule 10).
 *
 * A sign-in card asks for a tab by agent id and opens the Terminal pane; the pane draws one tab per id beside the
 * person's own shell. The list lives for the page, not in any saved layout, so a reload never reopens a sign-in.
 */

import { useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { DesktopAgentSignInBridge } from '@taucad/types/desktop-agent-sign-in';
import { isDesktopTarget } from '#lib/build-target.js';

/** The open sign-in tabs and the one in front: an agent id, or `terminal` for the person's shell. @public */
export type AgentSignInTabs = Readonly<{ agentIds: readonly string[]; selected: string }>;

/** The shell's own tab. @public */
export const terminalTabId = 'terminal';

let tabs: AgentSignInTabs = { agentIds: [], selected: terminalTabId };
const changes = new Topic<void>({ name: 'AgentSignInTabs.changes' });

const update = (next: AgentSignInTabs): void => {
  tabs = next;
  changes.emit();
};

/**
 * Open (or bring forward) the sign-in tab for one agent.
 *
 * @param agentId - The agent to sign in to; main decides what runs for it.
 * @public
 */
export const requestAgentSignIn = (agentId: string): void => {
  update({
    agentIds: tabs.agentIds.includes(agentId) ? tabs.agentIds : [...tabs.agentIds, agentId],
    selected: agentId,
  });
};

/**
 * Close one sign-in tab, which stops its CLI if it still runs.
 *
 * @param agentId - The tab's agent.
 * @public
 */
export const dismissAgentSignIn = (agentId: string): void => {
  update({
    agentIds: tabs.agentIds.filter((id) => id !== agentId),
    selected: tabs.selected === agentId ? terminalTabId : tabs.selected,
  });
};

/**
 * Bring a tab forward.
 *
 * @param tab - An open agent id, or {@link terminalTabId}.
 * @public
 */
export const selectTerminalTab = (tab: string): void => {
  update({ ...tabs, selected: tab });
};

const subscribe = (listener: () => void): (() => void) => changes.subscribe(listener);

/**
 * The open sign-in tabs.
 *
 * @returns The tabs, re-rendering on each change.
 * @public
 */
export const useAgentSignInTabs = (): AgentSignInTabs => useSyncExternalStore(subscribe, () => tabs);

/**
 * The preload's sign-in bridge, on a desktop build whose shell has one: the only place Tau can run a sign-in itself.
 *
 * @returns The bridge, or `undefined` in the browser, against a remote host and on an older shell.
 * @public
 */
export const desktopAgentSignInBridge = (): DesktopAgentSignInBridge | undefined =>
  isDesktopTarget() ? (globalThis as { tau?: { agentSignIn?: DesktopAgentSignInBridge } }).tau?.agentSignIn : undefined;
