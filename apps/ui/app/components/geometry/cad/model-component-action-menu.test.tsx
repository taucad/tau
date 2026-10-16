// @vitest-environment jsdom
import type * as PartGalleryModule from '#components/geometry/cad/part-gallery.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mock } from 'vitest-mock-extended';
import type { ActorRefFrom } from 'xstate';
import type { GeometryComponentManifest, GeometryComponentNode } from '@taucad/types';
import { ModelComponentActionDropdown } from '#components/geometry/cad/model-component-action-menu.js';
import { ViewerModelComponentActionMenu } from '#components/geometry/cad/viewer-model-component-action-menu.js';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';

const mocks = vi.hoisted(() => ({
  openPartGallery: undefined as undefined | ReturnType<typeof vi.fn>,
  addContextReferences: vi.fn(),
  editorSend: vi.fn(),
  openPanel: vi.fn(),
}));

vi.mock('#components/chat/chat-context-insertion.js', () => ({
  geometryReferenceToToken: () => '@cad[src/main.ts#component:first]',
  useChatContextInsertion: () => ({
    addContextReferences: mocks.addContextReferences,
  }),
}));

vi.mock('#components/geometry/cad/part-gallery.js', async (importOriginal) => ({
  ...(await importOriginal<typeof PartGalleryModule>()),
  useOpenPartGallery: () => mocks.openPartGallery,
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

describe('model component action menu (app adapter)', () => {
  it('heads the menu with the material swatch only and opens a part preview from the first item', async () => {
    mocks.openPartGallery = vi.fn();
    const node = {
      ...createNode(),
      primitiveRefs: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
      appearance: {
        materials: [{ materialIndex: 0, color: carrierBaseColor }],
      },
    };
    const graphicsRef = mock<ActorRefFrom<typeof graphicsMachine>>();
    render(
      <>
        <button type='button' data-model-part-button='' data-model-component-id={componentId}>
          Planetary housing row
        </button>
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
          preview={{ status: 'pending', bytes: new Uint8Array([1]) }}
        />
      </>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Actions for Planetary housing' }));
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('img')).toBeNull();
    expect(menu.querySelectorAll('[data-slot="material-swatch"]')).toHaveLength(1);
    expect(within(menu).queryByText('Preview loading')).toBeNull();
    const items = within(menu).getAllByRole('menuitem');
    expect(items[1]).toHaveAccessibleName('Open preview');
    await user.click(items[1]!);
    expect(mocks.openPartGallery).toHaveBeenCalledWith({
      graphicsRef,
      unitId,
      componentId,
      source: 'explorer',
      // Focus returns to the Explorer row, not the menu trigger.
      origin: screen.getByRole('button', { name: 'Planetary housing row' }),
    });
    mocks.openPartGallery = undefined;
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

  it('should reveal the joint that moves a part in the Kinematics pane only for parts in a mechanism link', async () => {
    const user = userEvent.setup();
    const node = createNode();
    const data = {
      node,
      graphicsRef: mock<ActorRefFrom<typeof graphicsMachine>>(),
      unitId,
      source: 'viewer',
      isFocused: false,
      isIsolated: false,
      hasHiddenComponents: false,
      hasOpacityOverrides: false,
      opacity: 1,
    } as const;
    const { rerender } = render(
      <ViewerModelComponentActionMenu
        isOpen
        point={{ clientX: 120, clientY: 160 }}
        data={{ ...data, manifest: createManifest(node) }}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('menuitem', { name: 'Show kinematics' })).toBeDisabled();

    const mechanism: GeometryComponentManifest['mechanism'] = {
      schemaVersion: 1,
      units: { length: 'm', angle: 'rad' },
      root: 'base',
      links: {
        base: { components: ['root'] },
        arm: { components: [componentId] },
      },
      joints: {
        hinge: {
          type: 'revolute',
          parent: 'base',
          child: 'arm',
          origin: [0, 0, 0],
          axis: [0, 0, 1],
        },
      },
    };
    rerender(
      <ViewerModelComponentActionMenu
        isOpen
        point={{ clientX: 120, clientY: 160 }}
        data={{
          ...data,
          manifest: { ...createManifest(node, 'src/main.ts'), mechanism },
        }}
        onOpenChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('menuitem', { name: 'Show kinematics' }));

    expect(mocks.openPanel).toHaveBeenCalledWith('kinematics');
    expect(mocks.editorSend).toHaveBeenCalledWith({
      type: 'revealModelComponentInKinematics',
      entryPath: 'src/main.ts',
      unitId,
      componentId,
    });
    expect(mocks.openPanel.mock.invocationCallOrder[0]!).toBeLessThan(mocks.editorSend.mock.invocationCallOrder[0]!);
  });
});
