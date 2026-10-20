import { act, fireEvent } from '@testing-library/react';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { createManifest, createNode } from '#model/model.test-utils.jsx';

/** The unit the fixture graphics actor draws. */
export const viewerUnitId = 'file:src/gear.py';

/** The fixture's parts. */
export const gearComponentId = 'component:gear';
export const baseComponentId = 'component:base';

/** A started fixture graphics actor. */
export type ViewerGraphics = Actor<typeof graphicsMachine>;

/**
 * A real graphics actor with a two-part manifest loaded as its unit; WebGPU probing answers no, as in jsdom.
 *
 * @returns The started actor; stop it after the test.
 */
export function createViewerGraphics(): ViewerGraphics {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  ).start();
  actor.send({
    type: 'loadModelComponentManifest',
    unitId: viewerUnitId,
    manifest: createManifest(
      [createNode(gearComponentId, 'Herringbone gear'), createNode(baseComponentId, 'Base')],
      'src/gear.py',
    ),
    source: 'viewer',
  });
  return actor;
}

/**
 * Hands the actor a model, as a host does when its model arrives.
 *
 * @param actor - The fixture actor.
 * @param key - The model's hash; a new key is a new model.
 */
export function showViewerModel(actor: ViewerGraphics, key: string): void {
  act(() => {
    actor.send({
      type: 'updateArtifact',
      artifact: { mimeType: 'model/gltf-binary', content: new Uint8Array([1, 2, 3]) },
      hash: key,
    });
  });
}

/**
 * Selects a part, as a click on the canvas does.
 *
 * @param actor - The fixture actor.
 * @param componentId - The part.
 */
export function selectViewerComponent(actor: ViewerGraphics, componentId: string): void {
  act(() => {
    actor
      .getSnapshot()
      .context.modelInteractionRef.send({ type: 'selectComponent', unitId: viewerUnitId, componentId });
  });
}

/**
 * Hovers a part, as the pointer over the canvas does.
 *
 * @param actor - The fixture actor.
 * @param componentId - The part, or `undefined` once the pointer leaves every part.
 */
export function hoverViewerComponent(actor: ViewerGraphics, componentId: string | undefined): void {
  act(() => {
    actor
      .getSnapshot()
      .context.modelInteractionRef.send({ type: 'setHoveredComponent', unitId: viewerUnitId, componentId });
  });
}

/**
 * Fires a pointer event jsdom can carry: a `MouseEvent` with the pointer's id, since jsdom has no `PointerEvent`.
 *
 * @param element - The target.
 * @param type - The pointer event.
 * @param options - The button, pointer id and position.
 */
export function firePointer(
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  options: {
    readonly button?: number;
    readonly pointerId?: number;
    readonly clientX: number;
    readonly clientY: number;
  },
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: options.button ?? 0,
    clientX: options.clientX,
    clientY: options.clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: options.pointerId ?? 1 });
  fireEvent(element, event);
}
