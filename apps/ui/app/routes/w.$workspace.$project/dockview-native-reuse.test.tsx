/* oxlint-disable eslint/no-await-in-loop -- Each native Dockview container is mounted and disposed in order. */
// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi } from 'dockview-react';
import type { ViewerNode } from '@taucad/workbench';
import { fromDockview, toDockview } from '#workbench-records/converters.js';

function Counter(): React.JSX.Element {
  const [count, setCount] = useState(0);
  return (
    <button
      type='button'
      onClick={() => {
        setCount((value) => value + 1);
      }}
    >
      Live pane {count}
    </button>
  );
}

describe('native Dockview record adoption', () => {
  it('emits add events when an authored view is introduced by fromJSON', () => {
    let api: DockviewApi | undefined;
    const pane = render(
      <DockviewReact
        components={{ viewer: Counter }}
        onReady={(event) => {
          api = event.api;
        }}
      />,
    );
    const added: string[] = [];
    api!.onDidAddPanel((event) => {
      added.push(event.id);
    });
    act(() => {
      api!.fromJSON(
        toDockview(
          'viewer',
          { kind: 'group', tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
          { dimensions: { width: 800, height: 600 } },
        ),
        { reuseExistingPanels: true },
      );
    });
    expect(added).toEqual(['v-1234abcd']);
    pane.unmount();
  });

  it('emits no person write after two differently sized containers adopt the same portable tree', async () => {
    const tree: ViewerNode = {
      kind: 'split',
      direction: 'row',
      children: [
        { kind: 'group', size: 1, tabs: [{ kind: 'view', view: 'v-1234abcd' }] },
        { kind: 'group', size: 2, tabs: [{ kind: 'view', view: 'v-5678abcd' }] },
      ],
    };
    for (const dimensions of [
      { width: 1200, height: 800 },
      { width: 520, height: 1080 },
    ]) {
      let api: DockviewApi | undefined;
      const pane = render(
        <DockviewReact
          components={{ viewer: Counter }}
          onReady={(event) => {
            api = event.api;
          }}
        />,
      );
      expect(api).toBeDefined();
      let adopting = false;
      let applied: string | undefined;
      let writes = 0;
      const listener = api!.onDidLayoutChange(() => {
        if (adopting) {
          return;
        }
        const projected = JSON.stringify(fromDockview('viewer', api!.toJSON()));
        if (projected !== applied) {
          writes++;
        }
      });
      act(() => {
        api!.layout(dimensions.width, dimensions.height);
        adopting = true;
        api!.fromJSON(toDockview('viewer', tree, { dimensions }), { reuseExistingPanels: true });
        applied = JSON.stringify(fromDockview('viewer', api!.toJSON()));
        adopting = false;
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(writes).toBe(0);
      listener.dispose();
      pane.unmount();
    }
  });

  it('keeps an existing panel instance and its React state across a structural record load', () => {
    let api: DockviewApi | undefined;
    render(
      <DockviewReact
        components={{ counter: Counter }}
        onReady={(event) => {
          api = event.api;
        }}
      />,
    );
    expect(api).toBeDefined();
    act(() => {
      api!.addPanel({ id: 'pane-a', component: 'counter', title: 'A' });
      api!.addPanel({
        id: 'pane-b',
        component: 'counter',
        title: 'B',
        position: { direction: 'right', referencePanel: 'pane-a' },
      });
    });
    const pane = api!.getPanel('pane-a');
    const removed: string[] = [];
    api!.onDidRemovePanel((event) => {
      removed.push(event.id);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Live pane 0' })[0]!);
    expect(screen.getByRole('button', { name: 'Live pane 1' })).toBeDefined();
    const recorded = api!.toJSON();
    act(() => {
      api!.addPanel({ id: 'pane-c', component: 'counter', title: 'C' });
    });
    act(() => {
      api!.fromJSON(recorded, { reuseExistingPanels: true });
    });
    expect(api!.getPanel('pane-a')).toBe(pane);
    expect(screen.getByRole('button', { name: 'Live pane 1' })).toBeDefined();
    expect(api!.getPanel('pane-c')).toBeUndefined();
    expect(removed).toEqual(['pane-c']);
  });
});
