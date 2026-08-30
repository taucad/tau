// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentAppearance, GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import type { ActorRefFrom } from 'xstate';
import { createActor } from 'xstate';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { createSourceModelInteractionUnitId, modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { TooltipProvider } from '#components/ui/tooltip.js';
import {
  ChatExplorerTree,
  ComponentRow,
  getComponentRowPaddingLeft,
} from '#routes/w.$workspace.$project/chat-explorer.js';

const mocks = vi.hoisted(() => ({
  addContextReferences: vi.fn(),
  paneApis: new Map<string, { setExpanded: ReturnType<typeof vi.fn> }>(),
  useProject: vi.fn(),
}));
const unitId = 'src/main.ts';
const internalUnitId = createSourceModelInteractionUnitId(unitId);

vi.mock('#components/chat/chat-context-insertion.js', () => ({
  geometryReferenceToToken: () => '@cad[src/main.ts#component]',
  useChatContextInsertion: () => ({ addContextReferences: mocks.addContextReferences }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: mocks.useProject,
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
              <Body params={panel.params} />
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
  }: {
    readonly hiddenComponentIds?: readonly string[];
    readonly selectedComponentIds?: readonly string[];
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

  return createStaticActor({
    children: {
      modelInteraction: modelRef,
    },
  }) as unknown as ActorRefFrom<typeof graphicsMachine>;
}

function mockProjectForExplorer({
  mainEntryPath,
  viewSettings,
  viewGraphics,
  geometryUnitFiles,
  editorRef = createStaticActor({ context: { viewSettings } }),
}: {
  readonly mainEntryPath: string;
  readonly viewSettings: Record<string, { readonly entryPath: string }>;
  readonly viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  readonly geometryUnitFiles: readonly string[];
  readonly editorRef?: EditorTestActor;
}): void {
  mocks.useProject.mockReturnValue({
    mainEntryPath,
    editorRef,
    viewGraphics,
    geometryUnits: new Map(geometryUnitFiles.map((entryPath) => [entryPath, createStaticActor({})])),
  });
}

function renderExplorerTree({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
} = {}): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <ChatExplorerTree isExpanded={isExpanded} setIsExpanded={setIsExpanded} />
    </TooltipProvider>,
  );
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
});

describe('ChatExplorerTree', () => {
  it('should render the empty project state through CollectionEmptyState', () => {
    mocks.useProject.mockReturnValue(null);

    renderExplorerTree();

    expect(screen.getByRole('textbox', { name: 'Filter parts' })).toHaveAttribute('placeholder', 'Filter parts...');
    expect(
      screen.getByText('No model components available').closest('[data-slot="collection-empty-state"]'),
    ).toBeTruthy();
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
    expect(screen.getByTestId('model-pane-src/main.ts')).toHaveAttribute('data-minimum-body-size', '80');
    expect(screen.getByText('main_part')).toBeInTheDocument();
    expect(screen.getByText('helper_part')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show search' })).not.toBeInTheDocument();

    const filterInput = screen.getByRole('textbox', { name: 'Filter parts' });
    await user.type(filterInput, 'helper');

    expect(screen.queryByText('main_part')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'helper_part' })).toBeInTheDocument();
    expect(screen.getByText('helper')).toHaveAttribute('data-slot', 'highlight');
    expect(screen.getByText('No matching parts').closest('[data-slot="collection-empty-state"]')).toBeTruthy();

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

      await user.type(screen.getByRole('textbox', { name: 'Filter parts' }), 'main');

      act(() => {
        editorRef.emit('modelComponentRevealRequested', {
          type: 'modelComponentRevealRequested',
          entryPath: 'src/helper.ts',
          unitId: helperUnitId,
          componentId: secondComponentId,
        });
      });

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
      });
      expect(setIsExpanded).toHaveBeenCalledWith(true);
      expect(screen.getByRole('textbox', { name: 'Filter parts' })).toHaveValue('');
      expect(mocks.paneApis.get('src/helper.ts')?.setExpanded).toHaveBeenCalledWith(true);
      const rowButton = screen.getByRole('button', { name: 'helper_part' });
      const row = rowButton.parentElement;
      expect(rowButton).toHaveAttribute('aria-pressed', 'true');
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
      screen.getByText('Open renderer to inspect components').closest('[data-slot="collection-empty-state"]'),
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
    expect(selectedRow).toHaveClass('text-primary');
    expect(focusedRow).not.toHaveClass('bg-primary/10');
    expect(focusedRow).toHaveClass('bg-sidebar-accent/70');
    expect(isolatedRow).not.toHaveClass('bg-primary/10');
    expect(screen.getByRole('button', { name: 'Remove isolation for ring_gear' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('should keep Add to chat in the dropdown while removing reference drawing show-all and export actions', async () => {
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
    expect(screen.queryByText('Copy @reference')).not.toBeInTheDocument();
    expect(screen.queryByText('View drawings')).not.toBeInTheDocument();
    expect(screen.queryByText('Show all')).not.toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' }).tabIndex).toBe(0);
    expect(screen.getByRole('button', { name: 'Isolate sun_gear_assembly' }).tabIndex).toBe(0);
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
