/* oxlint-disable @typescript-eslint/consistent-type-assertions -- Dockview structural test doubles cover only exercised fields */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { DockviewApi, DockviewDidDropEvent, DockviewGroupPanel } from 'dockview-react';
import type { CapabilitiesManifest } from '@taucad/runtime';
import type { FileEntry } from '@taucad/types';
import { tauEditorPanelDragMime, tauFileDragMime } from '@taucad/types/constants';
import {
  createViewerNewTab,
  ensureViewerGroup,
  handleViewerDrop,
  listViewerSelectableFiles,
  replaceViewerNewTabWithFile,
  createInheritedGraphicsSettings,
  ViewerEmptyFilePicker,
} from '#routes/w.$workspace.$project/chat-viewer-dockview.js';
import { defaultGraphicsSettings } from '#constants/editor.constants.js';

describe('ensureViewerGroup', () => {
  it('keeps one header/action group available after the final viewer closes', () => {
    const groups: DockviewGroupPanel[] = [];
    const addGroup = vi.fn(() => {
      const group = { id: 'viewer-empty' } as DockviewGroupPanel;
      groups.push(group);
      return group;
    });
    const api = { groups, addGroup } as unknown as DockviewApi;

    ensureViewerGroup(api);
    ensureViewerGroup(api);

    expect(addGroup).toHaveBeenCalledOnce();
    expect(groups).toHaveLength(1);
  });
});

describe('viewer split launchers', () => {
  it('inherits preferences but clears geometry-dependent camera state for a new pane', () => {
    const inherited = createInheritedGraphicsSettings({
      ...defaultGraphicsSettings,
      cameraFovAngle: 42,
      cameraView: {
        frameId: 'tau:root',
        target: [3, 4, 5],
        direction: [1, 0, 0],
        up: [0, 0, 1],
        verticalSpan: 12,
        perspectiveZoom: 1,
      },
      pinnedMeasurements: [
        { id: 'measurement-1', frameId: 'tau:root', startPoint: [0, 0, 0], endPoint: [1, 0, 0], distance: 1 },
      ],
    });

    expect(inherited.cameraFovAngle).toBe(42);
    expect(inherited.cameraView).toBeUndefined();
    expect(inherited.pinnedMeasurements).toBeUndefined();
    expect(inherited).not.toHaveProperty('componentDisplay');
  });

  it('opens a Viewer launcher in the newly split group', () => {
    const addPanel = vi.fn();
    const group = { id: 'viewer-split' } as DockviewGroupPanel;

    createViewerNewTab({ api: { addPanel } as unknown as DockviewApi, group, id: 'pane:new' });

    expect(addPanel).toHaveBeenCalledExactlyOnceWith({
      id: 'pane:new',
      component: 'newTab',
      title: 'Viewer',
      params: { mode: 'launcher' },
      position: { direction: 'within', referenceGroup: group },
    });
  });

  it('replaces the launcher in place when a viewer file is selected', () => {
    const close = vi.fn();
    const placeholder = {
      id: 'pane:new',
      api: { close },
    };
    const group = {
      panels: [{ id: 'before' }, placeholder, { id: 'after' }],
    } as unknown as DockviewGroupPanel;
    Object.assign(placeholder.api, { group });
    const addPanel = vi.fn();
    const onViewCreated = vi.fn();

    replaceViewerNewTabWithFile({
      api: { addPanel, panels: [placeholder] } as unknown as DockviewApi,
      placeholderId: 'pane:new',
      path: 'models/main.scad',
      viewId: 'view:new',
      onViewCreated,
    });

    expect(addPanel).toHaveBeenCalledExactlyOnceWith({
      id: 'view:new',
      component: 'viewer',
      title: 'main.scad',
      params: { viewId: 'view:new', entryPath: 'models/main.scad' },
      position: { direction: 'within', referenceGroup: group, index: 1 },
    });
    expect(onViewCreated).toHaveBeenCalledExactlyOnceWith('view:new', 'models/main.scad');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('listViewerSelectableFiles', () => {
  const entry = (path: string, type: 'dir' | 'file'): FileEntry =>
    ({
      path,
      name: path.split('/').pop() ?? path,
      type,
      size: 0,
      isLoaded: true,
      mtimeMs: 0,
    }) as FileEntry;

  const capabilities = (...registrations: CapabilitiesManifest['registrations']): CapabilitiesManifest => ({
    registrations,
    routes: [],
    renderCapabilities: {},
  });

  it('returns kernel-supported files in stable path order without directories', () => {
    const tree = new Map([
      ['src/z.scad', entry('src/z.scad', 'file')],
      ['src', entry('src', 'dir')],
      ['main.scad', entry('main.scad', 'file')],
      ['thumbnail.webp', entry('thumbnail.webp', 'file')],
    ]);

    expect(
      listViewerSelectableFiles(
        tree,
        capabilities({ kind: 'kernel', id: 'openrscad', extensions: ['scad'] }, { kind: 'transcoder', id: 'image' }),
      ),
    ).toEqual([
      { name: 'main.scad', path: 'main.scad', size: 0 },
      { name: 'z.scad', path: 'src/z.scad', size: 0 },
    ]);
  });

  it('supports compound declarations and excludes GeoSpec files even from wildcard kernels', () => {
    const tree = new Map([
      ['main.ts', entry('main.ts', 'file')],
      ['model.MESH.XML', entry('model.MESH.XML', 'file')],
      ['notes.xml', entry('notes.xml', 'file')],
      ['checks/sample.geospec.ts', entry('checks/sample.geospec.ts', 'file')],
      ['checks/sample.GEOSPEC.JS', entry('checks/sample.GEOSPEC.JS', 'file')],
    ]);

    expect(
      listViewerSelectableFiles(
        tree,
        capabilities(
          { kind: 'kernel', id: 'replicad', extensions: ['ts', 'js'] },
          { kind: 'kernel', id: 'assimp', extensions: ['mesh.xml'] },
          { kind: 'kernel', id: 'rhino', extensions: ['*'] },
        ),
      ),
    ).toEqual([
      { name: 'main.ts', path: 'main.ts', size: 0 },
      { name: 'model.MESH.XML', path: 'model.MESH.XML', size: 0 },
      { name: 'notes.xml', path: 'notes.xml', size: 0 },
    ]);
  });
});

describe('ViewerEmptyFilePicker', () => {
  it('distinguishes pending capabilities from a resolved empty candidate list', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(createElement(ViewerEmptyFilePicker, { files: undefined, onSelect, onClose }));

    expect(screen.getByText('Loading runtime formats…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close tab' })).toBeInTheDocument();

    rerender(createElement(ViewerEmptyFilePicker, { files: [], onSelect, onClose }));
    expect(screen.getByText('No runtime-supported viewer files found.')).toBeInTheDocument();
  });

  it('scrolls from ten files and keeps selection and close actions direct', () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      name: `part-${index}.scad`,
      path: `parts/part-${index}.scad`,
    }));
    const onSelect = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(createElement(ViewerEmptyFilePicker, { files, onSelect, onClose }));

    expect(screen.getByTestId('viewer-empty-file-list')).toHaveClass('overflow-y-auto');
    expect(screen.getAllByText('Open')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'part-0.scad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close tab' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('parts/part-0.scad');
    expect(onClose).toHaveBeenCalledOnce();

    rerender(createElement(ViewerEmptyFilePicker, { files: files.slice(0, 9), onSelect, onClose }));
    expect(screen.getByTestId('viewer-empty-file-list')).not.toHaveClass('overflow-y-auto');
  });
});

describe('handleViewerDrop', () => {
  const settings = { ...defaultGraphicsSettings, cameraFov: 50 };

  it('opens an editor tab drop in the target Viewer split and creates its runtime state', () => {
    const addPanel = vi.fn();
    const onViewCreated = vi.fn();
    const group = { id: 'viewer-group', panels: [] } as unknown as DockviewGroupPanel;
    const dataTransfer = {
      getData: (type: string) =>
        type === tauEditorPanelDragMime ? JSON.stringify({ filePath: 'src/assembly.scad' }) : '',
    } as DataTransfer;

    handleViewerDrop({
      event: {
        api: { addPanel } as unknown as DockviewApi,
        nativeEvent: { dataTransfer } as DragEvent,
        position: 'right',
        group,
      } as DockviewDidDropEvent,
      getInheritedSettings: () => settings,
      onViewCreated,
    });

    expect(addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        component: 'viewer',
        title: 'assembly.scad',
        position: { direction: 'right', referenceGroup: group },
      }),
    );
    const added = addPanel.mock.calls[0]![0] as { id: string; params: { entryPath: string } };
    expect(added.params.entryPath).toBe('src/assembly.scad');
    expect(onViewCreated).toHaveBeenCalledExactlyOnceWith(added.id, 'src/assembly.scad', settings);
  });

  it('activates an existing Viewer for a file-tree drop instead of duplicating it', () => {
    const setActive = vi.fn();
    const addPanel = vi.fn();
    const group = {
      id: 'viewer-group',
      panels: [{ params: { entryPath: 'src/assembly.scad' }, api: { setActive } }],
    } as unknown as DockviewGroupPanel;
    const dataTransfer = {
      getData: (type: string) =>
        type === tauFileDragMime ? JSON.stringify(['src/assembly.scad', 'src/ignored.scad']) : '',
    } as DataTransfer;

    handleViewerDrop({
      event: {
        api: { addPanel } as unknown as DockviewApi,
        nativeEvent: { dataTransfer } as DragEvent,
        position: 'center',
        group,
      } as DockviewDidDropEvent,
      getInheritedSettings: () => settings,
      onViewCreated: vi.fn(),
    });

    expect(setActive).toHaveBeenCalledOnce();
    expect(addPanel).not.toHaveBeenCalled();
  });
});
