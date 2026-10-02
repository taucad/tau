import { useActorRef } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { OrbitControls } from 'three/addons';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { controlsListenerMachine } from '#machines/controls-listener.machine.js';

type ControlsListenerBridgeProps = {
  readonly controls: OrbitControls;
  readonly graphicsActor: ActorRefFrom<typeof graphicsMachine>;
};

/**
 * Owns {@link controlsListenerMachine} lifecycle when OrbitControls is installed on the Canvas store.
 * Deferrals until Drei assigns `controls` avoids `controls === null` on the commit after backend remounts.
 */
export function ControlsListenerBridge({ controls, graphicsActor }: ControlsListenerBridgeProps): undefined {
  useActorRef(controlsListenerMachine, {
    input: { graphicsActorRef: graphicsActor, controls },
  });

  return undefined;
}
