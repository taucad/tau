// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DockviewApi, DockviewComponent } from 'dockview-react';
import { agentSignInPanelId, connectAgentSignInWorkbench } from '#components/terminal/agent-sign-in-workbench.js';
import { dismissAgentSignIn, openAgentSignIns, requestAgentSignIn } from '#components/terminal/agent-sign-ins.js';
import { fromDockview } from '#workbench-records/converters.js';

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) {
    dispose();
  }
  for (const agentId of openAgentSignIns()) {
    dismissAgentSignIn(agentId);
  }
});

const terminalPanelId = 'workbench:terminal';

const setup = (restoring?: { value: boolean }): DockviewApi => {
  const element = document.createElement('div');
  document.body.append(element);
  const dockview = new DockviewComponent(element, {
    createComponent: () => ({ element: document.createElement('div'), init: () => undefined }),
  });
  dockview.layout(1000, 700);
  const api = new DockviewApi(dockview);
  api.addPanel({ id: 'workbench:parameters', component: 'parameters', title: 'Parameters' });
  api.addPanel({ id: terminalPanelId, component: 'terminal', title: 'Terminal', position: { direction: 'right' } });
  disposals.push(
    connectAgentSignInWorkbench({ api, isRestoring: () => restoring?.value ?? false, terminalPanelId }),
    () => {
      dockview.dispose();
      element.remove();
    },
  );
  return api;
};

const signInPanels = (api: DockviewApi) => api.panels.filter((panel) => panel.api.component === 'agentSignIn');

describe('connectAgentSignInWorkbench', () => {
  it('should open each sign-in as its own top-level tab beside the Terminal, in front', () => {
    const api = setup();

    requestAgentSignIn('acme');

    const panel = api.getPanel(agentSignInPanelId('acme'));
    expect(panel?.title).toBe('Sign in to acme');
    expect(panel?.group).toBe(api.getPanel(terminalPanelId)?.group);
    expect(api.activePanel?.id).toBe(agentSignInPanelId('acme'));
    /* The person's shell keeps its own tab. */
    expect(api.getPanel(terminalPanelId)).toBeDefined();
  });

  it('should keep one tab per agent and bring it forward on a second request', () => {
    const api = setup();
    requestAgentSignIn('acme');
    requestAgentSignIn('beta');
    api.getPanel(terminalPanelId)?.api.setActive();

    requestAgentSignIn('acme');

    expect(signInPanels(api).map((panel) => panel.id)).toEqual([
      agentSignInPanelId('acme'),
      agentSignInPanelId('beta'),
    ]);
    expect(api.activePanel?.id).toBe(agentSignInPanelId('acme'));
  });

  it('should forget a sign-in whose tab the person closes', () => {
    const api = setup();
    requestAgentSignIn('acme');

    api.getPanel(agentSignInPanelId('acme'))?.api.close();

    expect(openAgentSignIns()).toEqual([]);
    expect(signInPanels(api)).toEqual([]);
  });

  it('should open a sign-in asked for before the workbench was shown', () => {
    requestAgentSignIn('acme');

    const api = setup();

    expect(api.activePanel?.id).toBe(agentSignInPanelId('acme'));
  });

  it('should keep a sign-in open across a layout the workbench restores', async () => {
    const restoring = { value: false };
    const api = setup(restoring);
    requestAgentSignIn('acme');

    restoring.value = true;
    api.removePanel(api.getPanel(agentSignInPanelId('acme'))!);
    restoring.value = false;
    api.getPanel(terminalPanelId)?.api.setActive();
    /* Dockview reports the layout change on a microtask, and the reconcile follows on another. */
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(openAgentSignIns()).toEqual(['acme']);
    expect(api.getPanel(agentSignInPanelId('acme'))).toBeDefined();
  });

  it('should never write a sign-in into the saved layout', () => {
    const api = setup();
    requestAgentSignIn('acme');

    const lane = JSON.stringify(fromDockview('workbench', api.toJSON()));

    expect(lane).not.toContain('acme');
    expect(lane).toContain('terminal');
  });
});
