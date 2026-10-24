import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { IContentRenderer } from 'dockview-react';
import { DockviewComponent } from 'dockview-react';
import type { WorkbenchLaneNode } from '@taucad/workbench';
import { toDockview } from '#workbench-records/converters.js';
import { isSurfaceShipped, withoutUnshippedPanes } from '#workbench-records/surface-availability.js';

const mounted: Array<{ element: HTMLElement; dockview: DockviewComponent }> = [];
afterEach(() => {
  for (const { element, dockview } of mounted.splice(0)) {
    dockview.dispose();
    element.remove();
  }
});

/**
 * The panels Dockview shows for a stored lane, through the same converter the Workbench applies records with. An empty
 * group projects as a launcher tab.
 */
const mountedPanels = (node: WorkbenchLaneNode): string[] => {
  const element = document.createElement('div');
  document.body.append(element);
  const dockview = new DockviewComponent(element, {
    createComponent: (): IContentRenderer => ({ element: document.createElement('div'), init: () => undefined }),
  });
  mounted.push({ element, dockview });
  dockview.layout(800, 600);
  dockview.fromJSON(toDockview('workbench', node, { dimensions: { width: 800, height: 600 }, files: {} }));
  return dockview.panels.map((panel) => (panel.api.component === 'newTab' ? 'launcher' : panel.id));
};

/** A layout saved by the desktop app before Jobs was withdrawn. */
const saved: WorkbenchLaneNode = {
  kind: 'split',
  direction: 'row',
  children: [
    {
      kind: 'group',
      tabs: [
        { kind: 'pane', pane: 'parameters' },
        { kind: 'pane', pane: 'jobs' },
        { kind: 'pane', pane: 'agents' },
      ],
      active: 2,
    },
    { kind: 'group', tabs: [{ kind: 'pane', pane: 'browser' }], active: 0 },
  ],
};

describe('isSurfaceShipped', () => {
  it('should ship Browser only in the desktop app and Jobs in no build', () => {
    expect(isSurfaceShipped('browser')).toBe(false);
    expect(isSurfaceShipped('jobs')).toBe(false);
    expect(isSurfaceShipped('agents')).toBe(true);
    vi.stubEnv('TAU_TARGET', 'desktop');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    expect(isSurfaceShipped('browser')).toBe(true);
    expect(isSurfaceShipped('jobs')).toBe(false);
  });
});

describe('withoutUnshippedPanes', () => {
  it('should drop a saved Jobs and Browser tab on the web, keeping the active tab and the emptied group', () => {
    const pruned = withoutUnshippedPanes(saved);
    expect(pruned).toEqual({
      kind: 'split',
      direction: 'row',
      children: [
        {
          kind: 'group',
          tabs: [
            { kind: 'pane', pane: 'parameters' },
            { kind: 'pane', pane: 'agents' },
          ],
          active: 1,
        },
        { kind: 'group', tabs: [], active: undefined },
      ],
    });
    expect(mountedPanels(saved)).toContain('workbench:jobs');
    expect(mountedPanels(pruned)).toEqual(['workbench:parameters', 'workbench:agents', 'launcher']);
  });

  it('should keep a saved Browser tab in the desktop app and still drop Jobs', () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    const pruned = withoutUnshippedPanes(saved);
    expect(mountedPanels(pruned).toSorted()).toEqual(
      ['workbench:agents', 'workbench:browser', 'workbench:parameters'].toSorted(),
    );
  });

  it('should fall back to the last tab when the active one is dropped, and return a clean lane unchanged', () => {
    const group: WorkbenchLaneNode = {
      kind: 'group',
      tabs: [
        { kind: 'pane', pane: 'revisions' },
        { kind: 'pane', pane: 'jobs' },
      ],
      active: 1,
    };
    expect(withoutUnshippedPanes(group)).toEqual({
      kind: 'group',
      tabs: [{ kind: 'pane', pane: 'revisions' }],
      active: undefined,
    });
    const clean: WorkbenchLaneNode = { kind: 'group', tabs: [{ kind: 'pane', pane: 'revisions' }] };
    expect(withoutUnshippedPanes(clean)).toBe(clean);
  });
});
