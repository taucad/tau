// @vitest-environment jsdom
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentManifest } from '@taucad/types';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { useViewSettingsSync } from '#hooks/use-view-settings-sync.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import { deriveModelInteractionUnitId } from '#machines/model-interaction.machine.js';

const componentId = 'component:Housing';
const unitId = deriveModelInteractionUnitId({ sourceFile: 'src/main.ts' });
type EditorSendEvent = Parameters<ActorRefFrom<typeof editorMachine>['send']>[0];
const capabilities: GeometryComponentManifest['capabilities'] = {
  canHide: true,
  canIsolate: true,
  canFocus: true,
  canAdjustOpacity: true,
  hasDrawings: false,
  hasPreciseTopology: false,
  exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
};

function createManifest(): GeometryComponentManifest {
  return {
    schemaVersion: 1,
    sourceFile: 'src/main.ts',
    rootId: 'root',
    nodeOrder: ['root', componentId],
    capabilities,
    nodesById: {
      root: {
        id: 'root',
        name: 'Model',
        kind: 'model',
        selector: 'root',
        childIds: [componentId],
        depth: 0,
        path: ['Model'],
        meshNodeIndices: [],
        primitiveIndices: [],
        materialIndices: [],
        capabilities,
      },
      [componentId]: {
        id: componentId,
        name: 'Housing',
        kind: 'part',
        selector: 'node/0',
        parentId: 'root',
        childIds: [],
        depth: 1,
        path: ['Model', 'Housing'],
        meshNodeIndices: [0],
        primitiveIndices: [0],
        materialIndices: [0],
        capabilities,
      },
    },
  };
}

function SyncHarness({
  graphicsRef,
  editorRef,
}: {
  readonly graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  readonly editorRef: ActorRefFrom<typeof editorMachine>;
}): React.JSX.Element {
  useViewSettingsSync({
    viewId: 'view-1',
    graphicsRef,
    cadRef: undefined,
    editorRef,
  });
  return <div data-testid='sync-harness' />;
}

describe('useViewSettingsSync', () => {
  it('should persist display mutations and ignore hover-only model interaction changes', async () => {
    const providedMachine = graphicsMachine.provide({
      actors: {
        probeWebGpu: fromPromise(async () => false),
      },
    });
    const graphicsRef = createActor(providedMachine, { input: {} });
    graphicsRef.start();
    const editorSend = vi.fn<(event: EditorSendEvent) => void>();
    const editorRef = mock<ActorRefFrom<typeof editorMachine>>({
      send: editorSend,
    });

    render(
      <GraphicsProvider graphicsRef={graphicsRef}>
        <SyncHarness graphicsRef={graphicsRef} editorRef={editorRef} />
      </GraphicsProvider>,
    );

    act(() => {
      graphicsRef.send({ type: 'loadModelComponentManifest', unitId, manifest: createManifest(), source: 'viewer' });
      graphicsRef.send({ type: 'setHoveredModelComponent', unitId, componentId, source: 'viewer' });
      graphicsRef.send({ type: 'controlsInteractionStart' });
      graphicsRef.send({ type: 'controlsInteractionMoved' });
      graphicsRef.send({ type: 'controlsInteractionEnd', zoom: 1 });
      graphicsRef.send({ type: 'clearModelPointerClickGuard' });
    });
    expect(editorSend).not.toHaveBeenCalled();

    act(() => {
      graphicsRef.send({ type: 'hideModelComponent', unitId, componentId, source: 'explorer' });
    });

    await waitFor(() => {
      expect(editorSend).toHaveBeenCalled();
    });

    const updateEvent = editorSend.mock.calls.at(-1)?.[0];
    expect(updateEvent).toMatchObject({
      type: 'updateViewSettings',
      viewId: 'view-1',
      settings: {
        schemaVersion: 5,
        componentDisplay: {
          schemaVersion: 1,
          unitsById: {
            [unitId]: {
              hiddenComponentIds: [componentId],
            },
          },
        },
      },
    });
    graphicsRef.stop();
  });
});
