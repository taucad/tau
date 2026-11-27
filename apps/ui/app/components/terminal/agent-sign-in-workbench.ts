/**
 * External-agent sign-ins as top-level workbench tabs (ACP agent policy rule 10).
 *
 * Each open sign-in is one Dockview panel beside the Terminal tab, titled for its agent; the person's shell keeps its
 * own tab. The panels follow the page's sign-in list, never a saved layout: a restore that drops them is undone, and
 * the workbench record skips them, so a reload never reopens a sign-in.
 */

import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { externalAgentDisplayName } from '#lib/agent-host-placement.js';
import {
  dismissAgentSignIn,
  openAgentSignIns,
  subscribeAgentSignIns,
  takeAgentSignInFocus,
} from '#components/terminal/agent-sign-ins.js';

/** The Dockview component a sign-in panel renders. @public */
export const agentSignInComponent = 'agentSignIn';

/** A sign-in panel's parameters: the agent alone. @public */
export type AgentSignInPanelParameters = Readonly<{ agentId: string }>;

/**
 * The one panel id an agent's sign-in has, so a second request finds the first tab.
 *
 * @param agentId - The agent.
 * @returns The panel id.
 * @public
 */
export const agentSignInPanelId = (agentId: string): string => `workbench:agent-sign-in:${agentId}`;

const agentIdOf = (panel: IDockviewPanel): string | undefined =>
  panel.api.component === agentSignInComponent
    ? (panel.params as AgentSignInPanelParameters | undefined)?.agentId
    : undefined;

/**
 * Keep the workbench's sign-in tabs in step with the page's sign-in list.
 *
 * @param input - The workbench, whether it is restoring a layout, and the Terminal panel the tabs open beside.
 * @returns The disconnect.
 * @public
 */
export const connectAgentSignInWorkbench = ({
  api,
  isRestoring,
  terminalPanelId,
}: {
  readonly api: DockviewApi;
  readonly isRestoring: () => boolean;
  readonly terminalPanelId: string;
}): (() => void) => {
  let disposed = false;
  let reconciling = false;
  const reconcile = (): void => {
    if (disposed || reconciling || isRestoring()) {
      return;
    }
    reconciling = true;
    try {
      const wanted = openAgentSignIns();
      for (const panel of api.panels) {
        const agentId = agentIdOf(panel);
        if (agentId !== undefined && !wanted.includes(agentId)) {
          api.removePanel(panel);
        }
      }
      const focus = takeAgentSignInFocus();
      for (const agentId of wanted) {
        const id = agentSignInPanelId(agentId);
        const panel = api.getPanel(id);
        if (panel === undefined) {
          const group = api.getPanel(terminalPanelId)?.group ?? api.activeGroup ?? api.groups[0];
          api.addPanel({
            id,
            component: agentSignInComponent,
            title: `Sign in to ${externalAgentDisplayName(agentId)}`,
            params: { agentId } satisfies AgentSignInPanelParameters,
            inactive: agentId !== focus,
            ...(group === undefined ? {} : { position: { direction: 'within', referenceGroup: group } }),
          });
        } else if (agentId === focus) {
          panel.api.setActive();
        }
      }
    } finally {
      reconciling = false;
    }
  };
  const unsubscribe = subscribeAgentSignIns(reconcile);
  /* A restore replaces every panel; the sign-ins come back once it has. */
  const layout = api.onDidLayoutChange(() => {
    queueMicrotask(reconcile);
  });
  const removed = api.onDidRemovePanel((panel) => {
    if (reconciling || isRestoring()) {
      return;
    }
    const agentId = agentIdOf(panel);
    if (agentId !== undefined) {
      dismissAgentSignIn(agentId);
    }
  });
  reconcile();
  return () => {
    disposed = true;
    unsubscribe();
    layout.dispose();
    removed.dispose();
  };
};
