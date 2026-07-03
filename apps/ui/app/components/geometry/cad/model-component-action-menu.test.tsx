// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import {
  buildModelComponentGeometryReference,
  ModelComponentActionDropdown,
} from '#components/geometry/cad/model-component-action-menu.js';
import { ViewerModelComponentActionMenu } from '#components/geometry/cad/viewer-model-component-action-menu.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';

const mocks = vi.hoisted(() => ({
  addContextReferences: vi.fn(),
}));

vi.mock('#components/chat/chat-context-insertion.js', () => ({
  geometryReferenceToToken: () => '@cad[src/main.ts#component:first]',
  useChatContextInsertion: () => ({ addContextReferences: mocks.addContextReferences }),
}));

const componentId = 'component:first';
const unitId = 'file:src/main.ts';

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

beforeEach(() => {
  mocks.addContextReferences.mockReset();
});

function renderViewerModelComponentActionMenu({
  isFocused = false,
}: {
  readonly isFocused?: boolean;
} = {}): void {
  const node = createNode();
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
        opacity: 1,
      }}
      onOpenChange={vi.fn()}
    />,
  );
}

describe('model component action menu', () => {
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
        shouldShowActions
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
          opacity: 1,
        }}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Focus on part' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Add to chat' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Hide' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Isolate' })).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Hide' }));

    expect(graphicsRef.send).toHaveBeenCalledWith({
      type: 'hideModelComponent',
      unitId,
      componentId,
      source: 'viewer',
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
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
