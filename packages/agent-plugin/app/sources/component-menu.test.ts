import { describe, expect, it, vi } from 'vitest';
import type { GeometryComponentManifest, GeometryComponentNode, GeometryComponentReference } from '@taucad/types';
import type { ModelComponentActionTarget } from '@taucad/workbench-panes/component-menu/component-actions';
import type { GraphicsRef } from '@taucad/workbench-panes/host/workbench-host';
import { createComponentReveal, createPageComponentActions } from '#app/sources/component-menu.jsx';

const capabilities: GeometryComponentNode['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [],
};
const node: GeometryComponentNode = {
  id: 'component:arm',
  name: 'Arm',
  kind: 'part',
  selector: 'node/0',
  parentId: 'root',
  childIds: [],
  depth: 1,
  path: ['Model', 'Arm'],
  meshNodeIndices: [0],
  primitiveIndices: [0],
  materialIndices: [0],
  capabilities,
};
const unitId = 'file:bracket.ts';

/** A graphics actor stand-in: the page verbs only send to it. */
const graphicsRefSending = (send: ReturnType<typeof vi.fn>): GraphicsRef => {
  const ref = { send };
  return ref as unknown as GraphicsRef;
};

const targetOf = (
  sourceFile: string | undefined,
): ModelComponentActionTarget & { readonly send: ReturnType<typeof vi.fn> } => {
  const send = vi.fn();
  const manifest: GeometryComponentManifest = {
    schemaVersion: 1,
    sourceFile,
    rootId: 'root',
    nodeOrder: [node.id],
    capabilities,
    nodesById: { [node.id]: node },
  };
  return { manifest, node, graphicsRef: graphicsRefSending(send), unitId, source: 'viewer', isIsolated: false, send };
};

describe('page component menu', () => {
  it('selects the part, opens the Model pane and reveals it there', () => {
    const reveal = createComponentReveal();
    const openPane = vi.fn();
    const listener = vi.fn();
    reveal.model.subscribe(listener);
    const actions = createPageComponentActions({
      addToChat: vi.fn(),
      openPane,
      reveal,
    });
    const target = targetOf('bracket.ts');

    actions.revealInExplorer?.(target);

    expect(target.send).toHaveBeenCalledWith({
      type: 'selectModelComponent',
      unitId,
      componentId: node.id,
      source: 'viewer',
    });
    expect(openPane).toHaveBeenCalledWith('model');
    expect(listener).toHaveBeenCalledWith({
      entryPath: 'bracket.ts',
      unitId,
      componentId: node.id,
    });
  });

  it('holds a Kinematics reveal until the pane it opened subscribes', () => {
    const reveal = createComponentReveal();
    const openPane = vi.fn();
    const actions = createPageComponentActions({
      addToChat: vi.fn(),
      openPane,
      reveal,
    });

    actions.showKinematics?.(targetOf('bracket.ts'), 'component:link');
    expect(openPane).toHaveBeenCalledWith('kinematics');

    const listener = vi.fn();
    reveal.subscribeKinematics(listener);
    expect(listener).toHaveBeenCalledWith({
      entryPath: 'bracket.ts',
      componentId: 'component:link',
    });
    const later = vi.fn();
    reveal.subscribeKinematics(later);
    expect(later).not.toHaveBeenCalled();
  });

  it('hands the reference to the page and offers no part preview', () => {
    const addToChat = vi.fn();
    const actions = createPageComponentActions({
      addToChat,
      openPane: vi.fn(),
      reveal: createComponentReveal(),
    });
    const reference: GeometryComponentReference = {
      scheme: 'tau-cad',
      filePath: 'bracket.ts',
      componentId: node.id,
      selector: node.selector,
      label: 'Arm',
      kind: 'part',
    };

    actions.addToChat?.(reference, targetOf('bracket.ts'));

    expect(addToChat).toHaveBeenCalledWith(reference);
    expect(actions.openPreview).toBeUndefined();
  });

  it('does nothing for a part whose model names no file', () => {
    const openPane = vi.fn();
    const actions = createPageComponentActions({
      addToChat: vi.fn(),
      openPane,
      reveal: createComponentReveal(),
    });
    const target = targetOf(undefined);

    actions.revealInExplorer?.(target);
    actions.showKinematics?.(target, node.id);

    expect(openPane).not.toHaveBeenCalled();
    expect(target.send).not.toHaveBeenCalled();
  });
});
