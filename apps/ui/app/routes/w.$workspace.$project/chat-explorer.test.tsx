// @vitest-environment jsdom
import type * as PartGalleryModule from '#components/geometry/cad/part-gallery.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentAppearance, GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { ActorRefFrom } from 'xstate';
import { createActor } from 'xstate';
import { StrictMode } from 'react';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import {
  createSourceModelInteractionUnitId,
  modelInteractionMachine,
} from '@taucad/viewer/machines/model-interaction.machine';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';
import * as partThumbnailVisual from '#services/part-thumbnail-visual.js';
import { ChatExplorerTree } from '#routes/w.$workspace.$project/chat-explorer.js';

const mocks = vi.hoisted(() => ({
  addContextReferences: vi.fn(),
  paneApis: new Map<string, { setExpanded: ReturnType<typeof vi.fn> }>(),
  useProject: vi.fn(),
  imageService: undefined as undefined | { export: ReturnType<typeof vi.fn> },
  paneBodyVisible: true,
  openPartGallery: undefined as undefined | ReturnType<typeof vi.fn>,
}));

vi.mock('#hooks/use-project-availability.js', () => ({ useProjectAvailability: () => 'ready' }));

vi.mock('#components/geometry/cad/part-gallery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PartGalleryModule>()),
  useOpenPartGallery: () => mocks.openPartGallery,
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

vi.mock('@taucad/ui/components/keyboard', () => ({
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
    expect(properties).toMatchTextContent('helper_part');
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
});

describe('Model pane adapter capabilities', () => {
  function mockSinglePartProject(node: GeometryComponentNode): ActorRefFrom<typeof graphicsMachine> {
    const graphicsRef = createGraphicsRefForUnit('src/main.ts', [node]);
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([['mainView', graphicsRef]]),
    });
    return graphicsRef;
  }

  it('leads a renderable part row with an 80 px preview that opens the part gallery', async () => {
    mocks.openPartGallery = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:housing') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    mocks.imageService = {
      export: vi
        .fn()
        .mockResolvedValue([{ name: 'render-part-0.webp', mimeType: 'image/webp', bytes: new Uint8Array([1]) }]),
    };
    const node = {
      ...createNode(firstComponentId, 'planetary_housing'),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
    };
    const graphicsRef = createGraphicsRefForUnit('src/main.ts', [node], {
      selectedComponentIds: [firstComponentId],
      previewGeometry: { hash: 'presented-glb', content: new Uint8Array([1, 2, 3]) },
    });
    mockProjectForExplorer({
      mainEntryPath: 'src/main.ts',
      geometryUnitFiles: ['src/main.ts'],
      viewSettings: { mainView: { entryPath: 'src/main.ts' } },
      viewGraphics: new Map([['mainView', graphicsRef]]),
    });
    renderExplorerTree();

    const preview = await screen.findByRole('button', { name: 'Preview planetary_housing' });
    expect(preview.parentElement).toHaveClass('h-22');
    await userEvent.setup().click(preview);
    expect(mocks.openPartGallery).toHaveBeenCalledWith({
      graphicsRef,
      unitId: internalUnitId,
      componentId: firstComponentId,
      source: 'explorer',
      origin: preview,
    });
    mocks.openPartGallery = undefined;
  });

  it('should keep the shared model actions while removing reference drawing and export actions', async () => {
    const user = userEvent.setup();
    const graphicsRef = mockSinglePartProject(createNode(firstComponentId, 'planetary_housing'));
    renderExplorerTree();

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
      unitId: internalUnitId,
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
    const graphicsRef = mockSinglePartProject(createNode(firstComponentId, 'planetary_housing'));
    renderExplorerTree();

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
      unitId: internalUnitId,
      componentId: firstComponentId,
      opacity: 0.37,
      source: 'explorer',
    });

    await user.click(screen.getByText('Hide'));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'hideModelComponent',
      unitId: internalUnitId,
      componentId: firstComponentId,
      source: 'explorer',
    });
    expect(mocks.addContextReferences).not.toHaveBeenCalled();
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
