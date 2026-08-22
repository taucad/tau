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
  shouldShowComponentRowActions,
} from '#routes/w.$workspace.$project/chat-explorer.js';

const mocks = vi.hoisted(() => ({
  addContextReferences: vi.fn(),
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
  mocks.useProject.mockReset();
});

describe('ChatExplorerTree', () => {
  it('should render the empty project state through EmptyItems', () => {
    mocks.useProject.mockReturnValue(null);

    renderExplorerTree();

    expect(screen.getByText('No model components available').closest('[data-slot="empty-items"]')).toBeTruthy();
  });

  it('should render compilation unit sections and keep search hidden until requested', async () => {
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

    expect(screen.getByText('src/main.ts')).toBeInTheDocument();
    expect(screen.getByText('src/helper.ts')).toBeInTheDocument();
    const sectionTitles = screen.getAllByTestId('explorer-section-title');
    expect(sectionTitles[0]).toHaveTextContent('src/main.ts');
    expect(sectionTitles[0]).toHaveAttribute('dir', 'rtl');
    expect(sectionTitles[0]).toHaveClass('text-[13px]');
    expect(sectionTitles[0]).not.toHaveClass('uppercase');
    expect(screen.getByText('main_part')).toBeInTheDocument();
    expect(screen.getByText('helper_part')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search parts...')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show search' }));
    const searchInput = screen.getByPlaceholderText('Search parts...');
    await user.type(searchInput, 'helper');

    expect(screen.queryByText('main_part')).not.toBeInTheDocument();
    expect(screen.getByText('helper_part')).toBeInTheDocument();
    expect(screen.getByText('No matching parts').closest('[data-slot="empty-items"]')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Hide search' }));

    expect(screen.queryByPlaceholderText('Search parts...')).not.toBeInTheDocument();
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

      await user.click(screen.getByRole('button', { name: 'src/helper.ts' }));
      expect(screen.queryByText('helper_part')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Show search' }));
      await user.type(screen.getByPlaceholderText('Search parts...'), 'main');

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
      expect(screen.queryByPlaceholderText('Search parts...')).not.toBeInTheDocument();
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
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: 'src/unopened.ts' }));
    expect(screen.queryByText('Open renderer to inspect components')).not.toBeInTheDocument();

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
    expect(screen.getByText('Open renderer to inspect components').closest('[data-slot="empty-items"]')).toBeTruthy();
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

  it('should show row actions while hovered or isolated', () => {
    expect(shouldShowComponentRowActions({ isHovered: true, isIsolated: false })).toBe(true);
    expect(shouldShowComponentRowActions({ isHovered: false, isIsolated: true })).toBe(true);
    expect(shouldShowComponentRowActions({ isHovered: false, isIsolated: false })).toBe(false);
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

    expect(screen.getByRole('button', { name: 'Remove isolation for planetary_housing' })).toHaveAttribute(
      'tabindex',
      '0',
    );
    expect(screen.getByRole('button', { name: 'Isolate sun_gear_assembly' })).toHaveAttribute('tabindex', '0');
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
