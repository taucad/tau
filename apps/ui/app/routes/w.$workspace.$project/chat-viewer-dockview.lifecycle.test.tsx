// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DockviewReact } from 'dockview-react';
import type { DockviewApi } from 'dockview-react';
import { workbenchRecords } from '@taucad/workbench';
import type { ViewerNode, WorkbenchView } from '@taucad/workbench';
import type { CheckedFileWriteResult } from '@taucad/types';
import { adoptViewerRecordNode } from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { viewTabTitle } from '#workbench-records/projection.js';
import { createWorkbenchViewStore } from '#workbench-records/view-store.js';

describe('live viewer record binding', () => {
  it('keeps a retained named panel bound through a structural layout adoption', async () => {
    const entryPath = 'public/models/honeycomb.js';
    const records = new Map<string, WorkbenchView>([
      [
        'front',
        workbenchRecords.view.schema.parse({
          version: 1,
          entryPath,
          name: 'Front',
          camera: { kind: 'preset', preset: 'front' },
        }),
      ],
      [
        'left',
        workbenchRecords.view.schema.parse({
          version: 1,
          entryPath,
          name: 'Left',
          camera: { kind: 'preset', preset: 'left' },
        }),
      ],
      [
        'joint',
        workbenchRecords.view.schema.parse({
          version: 1,
          entryPath,
          name: 'Joint',
          camera: { kind: 'look', direction: [0, -1, 0] },
        }),
      ],
    ]);
    const bytes = new Map(
      [...records].map(([id, record]) => [
        `/projects/p/.tau/workbench/views/${id}.json`,
        new TextEncoder().encode(workbenchRecords.view.serialize(record)),
      ]),
    );
    let api: DockviewApi | undefined;
    const pane = render(
      <DockviewReact
        components={{ viewer: () => <div>Model</div> }}
        onReady={(event) => {
          api = event.api;
        }}
      />,
    );
    expect(api).toBeDefined();
    const stores = new Map<string, ReturnType<typeof createWorkbenchViewStore>>();
    const publish = (id: string): void => {
      const store = createWorkbenchViewStore({
        root: '/projects/p',
        viewId: id,
        files: {
          exists: async (path) => bytes.has(path),
          readFile: async (path) => bytes.get(path)!,
          writeFileChecked: vi.fn(
            async (): Promise<CheckedFileWriteResult> => ({ status: 'applied', content: new Uint8Array() }),
          ),
        },
        onChange: (state) => {
          const panel = api?.getPanel(id);
          if (!panel || !state.record) {
            return;
          }
          panel.api.updateParameters({ entryPath: state.record.entryPath ?? undefined });
          panel.api.setTitle(viewTabTitle(state.record));
        },
        onError: vi.fn(),
      });
      stores.set(id, store);
      void store.read(true);
    };
    api!.layout(900, 600);
    api!.onDidAddPanel((event) => {
      publish(event.id);
    });
    await act(async () => {
      api!.addPanel({ id: 'front', component: 'viewer', title: 'front', params: { viewId: 'front' } });
    });
    await waitFor(() => {
      expect(api!.getPanel('front')?.title).toBe('Front · honeycomb.js');
    });
    expect(api!.getPanel('front')?.params).toMatchObject({ viewId: 'front', entryPath });
    const retainedPanel = api!.getPanel('front');
    const arranged: ViewerNode = {
      kind: 'split',
      direction: 'row',
      children: [
        {
          kind: 'group',
          tabs: [
            { kind: 'view', view: 'front' },
            { kind: 'view', view: 'left' },
          ],
        },
        { kind: 'group', tabs: [{ kind: 'view', view: 'joint' }] },
      ],
    };

    await act(async () => {
      adoptViewerRecordNode(api!, arranged);
    });
    await waitFor(() => {
      expect(api!.getPanel('left')?.title).toBe('Left · honeycomb.js');
    });
    await waitFor(() => {
      expect(api!.getPanel('joint')?.title).toBe('Joint · honeycomb.js');
    });
    expect(api!.getPanel('front')).toBe(retainedPanel);
    expect(api!.getPanel('front')?.title).toBe('Front · honeycomb.js');
    expect(api!.getPanel('front')?.params).toMatchObject({ viewId: 'front', entryPath });
    await act(async () => {
      adoptViewerRecordNode(api!, arranged);
    });
    expect(api!.getPanel('front')).toBe(retainedPanel);
    expect(api!.getPanel('front')?.title).toBe('Front · honeycomb.js');
    expect(api!.getPanel('front')?.params).toMatchObject({ viewId: 'front', entryPath });
    for (const store of stores.values()) {
      store.dispose();
    }
    pane.unmount();
  });
});
