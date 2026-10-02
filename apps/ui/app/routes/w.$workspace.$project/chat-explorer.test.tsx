// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentAppearance, GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { ActorRefFrom } from 'xstate';
import { createActor } from 'xstate';
import { StrictMode } from 'react';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { createSourceModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import * as partThumbnailVisual from '#services/part-thumbnail-visual.js';
import {
  ChatExplorerTree,
  ComponentRow,
  getComponentRowPaddingLeft,
  getVisibleModelComponents,
} from '#routes/w.$workspace.$project/chat-explorer.js';

const mocks = vi.hoisted(() => ({
  addContextReferences: vi.fn(),
  paneApis: new Map<string, { setExpanded: ReturnType<typeof vi.fn> }>(),
  useProject: vi.fn(),
  imageService: undefined as undefined | { export: ReturnType<typeof vi.fn> },
  paneBodyVisible: true,
}));
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const unitId = 'src/main.ts';
const internalUnitId = createSourceModelInteractionUnitId(unitId);

vi.mock('#components/chat/chat-context-insertion.js', () => ({
  geometryReferenceToToken: () => '@cad[src/main.ts#component]',
  useChatContextInsertion: () => ({ addContextReferences: mocks.addContextReferences }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: mocks.useProject,
}));

vi.mock('#providers/headless-image-provider.js', () => ({
  useOptionalHeadlessImageService: () => mocks.imageService,
}));

vi.mock('#hooks/use-keyboard.js', () => ({
  useKeybinding: () => ({ formattedKeyCombination: 'Ctrl+A' }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: <Snapshot, Value>(actor: { getSnapshot: () => Snapshot }, selector: (snapshot: Snapshot) => Value) =>
    selector(actor.getSnapshot()),
}));

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  usePaneviewPersistence: () => ({ savedState: {}, connectApi: vi.fn() }),
  getInitialPanelOptions: (
    _saved: Record<string, unknown>,
    _panelId: string,
    defaults: { isExpanded: boolean; size?: number },
  ) => defaults,
}));

vi.mock('dockview-react', () => ({
  PaneviewReact: ({
    onReady,
    components,
    headerComponents,
  }: {
    onReady: (event: { api: Record<string, unknown> }) => void;
    components: Record<string, React.ComponentType<{ params: Record<string, unknown> }>>;
    headerComponents: Record<
      string,
      React.ComponentType<{ api: Record<string, unknown>; params: Record<string, unknown> }>
    >;
  }) => {
    type MockPanel = {
      id: string;
      component: string;
      headerComponent: string;
      headerSize: number;
      isExpanded: boolean;
      minimumBodySize: number;
      size: number;
      params: Record<string, unknown>;
      api: Record<string, unknown>;
    };
    const panels: MockPanel[] = [];
    const api = {
      panels,
      addPanel: (options: Omit<MockPanel, 'api'>) => {
        const setExpanded = vi.fn();
        const panelApi = {
          isExpanded: options.isExpanded,
          onDidExpansionChange: () => ({ dispose: vi.fn() }),
          setExpanded,
          setSize: vi.fn(),
          updateParameters: (next: Record<string, unknown>) => {
            Object.assign(options.params, next);
          },
        };
        mocks.paneApis.set(options.id, { setExpanded });
        panels.push({ ...options, api: panelApi });
      },
      getPanel: (id: string) => panels.find((panel) => panel.id === id),
    };
    onReady({ api });

    return (
      <div data-testid='model-paneview'>
        {panels.map((panel) => {
          const Header = headerComponents[panel.headerComponent]!;
          const Body = components[panel.component]!;
          return (
            <section
              key={panel.id}
              data-testid={`model-pane-${panel.id}`}
              data-expanded={String(panel.isExpanded)}
              data-header-size={panel.headerSize}
              data-minimum-body-size={panel.minimumBodySize}
              data-size={panel.size}
            >
              <Header api={panel.api} params={panel.params} />
              {mocks.paneBodyVisible && <Body params={panel.params} />}
            </section>
          );
        })}
      </div>
    );
  },
}));

const firstComponentId = 'component:first';
const secondComponentId = 'component:second';

const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
};

describe('Model component projection', () => {
  it('should retain traversal order and matching ancestors without unrelated descendants', () => {
    const parent = createNode('assembly', 'Nozzle');
    const child = createNode('tube', 'Cooling tube');
    const sibling = createNode('wall', 'Hot wall');
    parent.childIds = [child.id, sibling.id];
    child.parentId = parent.id;
    child.depth = 2;
    sibling.parentId = parent.id;
    sibling.depth = 2;
    const manifest = createManifest([parent, child, sibling]);
    manifest.nodesById['root']!.childIds = [parent.id];
    expect(getVisibleModelComponents(manifest, '').map((node) => node.id)).toEqual(['assembly', 'tube', 'wall']);
    expect(getVisibleModelComponents(manifest, 'cooling').map((node) => node.id)).toEqual(['assembly', 'tube']);
    expect(getVisibleModelComponents(manifest, 'nozzle').map((node) => node.id)).toEqual(['assembly']);
    expect(getVisibleModelComponents(manifest, 'absent')).toEqual([]);
  });
});

function createNode(id: string, name: string, appearance?: GeometryComponentAppearance): GeometryComponentNode {
  return {
    id,
    name,
    kind: 'part',
    selector: `node/${id}`,
    parentId: 'root',
    childIds: [],
    depth: 1,
    path: ['Model', name],
    meshNodeIndices: [0],
    primitiveIndices: [0],
    materialIndices: [0],
    appearance,
    capabilities,
  };
}

function createManifest(nodes: GeometryComponentNode[], sourceFile = unitId): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile,
    rootId: 'root',
    nodeOrder: ['root', ...nodes.map((node) => node.id)],
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: nodes.map((node) => node.id),
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      ...Object.fromEntries(nodes.map((node) => [node.id, node])),
    },
    capabilities,
  };
}

type StaticActor<Snapshot> = {
  getSnapshot: () => Snapshot;
  subscribe: () => { unsubscribe: () => void };
  on: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
};

type EditorTestActor = StaticActor<{
  readonly context: { readonly viewSettings: Record<string, { readonly entryPath: string }> };
}>;

function createStaticActor<Snapshot>(snapshot: Snapshot): StaticActor<Snapshot> {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: vi.fn() }),
    on: vi.fn(() => ({ unsubscribe: vi.fn() })),
    send: vi.fn(),
  };
}

function createTestEditorActor(snapshot: {
  readonly context: { readonly viewSettings: Record<string, { readonly entryPath: string }> };
}): EditorTestActor & { readonly emit: (type: string, event: unknown) => void } {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    ...createStaticActor(snapshot),
    on: vi.fn((type: string, listener: (event: unknown) => void) => {
      const eventListeners = listeners.get(type) ?? new Set<(event: unknown) => void>();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);
      return {
        unsubscribe: () => {
          eventListeners.delete(listener);
        },
      };
    }),
    emit: (type: string, event: unknown) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}

function createGraphicsRefForUnit(
  entryPath: string,
  nodes: GeometryComponentNode[],
  {
    hiddenComponentIds = [],
    selectedComponentIds = [],
    previewGeometry,
  }: {
    readonly hiddenComponentIds?: readonly string[];
    readonly selectedComponentIds?: readonly string[];
    readonly previewGeometry?: { readonly hash: string; readonly content: Uint8Array<ArrayBuffer> };
  } = {},
): ActorRefFrom<typeof graphicsMachine> {
  const modelRef = createActor(modelInteractionMachine, { input: {} });
  modelRef.start();
  const modelUnitId = createSourceModelInteractionUnitId(entryPath);
  modelRef.send({ type: 'loadManifest', unitId: modelUnitId, manifest: createManifest(nodes, entryPath) });
  for (const componentId of hiddenComponentIds) {
    modelRef.send({ type: 'hideComponent', unitId: modelUnitId, componentId });
  }
  for (const componentId of selectedComponentIds) {
    modelRef.send({ type: 'selectComponent', unitId: modelUnitId, componentId });
  }

  // The graphics machine owns its model-interaction actor as a context ref
  // (`context.modelInteractionRef`), not as a named child — chat-explorer
  // selects it straight off the snapshot context.
  return createStaticActor({
    context: {
      modelInteractionRef: modelRef,
      artifact: previewGeometry && { mimeType: 'model/gltf-binary', content: previewGeometry.content },
      artifactKey: previewGeometry?.hash,
      gltfPresentation: { presentedKey: previewGeometry?.hash },
    },
  }) as unknown as ActorRefFrom<typeof graphicsMachine>;
}

function mockProjectForExplorer({
  mainEntryPath,
  viewSettings,
  viewGraphics,
  geometryUnitFiles,
  editorRef = createStaticActor({ context: { viewSettings } }),
  viewEntryPaths = new Map(Object.entries(viewSettings).map(([id, view]) => [id, view.entryPath])),
}: {
  readonly mainEntryPath: string;
  readonly viewSettings: Record<string, { readonly entryPath: string }>;
  readonly viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  readonly geometryUnitFiles: readonly string[];
  readonly editorRef?: EditorTestActor;
  readonly viewEntryPaths?: ReadonlyMap<string, string>;
}): void {
  mocks.useProject.mockReturnValue({
    mainEntryPath,
    editorRef,
    viewGraphics,
    viewEntryPaths,
    viewRecords: new Map(Object.entries(viewSettings)),
    geometryUnits: new Map(geometryUnitFiles.map((entryPath) => [entryPath, createStaticActor({})])),
  });
}

function renderExplorerTree({
  isExpanded = true,
  setIsExpanded,
  strictMode = false,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
  readonly strictMode?: boolean;
} = {}): ReturnType<typeof render> {
  const tree = (
    <TooltipProvider>
      <ChatExplorerTree isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
    </TooltipProvider>
  );
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
}

function renderComponentRow(properties: Parameters<typeof ComponentRow>[0]): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <ComponentRow {...properties} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.addContextReferences.mockReset();
  mocks.paneApis.clear();
  mocks.useProject.mockReset();
  mocks.imageService = undefined;
  mocks.paneBodyVisible = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [name, original] of [
    ['createObjectURL', originalCreateObjectUrl],
    ['revokeObjectURL', originalRevokeObjectUrl],
  ] as const) {
    if (original) {
      Object.defineProperty(URL, name, original);
    } else {
      Reflect.deleteProperty(URL, name);
    }
  }
});

describe('ChatExplorerTree', () => {
  it('refuses a small GLB view backed by an oversized allocation before preview preparation', async () => {
    const digest = vi.spyOn(partThumbnailVisual, 'sourceGlbDigest');
    const prepare = vi.spyOn(partThumbnailVisual, 'canonicalPartPreviews');
    const fail = vi.spyOn(PartThumbnailService.prototype, 'failPreparationForOwner');
    const part = {
      ...createNode(firstComponentId, 'Large backing buffer'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    mocks.imageService = { export: vi.fn() };
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([
        [
          'mainView',
          createGraphicsRefForUnit('src/main.ts', [part], {
            selectedComponentIds: [firstComponentId],
            previewGeometry: {
              hash: 'presented-glb',
              content: new Uint8Array(new ArrayBuffer(64 * 1024 * 1024 + 1), 0, 3),
            },
          }),
        ],
      ]),
    });
    renderExplorerTree();
    await waitFor(() => {
      expect(fail).toHaveBeenCalledWith('explorer', expect.any(Array), expect.any(RangeError));
    });
    expect(digest).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('submits only the presented, visible part primitives to the shared image queue', async () => {
    const exportImage = vi.fn().mockResolvedValue(undefined);
    mocks.imageService = { export: exportImage };
    const part = {
      ...createNode(firstComponentId, 'housing'),
      primitiveRefs: [
        { nodeIndex: 2, meshIndex: 1, primitiveIndex: 0 },
        { nodeIndex: 2, meshIndex: 1, primitiveIndex: 1 },
      ],
    };
    const graphicsRef = createGraphicsRefForUnit('src/main.ts', [part], {
      previewGeometry: { hash: 'presented-glb', content: new Uint8Array([1, 2, 3]) },
      selectedComponentIds: [firstComponentId],
    });
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([['mainView', graphicsRef]]),
    });
    renderExplorerTree({ strictMode: true });
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalled();
    });
    expect(exportImage.mock.calls[0]?.[0].geometryHash).toMatch(/^sha256:/u);
    expect(exportImage.mock.calls[0]?.[0]).toMatchObject({
      sourcePath: 'src/main.ts',
      exportOptions: {
        mode: 'batch',
        views: [{ visiblePrimitives: part.primitiveRefs }],
      },
    });
  });

  it('should observe newly mounted rows and releases removed-row preview demand', async () => {
    const demands = vi.spyOn(PartThumbnailService.prototype, 'requestForOwner');
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    let intersect: IntersectionObserverCallback | undefined;
    const observer = mock<IntersectionObserver>({ observe, unobserve, disconnect });
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (callback: IntersectionObserverCallback) {
        intersect = callback;
        return observer;
      }),
    );
    const exportImage = vi.fn().mockResolvedValue(undefined);
    mocks.imageService = { export: exportImage };
    const parts = [firstComponentId, secondComponentId].map((id, index) => ({
      ...createNode(id, `Part ${index + 1}`),
      primitiveRefs: [{ nodeIndex: index, meshIndex: index, primitiveIndex: 0 }],
    }));
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([
        [
          'mainView',
          createGraphicsRefForUnit('src/main.ts', parts, {
            previewGeometry: { hash: 'presented-glb', content: new Uint8Array([1, 2, 3]) },
          }),
        ],
      ]),
    });
    renderExplorerTree();
    const first = screen.getByRole('button', { name: 'Part 1' }).closest<HTMLElement>('[data-model-component-row]')!;
    const second = screen.getByRole('button', { name: 'Part 2' }).closest<HTMLElement>('[data-model-component-row]')!;
    expect(observe).toHaveBeenCalledWith(first);
    expect(observe).toHaveBeenCalledWith(second);
    act(() => intersect?.([{ ...mock<IntersectionObserverEntry>(), target: first, isIntersecting: true }], observer));
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(1);
    });
    first.remove();
    await waitFor(() => {
      expect(unobserve).toHaveBeenCalledWith(first);
    });
    await waitFor(() => {
      expect(demands.mock.lastCall?.[2]).toEqual([]);
    });
    act(() => intersect?.([{ ...mock<IntersectionObserverEntry>(), target: first, isIntersecting: true }], observer));
    expect(demands.mock.lastCall?.[2]).toEqual([]);
    const parent = second.parentElement!;
    second.remove();
    await waitFor(() => {
      expect(unobserve).toHaveBeenCalledWith(second);
    });
    act(() => intersect?.([{ ...mock<IntersectionObserverEntry>(), target: second, isIntersecting: true }], observer));
    expect(exportImage).toHaveBeenCalledTimes(1);
    const mounts = observe.mock.calls.length;
    parent.append(second);
    await waitFor(() => {
      expect(observe.mock.calls.length).toBeGreaterThan(mounts);
    });
    act(() => intersect?.([{ ...mock<IntersectionObserverEntry>(), target: second, isIntersecting: true }], observer));
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(2);
    });
    expect(exportImage.mock.calls[1]?.[0].exportOptions.views).toMatchObject([
      { visiblePrimitives: parts[1]!.primitiveRefs },
    ]);
    const staleIntersect = intersect;
    const scroller = screen
      .getByTestId('model-pane-src/main.ts')
      .querySelector<HTMLElement>('[data-slot="model-unit-scroller"]')!;
    scroller.scrollTop = 27;
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter parts' }), { target: { value: 'Part 1' } });
    expect(screen.getByTestId('model-pane-src/main.ts').querySelector('[data-slot="model-unit-scroller"]')).toBe(
      scroller,
    );
    expect(scroller.scrollTop).toBe(27);
    await waitFor(() => {
      expect(demands.mock.lastCall?.[2]).toEqual([]);
    });
    act(() =>
      staleIntersect?.([{ ...mock<IntersectionObserverEntry>(), target: second, isIntersecting: true }], observer),
    );
    expect(demands.mock.lastCall?.[2]).toEqual([]);
  });

  it('observes part rows when Paneview attaches the scroller later', async () => {
    mocks.paneBodyVisible = false;
    const observe = vi.fn();
    let intersect: IntersectionObserverCallback | undefined;
    const observer = mock<IntersectionObserver>({ observe, unobserve: vi.fn(), disconnect: vi.fn() });
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (callback: IntersectionObserverCallback) {
        intersect = callback;
        return observer;
      }),
    );
    const exportImage = vi.fn().mockResolvedValue(undefined);
    mocks.imageService = { export: exportImage };
    const part = {
      ...createNode(firstComponentId, 'Late part'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([
        [
          'mainView',
          createGraphicsRefForUnit('src/main.ts', [part], {
            previewGeometry: { hash: 'presented-glb', content: new Uint8Array([1, 2, 3]) },
          }),
        ],
      ]),
    });
    const view = renderExplorerTree();
    expect(screen.queryByRole('button', { name: 'Late part' })).not.toBeInTheDocument();
    mocks.paneBodyVisible = true;
    view.rerender(
      <TooltipProvider>
        <ChatExplorerTree />
      </TooltipProvider>,
    );
    const row = screen.getByRole('button', { name: 'Late part' }).closest<HTMLElement>('[data-model-component-row]')!;
    expect(observe).toHaveBeenCalledWith(row);
    act(() => intersect?.([{ ...mock<IntersectionObserverEntry>(), target: row, isIntersecting: true }], observer));
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(1);
    });
  });

  it('submits each completed same-part retry as one manual preview request', async () => {
    const exportImage = vi.fn().mockRejectedValue(new Error('Preview unavailable'));
    mocks.imageService = { export: exportImage };
    const part = {
      ...createNode(firstComponentId, 'Retry part'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([
        [
          'mainView',
          createGraphicsRefForUnit('src/main.ts', [part], {
            selectedComponentIds: [firstComponentId],
            previewGeometry: { hash: 'presented-glb', content: new Uint8Array([1, 2, 3]) },
          }),
        ],
      ]),
    });
    renderExplorerTree();
    const properties = screen.getByTestId('model-pane-properties');
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(1);
    });
    for (const count of [1, 2]) {
      // oxlint-disable-next-line no-await-in-loop -- Each failed retry must settle before the next click.
      fireEvent.click(await within(properties).findByRole('button', { name: 'Retry preview' }));
      // oxlint-disable-next-line no-await-in-loop -- Each failed retry must settle before the next click.
      await waitFor(() => {
        expect(exportImage.mock.calls.filter(([job]) => job.kind === 'manual-thumbnail')).toHaveLength(count);
      });
    }
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter parts' }), { target: { value: 'Retry' } });
    expect(exportImage.mock.calls.filter(([job]) => job.kind === 'manual-thumbnail')).toHaveLength(2);
  });

  it('does not resurrect an unsubmitted A retry after presenting B and returning to A', async () => {
    const requests = vi.spyOn(PartThumbnailService.prototype, 'requestForOwner');
    const exportImage = vi.fn().mockRejectedValue(new Error('Preview unavailable'));
    mocks.imageService = { export: exportImage };
    const part = {
      ...createNode(firstComponentId, 'Retry part'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    const contentA = new Uint8Array([1, 2, 3]);
    const contentB = new Uint8Array([4, 5, 6]);
    const present = (hash: string, content: Uint8Array<ArrayBuffer>): void => {
      mockProjectForExplorer({
        mainEntryPath: 'src/main.ts',
        geometryUnitFiles: ['src/main.ts'],
        viewSettings: { mainView: { entryPath: 'src/main.ts' } },
        viewGraphics: new Map([
          [
            'mainView',
            createGraphicsRefForUnit('src/main.ts', [part], {
              selectedComponentIds: [firstComponentId],
              previewGeometry: { hash, content },
            }),
          ],
        ]),
      });
    };
    const tree = () => (
      <TooltipProvider>
        <ChatExplorerTree />
      </TooltipProvider>
    );
    present('source-a', contentA);
    const view = render(tree());
    const properties = screen.getByTestId('model-pane-properties');
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(1);
    });
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof partThumbnailVisual.canonicalPartPreviews>>>();
    const originalPrepare = partThumbnailVisual.canonicalPartPreviews;
    const prepare = vi
      .spyOn(partThumbnailVisual, 'canonicalPartPreviews')
      .mockImplementation(async () => pending.promise);
    fireEvent.click(await within(properties).findByRole('button', { name: 'Retry preview' }));
    await waitFor(() => {
      expect(prepare).toHaveBeenCalled();
    });
    prepare.mockImplementation(originalPrepare);
    present('source-b', contentB);
    view.rerender(tree());
    await waitFor(() => {
      expect(requests.mock.calls.some((call) => call[1].content === contentB)).toBe(true);
    });
    const beforeReturn = requests.mock.calls.length;
    present('source-a', contentA);
    view.rerender(tree());
    await waitFor(() => {
      expect(requests.mock.calls.slice(beforeReturn).some((call) => call[1].content === contentA)).toBe(true);
    });
    expect(requests.mock.calls.filter((call) => call[3]?.manualPartId === firstComponentId)).toHaveLength(0);
    pending.resolve({ visualKey: 'old', previews: [{ key: 'old' }] });
    fireEvent.click(await within(properties).findByRole('button', { name: 'Retry preview' }));
    await waitFor(() => {
      expect(requests.mock.calls.filter((call) => call[3]?.manualPartId === firstComponentId)).toHaveLength(1);
    });
  });

  it('keeps the selected unit preview when another unit finishes later', async () => {
    let nextUrl = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => `blob:part-${++nextUrl}`),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const first = Promise.withResolvers<Array<{ name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }>>();
    const second = Promise.withResolvers<Array<{ name: string; mimeType: string; bytes: Uint8Array<ArrayBuffer> }>>();
    const exportImage = vi.fn(async (job: { sourcePath: string }) =>
      job.sourcePath === 'src/main.ts' ? first.promise : second.promise,
    );
    mocks.imageService = { export: exportImage };
    const main = {
      ...createNode(firstComponentId, 'main_part'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    const helper = {
      ...createNode(secondComponentId, 'helper_part'),
      primitiveRefs: [{ nodeIndex: 1, meshIndex: 1, primitiveIndex: 0 }],
    };
    const mainRef = createGraphicsRefForUnit('src/main.ts', [main], {
      selectedComponentIds: [firstComponentId],
      previewGeometry: { hash: 'main-glb', content: new Uint8Array([1]) },
    });
    const helperRef = createGraphicsRefForUnit('src/helper.ts', [helper], {
      selectedComponentIds: [secondComponentId],
      previewGeometry: { hash: 'helper-glb', content: new Uint8Array([2]) },
    });
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts', 'src/helper.ts'],
      viewSettings: {
        mainView: { entryPath: 'src/main.ts' },
        helperView: { entryPath: 'src/helper.ts' },
      },
      viewGraphics: new Map([
        ['mainView', mainRef],
        ['helperView', helperRef],
      ]),
    });
    renderExplorerTree();
    await waitFor(() => {
      expect(exportImage).toHaveBeenCalledTimes(2);
    });
    const properties = screen.getByTestId('model-pane-properties');
    expect(properties).toHaveTextContent('helper_part');
    await act(async () => {
      second.resolve([{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([2]) }]);
    });
    await waitFor(() => {
      expect(properties.querySelector('[data-slot="part-properties"] img')).toBeTruthy();
    });
    const selectedSource = properties.querySelector('[data-slot="part-properties"] img')?.getAttribute('src');
    await act(async () => {
      first.resolve([{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) }]);
    });
    await waitFor(() => {
      expect(screen.getByTestId('model-pane-src/main.ts').querySelector('img')).toBeTruthy();
    });
    expect(properties.querySelector('[data-slot="part-properties"] img')?.getAttribute('src')).toBe(selectedSource);
  });

  it('keeps a restored hidden viewer file in the model list before its CAD unit starts', () => {
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: {
        mainView: { entryPath: 'src/main.ts' },
        hiddenView: { entryPath: 'src/hidden.ts' },
      },
      viewGraphics: new Map(),
    });

    renderExplorerTree();

    expect(screen.getByRole('button', { name: 'src/hidden.ts' })).toBeInTheDocument();
    expect(screen.getByTestId('model-pane-src/hidden.ts')).toBeInTheDocument();
  });

  it('should render the empty project state through PanelEmptyState', () => {
    mocks.useProject.mockReturnValue(null);

    renderExplorerTree();

    expect(screen.getByRole('searchbox', { name: 'Filter parts' })).toHaveAttribute('placeholder', 'Filter parts…');
    expect(screen.getByText('No model components available').closest('[data-slot="panel-empty-state"]')).toBeTruthy();
  });

  it('should render default-open Paneview units and filter every unit from one permanent input', async () => {
    const user = userEvent.setup();
    const mainNode = createNode(firstComponentId, 'main_part');
    const helperNode = createNode(secondComponentId, 'helper_part');
    const mainGraphicsRef = createGraphicsRefForUnit('src/main.ts', [mainNode]);
    const helperGraphicsRef = createGraphicsRefForUnit('src/helper.ts', [helperNode]);
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/helper.ts', 'src/main.ts'],
      viewSettings: {
        mainView: { entryPath: 'src/main.ts' },
        helperView: { entryPath: 'src/helper.ts' },
      },
      viewGraphics: new Map([
        ['mainView', mainGraphicsRef],
        ['helperView', helperGraphicsRef],
      ]),
    });

    renderExplorerTree();

    const unitHeaders = screen.getAllByRole('button', { name: /src\/.+\.ts/ });
    expect(unitHeaders[0]).toHaveAccessibleName('src/main.ts');
    expect(unitHeaders[1]).toHaveAccessibleName('src/helper.ts');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('model-pane-src/helper.ts')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-size', '200');
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-minimum-body-size', '144');
    expect(screen.getByTestId('model-pane-properties')).toHaveAttribute('data-size', '392');
    expect(screen.getByText('No part selected')).toBeVisible();
    expect(screen.getByText('main_part')).toBeInTheDocument();
    expect(screen.getByText('helper_part')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show search' })).not.toBeInTheDocument();

    const filterInput = screen.getByRole('searchbox', { name: 'Filter parts' });
    await user.type(filterInput, 'helper');

    expect(screen.queryByText('main_part')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'helper_part' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'helper_part' }).tabIndex).toBe(0);
    expect(screen.getByText('helper')).toHaveAttribute('data-slot', 'highlight');
    expect(screen.getByText('No matching parts').closest('[data-slot="panel-empty-state"]')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(filterInput).toHaveValue('');
    expect(screen.getByText('main_part')).toBeInTheDocument();
  });

  it('should reveal requested model component rows', async () => {
    const user = userEvent.setup();
    const setIsExpanded = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const mainNode = createNode(firstComponentId, 'main_part');
    const helperNode = createNode(secondComponentId, 'helper_part');
    const helperUnitId = createSourceModelInteractionUnitId('src/helper.ts');
    const editorRef = createTestEditorActor({
      context: {
        viewSettings: {
          mainView: { entryPath: 'src/main.ts' },
          helperView: { entryPath: 'src/helper.ts' },
        },
      },
    });
    try {
      mockProjectForExplorer({
        mainEntryPath: 'src/main.ts',
        geometryUnitFiles: ['src/main.ts', 'src/helper.ts'],
        viewSettings: {
          mainView: { entryPath: 'src/main.ts' },
          helperView: { entryPath: 'src/helper.ts' },
        },
        viewGraphics: new Map([
          ['mainView', createGraphicsRefForUnit('src/main.ts', [mainNode])],
          [
            'helperView',
            createGraphicsRefForUnit('src/helper.ts', [helperNode], {
              selectedComponentIds: [secondComponentId],
            }),
          ],
        ]),
        editorRef,
      });

      renderExplorerTree({ setIsExpanded });

      await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'main');

      act(() => {
        editorRef.emit('modelComponentRevealRequested', {
          type: 'modelComponentRevealRequested',
          entryPath: 'src/helper.ts',
          unitId: helperUnitId,
          componentId: secondComponentId,
        });
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'helper_part' })).toHaveFocus();
      });
      expect(setIsExpanded).toHaveBeenCalledWith(true);
      expect(screen.getByRole('searchbox', { name: 'Filter parts' })).toHaveValue('');
      expect(mocks.paneApis.get('src/helper.ts')?.setExpanded).toHaveBeenCalledWith(true);
      const rowButton = screen.getByRole('button', { name: 'helper_part' });
      const row = rowButton.parentElement;
      expect(rowButton).toHaveAttribute('aria-pressed', 'true');
      expect(rowButton.tabIndex).toBe(0);
      expect(rowButton).toHaveFocus();
      expect(row).toHaveAttribute('data-model-component-row');
      expect(row).toHaveAttribute('data-model-component-unit-id', helperUnitId);
      expect(row).toHaveAttribute('data-model-component-id', secondComponentId);
      expect(row).toHaveClass('bg-primary/10');
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('should keep one visible part Tab stop when filtering out the selected row', async () => {
    const user = userEvent.setup();
    const first = createNode(firstComponentId, 'planetary_housing');
    const second = createNode(secondComponentId, 'sun_gear_assembly');
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([
        [
          'mainView',
          createGraphicsRefForUnit('src/main.ts', [first, second], { selectedComponentIds: [firstComponentId] }),
        ],
      ]),
    });

    renderExplorerTree();
    expect(screen.getByRole('button', { name: 'planetary_housing' }).tabIndex).toBe(0);
    await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'sun');
    const visible = screen.getByRole('button', { name: 'sun_gear_assembly' });
    expect(visible.tabIndex).toBe(0);
    act(() => {
      visible.focus();
    });
    expect(visible).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Actions for sun_gear_assembly' }).tabIndex).toBe(-1);
  });

  it('should move the single part Tab stop with arrows, Home, and End', async () => {
    const user = userEvent.setup();
    const first = createNode(firstComponentId, 'planetary_housing');
    const second = createNode(secondComponentId, 'sun_gear_assembly');
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([['mainView', createGraphicsRefForUnit('src/main.ts', [first, second])]]),
    });

    renderExplorerTree();
    const firstButton = screen.getByRole('button', { name: 'planetary_housing' });
    const secondButton = screen.getByRole('button', { name: 'sun_gear_assembly' });
    act(() => {
      firstButton.focus();
    });
    expect(firstButton.tabIndex).toBe(0);
    await user.keyboard('{ArrowDown}');
    expect(secondButton).toHaveFocus();
    expect(secondButton.tabIndex).toBe(0);
    expect(firstButton.tabIndex).toBe(-1);
    await user.keyboard('{Home}');
    expect(firstButton).toHaveFocus();
    await user.keyboard('{End}');
    expect(secondButton).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(firstButton).toHaveFocus();
  });

  it('should find a part by its indexed source material name', async () => {
    const user = userEvent.setup();
    const namedMaterial = createNode(firstComponentId, 'housing', {
      // oxlint-disable-next-line tau-lint/no-hardcoded-color -- GLB material color is source fixture data.
      materials: [{ materialIndex: 3, name: 'Brushed steel', color: '#aabbcc' }],
    });
    const other = createNode(secondComponentId, 'sun_gear');
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([['mainView', createGraphicsRefForUnit('src/main.ts', [namedMaterial, other])]]),
    });

    renderExplorerTree();
    await user.type(screen.getByRole('searchbox', { name: 'Filter parts' }), 'brushed');
    expect(screen.getByRole('button', { name: 'housing' })).toBeInTheDocument();
    expect(screen.getByText('· Brushed steel')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'sun_gear' })).not.toBeInTheDocument();
  });

  it('should clear Properties when its selected model unit closes', async () => {
    const selected = createNode(firstComponentId, 'housing');
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([
        ['mainView', createGraphicsRefForUnit('src/main.ts', [selected], { selectedComponentIds: [firstComponentId] })],
      ]),
    });
    const view = renderExplorerTree();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Physical facts' })).toBeVisible();
    });

    mockProjectForExplorer({
      mainEntryPath: 'src/other.ts',
      geometryUnitFiles: ['src/other.ts'],
      viewSettings: { otherView: { entryPath: 'src/other.ts' } },
      viewGraphics: new Map([
        ['otherView', createGraphicsRefForUnit('src/other.ts', [createNode(secondComponentId, 'gear')])],
      ]),
    });
    view.rerender(
      <TooltipProvider>
        <ChatExplorerTree isExpanded />
      </TooltipProvider>,
    );
    expect(screen.getByText('No part selected')).toBeVisible();
  });

  it('should open requested unavailable renderer sections', async () => {
    const setIsExpanded = vi.fn();
    const mainNode = createNode(firstComponentId, 'main_part');
    const editorRef = createTestEditorActor({
      context: {
        viewSettings: {
          mainView: { entryPath: 'src/main.ts' },
        },
      },
    });
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts', 'src/unopened.ts'],
      viewSettings: {
        mainView: { entryPath: 'src/main.ts' },
      },
      viewGraphics: new Map([['mainView', createGraphicsRefForUnit('src/main.ts', [mainNode])]]),
      editorRef,
    });

    renderExplorerTree({ setIsExpanded });
    mocks.paneApis.get('src/unopened.ts')?.setExpanded.mockClear();

    act(() => {
      editorRef.emit('modelComponentRevealRequested', {
        type: 'modelComponentRevealRequested',
        entryPath: 'src/unopened.ts',
        unitId: createSourceModelInteractionUnitId('src/unopened.ts'),
        componentId: secondComponentId,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Open renderer to inspect components')).toBeInTheDocument();
    });
    expect(setIsExpanded).toHaveBeenCalledWith(true);
    expect(mocks.paneApis.get('src/unopened.ts')?.setExpanded).toHaveBeenCalledWith(true);
  });

  it('should surface compilation units without an active renderer as unavailable', () => {
    const mainNode = createNode(firstComponentId, 'main_part');
    const mainGraphicsRef = createGraphicsRefForUnit('src/main.ts', [mainNode]);
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts', 'src/unopened.ts'],
      viewSettings: {
        mainView: { entryPath: 'src/main.ts' },
      },
      viewGraphics: new Map([['mainView', mainGraphicsRef]]),
    });

    renderExplorerTree();

    expect(screen.getByText('src/main.ts')).toBeInTheDocument();
    expect(screen.getByText('src/unopened.ts')).toBeInTheDocument();
    expect(
      screen.getByText('Open renderer to inspect components').closest('[data-slot="panel-empty-state"]'),
    ).toBeTruthy();
  });

  it('should expose a unit header control to show hidden components', async () => {
    const user = userEvent.setup();
    const mainNode = createNode(firstComponentId, 'main_part');
    const mainGraphicsRef = createGraphicsRefForUnit('src/main.ts', [mainNode], {
      hiddenComponentIds: [firstComponentId],
    });
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: {
        mainView: { entryPath: 'src/main.ts' },
      },
      viewGraphics: new Map([['mainView', mainGraphicsRef]]),
    });

    renderExplorerTree();

    const showHiddenButton = screen.getByRole('button', { name: 'Show hidden components in src/main.ts' });
    expect(showHiddenButton).not.toHaveClass('opacity-0');
    expect(showHiddenButton.className).not.toContain('group-hover');

    await user.click(showHiddenButton);

    expect(mainGraphicsRef.send).toHaveBeenCalledWith({
      type: 'showHiddenModelComponents',
      unitId: 'file:src/main.ts',
      source: 'explorer',
    });
  });
});

describe('Chat explorer component rows', () => {
  it('should use compact panel row density', () => {
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId: internalUnitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    const rowButton = screen.getByRole('button', { name: 'planetary_housing' });
    const row = rowButton.parentElement;

    expect(getComponentRowPaddingLeft({ depth: node.depth, rootDepth: 0 })).toBe(8);
    expect(row).toHaveClass('h-7');
    expect(row).toHaveClass('rounded-md');
    expect(row).toHaveClass('text-sm');
    expect(row).toHaveClass('leading-5');
    expect(row).toHaveStyle({ paddingLeft: '8px' });
  });

  it('should toggle selection from the label row instead of adding the part to chat', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    await user.click(screen.getByRole('button', { name: 'planetary_housing' }));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'toggleModelComponentSelection',
      unitId,
      componentId: firstComponentId,
      source: 'explorer',
    });
    expect(mocks.addContextReferences).not.toHaveBeenCalled();
  });

  it('should reserve selected row styling for selected rows only', () => {
    const selectedNode = createNode(firstComponentId, 'planetary_housing');
    const focusedNode = createNode(secondComponentId, 'sun_gear_assembly');
    const isolatedNode = createNode('component:ring', 'ring_gear');
    const manifest = createManifest([selectedNode, focusedNode, isolatedNode]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    render(
      <TooltipProvider>
        <ComponentRow
          manifest={manifest}
          node={selectedNode}
          graphicsRef={graphicsRef}
          unitId={unitId}
          rootDepth={0}
          hoveredComponentId={undefined}
          isSelected
          isHidden={false}
          isIsolated={false}
          isFocused={false}
          opacity={1}
        />
        <ComponentRow
          manifest={manifest}
          node={focusedNode}
          graphicsRef={graphicsRef}
          unitId={unitId}
          rootDepth={0}
          hoveredComponentId={undefined}
          isSelected={false}
          isHidden={false}
          isIsolated={false}
          isFocused
          opacity={1}
        />
        <ComponentRow
          manifest={manifest}
          node={isolatedNode}
          graphicsRef={graphicsRef}
          unitId={unitId}
          rootDepth={0}
          hoveredComponentId={undefined}
          isSelected={false}
          isHidden={false}
          isIsolated
          isFocused={false}
          opacity={1}
        />
      </TooltipProvider>,
    );

    const selectedRow = screen.getByRole('button', { name: 'planetary_housing' }).parentElement;
    const focusedRow = screen.getByRole('button', { name: 'sun_gear_assembly' }).parentElement;
    const isolatedRow = screen.getByRole('button', { name: 'ring_gear' }).parentElement;

    expect(screen.getByRole('button', { name: 'planetary_housing' })).toHaveAttribute('aria-pressed', 'true');
    expect(selectedRow).toHaveClass('bg-primary/10');
    expect(selectedRow).toHaveClass('text-foreground');
    expect(focusedRow).not.toHaveClass('bg-primary/10');
    expect(focusedRow).toHaveClass('bg-sidebar-accent/70');
    expect(isolatedRow).not.toHaveClass('bg-primary/10');
    expect(screen.getByRole('button', { name: 'Remove isolation for ring_gear' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('should keep the shared model actions while removing reference drawing and export actions', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: firstComponentId,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Actions for planetary_housing' }));

    expect(screen.getByText('Focus on part')).toBeInTheDocument();
    expect(screen.getByText('Add to chat')).toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Isolate')).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
    const dropdownOpacity = screen.getByRole('spinbutton', { name: 'Opacity' });
    await user.click(dropdownOpacity);
    await user.clear(dropdownOpacity);
    await user.type(dropdownOpacity, '42');
    await user.keyboard('{Enter}');
    expect(graphicsRef.send).toHaveBeenLastCalledWith({
      type: 'setModelComponentOpacity',
      unitId,
      componentId: firstComponentId,
      opacity: 0.42,
      source: 'explorer',
    });
    expect(screen.queryByText('Copy @reference')).not.toBeInTheDocument();
    expect(screen.queryByText('View drawings')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show all' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Export part as')).not.toBeInTheDocument();

    await user.click(screen.getByText('Add to chat'));

    expect(mocks.addContextReferences).toHaveBeenCalledWith([
      expect.objectContaining({
        id: `${unitId}#${firstComponentId}`,
        label: 'planetary_housing',
        chipType: 'geometry',
        referenceToken: '@cad[src/main.ts#component]',
      }),
    ]);
  });

  it('should expose the same component actions from a row right-click', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    const row = screen.getByRole('button', { name: 'planetary_housing' }).parentElement;
    fireEvent.contextMenu(row!);

    expect(await screen.findByText('Focus on part')).toBeInTheDocument();
    expect(screen.getByText('Add to chat')).toBeInTheDocument();
    expect(screen.getByText('Hide')).toBeInTheDocument();
    expect(screen.getByText('Isolate')).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
    const contextOpacity = screen.getByRole('spinbutton', { name: 'Opacity' });
    await user.click(contextOpacity);
    await user.clear(contextOpacity);
    await user.type(contextOpacity, '37');
    await user.keyboard('{Enter}');
    expect(graphicsRef.send).toHaveBeenLastCalledWith({
      type: 'setModelComponentOpacity',
      unitId,
      componentId: firstComponentId,
      opacity: 0.37,
      source: 'explorer',
    });

    await user.click(screen.getByText('Hide'));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'hideModelComponent',
      unitId,
      componentId: firstComponentId,
      source: 'explorer',
    });
    expect(mocks.addContextReferences).not.toHaveBeenCalled();
  });

  it('should show stateful tooltips for visible and non-isolated row action icons', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: firstComponentId,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    await user.hover(screen.getByRole('button', { name: 'Hide planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Hide part' })).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Isolate planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Isolate part' })).toBeInTheDocument();
  });

  it('should show stateful tooltips for hidden and isolated row action icons', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: true,
      isIsolated: true,
      isFocused: false,
      opacity: 1,
    });

    await user.hover(screen.getByRole('button', { name: 'Show planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Show part' })).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }));
    expect(await screen.findByRole('tooltip', { name: 'Remove isolation' })).toBeInTheDocument();
  });

  it('should render the material color as the component icon fill', () => {
    const iconColor = 'var(--primary)';
    const node = createNode(firstComponentId, 'sun_gear', { color: iconColor, colors: [iconColor] });
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId: internalUnitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    const rowButton = screen.getByRole('button', { name: 'sun_gear' });
    const icon = screen.getByTestId('component-color-icon');

    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveStyle({ fill: iconColor });
    expect(screen.queryByTestId('component-color-swatch')).not.toBeInTheDocument();
    expect(rowButton.children[0]).toBe(icon);
    expect(rowButton.children[1]).toHaveTextContent('sun_gear');
  });

  it('should keep isolate controls active for isolated rows while another row is hovered', () => {
    const firstNode = createNode(firstComponentId, 'planetary_housing');
    const secondNode = createNode(secondComponentId, 'sun_gear_assembly');
    const manifest = createManifest([firstNode, secondNode]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    render(
      <TooltipProvider>
        <ComponentRow
          manifest={manifest}
          node={firstNode}
          graphicsRef={graphicsRef}
          unitId={unitId}
          rootDepth={0}
          hoveredComponentId={secondComponentId}
          isSelected={false}
          isHidden={false}
          isIsolated
          isFocused={false}
          opacity={1}
        />
        <ComponentRow
          manifest={manifest}
          node={secondNode}
          graphicsRef={graphicsRef}
          unitId={unitId}
          rootDepth={0}
          hoveredComponentId={secondComponentId}
          isSelected={false}
          isHidden={false}
          isIsolated={false}
          isFocused={false}
          opacity={1}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }).tabIndex).toBe(-1);
    expect(screen.getByRole('button', { name: 'Isolate sun_gear_assembly' }).tabIndex).toBe(-1);
  });

  it('should place the keyboard context menu beside its focused part', () => {
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();
    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });
    const button = screen.getByRole('button', { name: 'planetary_housing' });
    const row = button.closest('[data-model-component-row]');
    if (!row) {
      throw new Error('Part row missing');
    }
    const contextMenu = vi.fn();
    row.addEventListener('contextmenu', contextMenu);
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ left: 40, width: 120, bottom: 72 } as DOMRect);

    fireEvent.keyDown(button, { key: 'F10', shiftKey: true });
    expect(contextMenu).toHaveBeenCalledOnce();
    expect(contextMenu.mock.calls[0]?.[0]).toMatchObject({ clientX: 100, clientY: 72 });
  });

  it('should toggle isolation from the first-class target button', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: false,
      isFocused: false,
      opacity: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Isolate planetary_housing' }));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'isolateModelComponent',
      unitId,
      componentId: firstComponentId,
      source: 'explorer',
    });
  });

  it('should clear isolation from an already isolated row target button', async () => {
    const user = userEvent.setup();
    const node = createNode(firstComponentId, 'planetary_housing');
    const manifest = createManifest([node]);
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    renderComponentRow({
      manifest,
      node,
      graphicsRef,
      unitId,
      rootDepth: 0,
      hoveredComponentId: undefined,
      isSelected: false,
      isHidden: false,
      isIsolated: true,
      isFocused: false,
      opacity: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'clearModelComponentIsolation',
      unitId,
      source: 'explorer',
    });
  });
});

describe('shared preview model binding', () => {
  it('should show live components without editor view records', () => {
    mockProjectForExplorer({
      mainEntryPath: unitId,
      geometryUnitFiles: [unitId],
      viewSettings: {},
      viewEntryPaths: new Map([['preview', unitId]]),
      viewGraphics: new Map([
        ['preview', createGraphicsRefForUnit(unitId, [createNode('preview-part', 'Preview part')])],
      ]),
    });
    renderExplorerTree();
    expect(screen.getByText('Preview part')).toBeInTheDocument();
  });
});
