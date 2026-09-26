// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentAppearance, GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import {
  buildModelComponentGeometryReference,
  ModelComponentActionDropdown,
} from '#components/geometry/cad/model-component-action-menu.js';
import { ViewerModelComponentActionMenu } from '#components/geometry/cad/viewer-model-component-action-menu.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';

const mocks = vi.hoisted(() => ({
  addContextReferences: vi.fn(),
  editorSend: vi.fn(),
  openPanel: vi.fn(),
}));

vi.mock('#components/chat/chat-context-insertion.js', () => ({
  geometryReferenceToToken: () => '@cad[src/main.ts#component:first]',
  useChatContextInsertion: () => ({ addContextReferences: mocks.addContextReferences }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: { send: mocks.editorSend } }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel: mocks.openPanel }),
}));

const componentId = 'component:first';
const unitId = 'file:src/main.ts';
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- Fixture data verifies the user's authored material value as text, not UI styling.
const carrierBaseColor = '#285e88';
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- The glTF default is source-data evidence, not a UI palette choice.
const defaultBaseColor = '#ffffff';

const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
};

function createNode(): GeometryComponentNode {
  return {
    id: componentId,
    name: 'Planetary housing',
    kind: 'part',
    selector: 'node/0',
    parentId: 'root',
    childIds: [],
    depth: 1,
    path: ['Model', 'Planetary housing'],
    meshNodeIndices: [0],
    primitiveIndices: [0],
    materialIndices: [0],
    capabilities,
  };
}

function createManifest(node = createNode(), sourceFile?: string): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile,
    rootId: 'root',
    nodeOrder: ['root', node.id],
    capabilities,
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [node.id],
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      [node.id]: node,
    },
  };
}

const fireSliderPointerEvent = (
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
): void => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  fireEvent(element, event);
};

beforeEach(() => {
  mocks.addContextReferences.mockReset();
  mocks.editorSend.mockReset();
  mocks.openPanel.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderViewerModelComponentActionMenu({
  isFocused = false,
  appearance,
}: {
  readonly isFocused?: boolean;
  readonly appearance?: GeometryComponentAppearance;
} = {}): ActorRefFrom<typeof graphicsMachine> {
  const node = createNode();
  node.appearance = appearance;
  const manifest = createManifest(node, 'src/main.ts');
  const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

  render(
    <ViewerModelComponentActionMenu
      isOpen
      point={{ clientX: 120, clientY: 160 }}
      data={{
        manifest,
        node,
        graphicsRef,
        unitId,
        source: 'viewer',
        isFocused,
        isIsolated: false,
        hasHiddenComponents: false,
        hasOpacityOverrides: false,
        opacity: 1,
      }}
      onOpenChange={vi.fn()}
    />,
  );
  return graphicsRef;
}

describe('model component action menu', () => {
  it.each(['explorer', 'viewer'] as const)(
    'should expose source material factors as read-only text in the %s menu',
    async (source) => {
      const user = userEvent.setup();
      const appearance: GeometryComponentAppearance = {
        materials: [{ materialIndex: 0, color: carrierBaseColor, metalness: 0.65, roughness: 0.32 }],
      };
      let graphicsRef: ActorRefFrom<typeof graphicsMachine>;
      if (source === 'viewer') {
        graphicsRef = renderViewerModelComponentActionMenu({ appearance });
      } else {
        const node = { ...createNode(), appearance };
        graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();
        render(
          <ModelComponentActionDropdown
            manifest={createManifest(node)}
            node={node}
            graphicsRef={graphicsRef}
            unitId={unitId}
            source='explorer'
            isFocused={false}
            isIsolated={false}
            hasHiddenComponents={false}
            hasOpacityOverrides={false}
            opacity={1}
            actionButtonClassName=''
          />,
        );
        await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));
      }

      // The menu opens on its part: a collapsed row with the name and a swatch; the factors wait inside.
      const partRow = screen.getByRole('menuitem', { name: 'Planetary housing' });
      expect(screen.getByRole('menu')).toHaveTextContent(/^Planetary housing/);
      expect(partRow).toHaveAttribute('aria-expanded', 'false');
      expect(partRow.querySelector('[data-slot="material-swatch"]')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Material for Planetary housing' })).not.toBeInTheDocument();
      await user.click(partRow);
      expect(partRow).toHaveAttribute('aria-expanded', 'true');
      const summary = within(screen.getByRole('group', { name: 'Material for Planetary housing' }));
      expect(summary.getByText(carrierBaseColor)).toBeVisible();
      expect(summary.getByText('0.65')).toBeVisible();
      expect(summary.getByText('0.32')).toBeVisible();
      expect(summary.queryByRole('slider')).not.toBeInTheDocument();
      expect(summary.queryByRole('spinbutton')).not.toBeInTheDocument();
      expect(summary.queryByRole('textbox')).not.toBeInTheDocument();
      await user.click(summary.getByText('0.65'));
      expect(screen.getByRole('menuitem', { name: 'Focus on part' })).toBeVisible();
      expect(graphicsRef.send).not.toHaveBeenCalled();
    },
  );

  it('should show mixed values without hiding equal values or their format-default provenance', async () => {
    renderViewerModelComponentActionMenu({
      appearance: {
        materials: [
          { materialIndex: 0, metalness: 0.2, roughness: 1 },
          { materialIndex: 1, color: defaultBaseColor, metalness: 0.8 },
        ],
      },
    });

    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Planetary housing' }));
    const summary = within(screen.getByRole('group', { name: 'Material for Planetary housing' }));
    expect(summary.getByText('Mixed: 0.2, 0.8')).toBeVisible();
    expect(summary.getByText('1 (includes glTF default)')).toBeVisible();
    expect(summary.getByText('#ffffff (includes glTF default)')).toBeVisible();
  });

  it('should distinguish glTF defaults, unavailable factors and unlit shading', async () => {
    renderViewerModelComponentActionMenu({
      appearance: {
        materials: [
          {},
          { materialIndex: 0, color: 'unavailable', metalness: 'unavailable', roughness: 'unavailable' },
          { materialIndex: 1, isUnlit: true },
        ],
      },
    });

    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Planetary housing' }));
    const summary = within(screen.getByRole('group', { name: 'Material for Planetary housing' }));
    expect(summary.getByText('Mixed: #ffffff (glTF default), Unavailable')).toBeVisible();
    expect(summary.getAllByText('Mixed: 1 (glTF default), Unavailable, Not used (unlit)')).toHaveLength(2);
  });

  it('should build a geometry reference from manifest metadata when the node has no explicit reference', () => {
    const node = createNode();
    const manifest = createManifest(node, 'src/main.ts');

    expect(buildModelComponentGeometryReference(manifest, node)).toEqual({
      scheme: 'tau-cad',
      filePath: 'src/main.ts',
      componentId,
      selector: 'node/0',
      geometryHash: undefined,
      label: 'Planetary housing',
      kind: 'part',
    });
    expect(buildModelComponentGeometryReference(createManifest(node), node)).toBeUndefined();
  });

  it('should dispatch actions with the supplied source and add geometry references to chat', async () => {
    const user = userEvent.setup();
    const node = createNode();
    const manifest = createManifest(node, 'src/main.ts');
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    render(
      <ModelComponentActionDropdown
        manifest={manifest}
        node={node}
        graphicsRef={graphicsRef}
        unitId={unitId}
        source='viewer'
        isFocused={false}
        isIsolated={false}
        hasHiddenComponents={false}
        hasOpacityOverrides={false}
        actionButtonClassName='size-5'
        opacity={1}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));
    await user.click(screen.getByText('Add to chat'));

    expect(mocks.addContextReferences).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'src/main.ts#component:first',
        chipType: 'geometry',
        referenceToken: '@cad[src/main.ts#component:first]',
      }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));
    await user.click(screen.getByText('Hide'));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'hideModelComponent',
      unitId,
      componentId,
      source: 'viewer',
    });
  });

  it('should render the same action surface for coordinate-anchored viewer menus', async () => {
    const user = userEvent.setup();
    const node = createNode();
    const manifest = createManifest(node, 'src/main.ts');
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();
    const onOpenChange = vi.fn();

    render(
      <ViewerModelComponentActionMenu
        isOpen
        point={{ clientX: 120, clientY: 160 }}
        data={{
          manifest,
          node,
          graphicsRef,
          unitId,
          source: 'viewer',
          isFocused: false,
          isIsolated: false,
          hasHiddenComponents: false,
          hasOpacityOverrides: false,
          opacity: 1,
        }}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Focus on part' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to chat' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reveal in Explorer' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Hide' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Isolate' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show all' })).toBeDisabled();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Reset opacity' })).toBeDisabled();

    await user.click(screen.getByRole('menuitem', { name: 'Hide' }));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'hideModelComponent',
      unitId,
      componentId,
      source: 'viewer',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should type and scrub opacity through the viewer source without closing the menu', async () => {
    const user = userEvent.setup();
    const node = createNode();
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();
    const onOpenChange = vi.fn();

    render(
      <ViewerModelComponentActionMenu
        isOpen
        point={{ clientX: 120, clientY: 160 }}
        data={{
          manifest: createManifest(node, 'src/main.ts'),
          node,
          graphicsRef,
          unitId,
          source: 'viewer',
          isFocused: false,
          isIsolated: false,
          hasHiddenComponents: false,
          hasOpacityOverrides: false,
          opacity: 1,
        }}
        onOpenChange={onOpenChange}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Opacity' });
    expect(input).toHaveValue('100');
    expect(screen.getByText('%')).toBeInTheDocument();
    await user.click(input);
    await user.clear(input);
    await user.type(input, '42');
    await user.keyboard('{Enter}');
    expect(graphicsRef.send).toHaveBeenLastCalledWith({
      type: 'setModelComponentOpacity',
      unitId,
      componentId,
      opacity: 0.42,
      source: 'viewer',
    });
    expect(onOpenChange).not.toHaveBeenCalled();

    const sliderItem = input.closest<HTMLElement>('[data-slot="viewer-model-component-action-slider-item"]')!;
    Object.defineProperty(sliderItem, 'offsetWidth', { configurable: true, value: 100 });
    fireSliderPointerEvent(sliderItem, 'pointerdown', 100);
    fireSliderPointerEvent(sliderItem, 'pointermove', 80);
    fireSliderPointerEvent(sliderItem, 'pointerup', 80);
    expect(graphicsRef.send).toHaveBeenLastCalledWith({
      type: 'setModelComponentOpacity',
      unitId,
      componentId,
      opacity: 0.8,
      source: 'viewer',
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('should reveal viewer components in Explorer without adding the action to Explorer menus', async () => {
    const user = userEvent.setup();
    const node = createNode();
    const manifest = createManifest(node, 'src/main.ts');
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    const { unmount } = render(
      <ViewerModelComponentActionMenu
        isOpen
        point={{ clientX: 120, clientY: 160 }}
        data={{
          manifest,
          node,
          graphicsRef,
          unitId,
          source: 'viewer',
          isFocused: false,
          isIsolated: false,
          hasHiddenComponents: false,
          hasOpacityOverrides: false,
          opacity: 1,
        }}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('menuitem', { name: 'Reveal in Explorer' }));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'selectModelComponent',
      unitId,
      componentId,
      source: 'viewer',
    });
    expect(mocks.openPanel).toHaveBeenCalledWith('model');
    expect(mocks.editorSend).toHaveBeenCalledWith({
      type: 'revealModelComponentInExplorer',
      entryPath: 'src/main.ts',
      unitId,
      componentId,
    });
    expect(mocks.openPanel.mock.invocationCallOrder[0]!).toBeLessThan(mocks.editorSend.mock.invocationCallOrder[0]!);
    unmount();

    render(
      <ModelComponentActionDropdown
        manifest={manifest}
        node={node}
        graphicsRef={graphicsRef}
        unitId={unitId}
        source='explorer'
        isFocused={false}
        isIsolated={false}
        hasHiddenComponents={false}
        hasOpacityOverrides={false}
        actionButtonClassName='size-5'
        opacity={1}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));

    expect(screen.queryByText('Reveal in Explorer')).not.toBeInTheDocument();
  });

  it('should enable and dispatch unit-wide visibility and opacity recovery actions', async () => {
    const user = userEvent.setup();
    const node = createNode();
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();

    render(
      <ModelComponentActionDropdown
        manifest={createManifest(node, 'src/main.ts')}
        node={node}
        graphicsRef={graphicsRef}
        unitId={unitId}
        source='explorer'
        isFocused={false}
        isIsolated={false}
        hasHiddenComponents
        hasOpacityOverrides
        actionButtonClassName='size-5'
        opacity={0.5}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));
    const isolate = screen.getByRole('menuitem', { name: 'Isolate' });
    const showAll = screen.getByRole('menuitem', { name: 'Show all' });
    expect(showAll).toBeEnabled();
    expect(isolate.nextElementSibling).toBe(showAll);
    await user.click(showAll);
    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'showHiddenModelComponents',
      unitId,
      source: 'explorer',
    });

    await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));
    const resetOpacity = screen.getByRole('menuitem', { name: 'Reset opacity' });
    expect(resetOpacity).toBeEnabled();
    await user.click(resetOpacity);
    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'resetModelComponentOpacities',
      unitId,
      source: 'explorer',
    });
  });

  it('should move coordinate-anchored viewer menu focus to enabled items on pointer hover', async () => {
    const user = userEvent.setup();
    renderViewerModelComponentActionMenu();

    const focusItem = screen.getByRole('menuitem', { name: 'Focus on part' });
    const addToChatItem = screen.getByRole('menuitem', { name: 'Add to chat' });
    focusItem.focus();

    expect(document.activeElement).toBe(focusItem);

    await user.hover(addToChatItem);

    expect(document.activeElement).toBe(addToChatItem);
  });

  it('should not move coordinate-anchored viewer menu focus to disabled items on pointer movement', () => {
    renderViewerModelComponentActionMenu({ isFocused: true });

    const disabledFocusItem = screen.getByRole('menuitem', { name: 'Focus on part' });
    const addToChatItem = screen.getByRole('menuitem', { name: 'Add to chat' });
    addToChatItem.focus();

    expect(disabledFocusItem).toBeDisabled();

    fireEvent.pointerEnter(disabledFocusItem);
    fireEvent.pointerMove(disabledFocusItem);

    expect(document.activeElement).toBe(addToChatItem);
  });
});
