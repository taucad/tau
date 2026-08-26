import { createContext, useContext, useMemo } from 'react';
import { useSelector, useActorRef } from '@xstate/react';
import type { ActorRefFrom, SnapshotFrom } from 'xstate';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { screenshotCapabilityMachine } from '#machines/screenshot-capability.machine.js';
import { cameraCapabilityMachine } from '#machines/camera-capability.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;
type ScreenshotCapabilityRef = ActorRefFrom<typeof screenshotCapabilityMachine>;
type CameraCapabilityRef = ActorRefFrom<typeof cameraCapabilityMachine>;
type ModelInteractionRef = ActorRefFrom<typeof modelInteractionMachine>;

type GraphicsContextValue = {
  graphicsRef: GraphicsActorRef;
  screenshotRef: ScreenshotCapabilityRef;
  cameraRef: CameraCapabilityRef;
};

const GraphicsContext = createContext<GraphicsContextValue | undefined>(undefined);

/**
 * Provider that makes a per-view graphics machine and its capabilities available to all descendants.
 * Spawns per-view screenshot and camera capability machines that register with the graphicsRef.
 * Placed in ChatViewer (and standalone viewers like hero-viewer, converter).
 */
export function GraphicsProvider({
  graphicsRef,
  children,
}: {
  readonly graphicsRef: GraphicsActorRef;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const screenshotRef = useActorRef(screenshotCapabilityMachine, {
    input: { graphicsRef },
  });
  const cameraRef = useActorRef(cameraCapabilityMachine, {
    input: { graphicsRef },
  });

  const value = useMemo(
    (): GraphicsContextValue => ({ graphicsRef, screenshotRef, cameraRef }),
    [graphicsRef, screenshotRef, cameraRef],
  );

  return <GraphicsContext.Provider value={value}>{children}</GraphicsContext.Provider>;
}

/**
 * Returns the per-view graphics actor ref from the nearest GraphicsProvider.
 * Use for `.send()` calls to dispatch events to the graphics machine.
 */
export function useGraphics(): GraphicsActorRef {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useGraphics must be used within a GraphicsProvider');
  }

  return context.graphicsRef;
}

/**
 * Returns the per-view screenshot capability actor ref from the nearest GraphicsProvider.
 * Use for registering Three.js capture context and taking screenshots.
 */
export function useScreenshotCapability(): ScreenshotCapabilityRef {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useScreenshotCapability must be used within a GraphicsProvider');
  }

  return context.screenshotRef;
}

/**
 * Returns the per-view camera capability actor ref from the nearest GraphicsProvider.
 * Use for registering camera reset functions and triggering resets.
 */
export function useCameraCapability(): CameraCapabilityRef {
  const context = useContext(GraphicsContext);
  if (!context) {
    throw new Error('useCameraCapability must be used within a GraphicsProvider');
  }

  return context.cameraRef;
}

/**
 * Curried selector hook for reading state from the nearest per-view graphics machine.
 * Delegates to XState's useSelector for subscription management and re-render optimization.
 *
 * @example
 * const fovAngle = useGraphicsSelector(state => state.context.cameraFovAngle);
 */
export function useGraphicsSelector<T>(selector: (state: SnapshotFrom<typeof graphicsMachine>) => T): T {
  const graphicsRef = useGraphics();
  return useSelector(graphicsRef, selector);
}

export function useModelInteractionRef(): ModelInteractionRef {
  const graphicsRef = useGraphics();
  const modelInteractionRef = useSelector(
    graphicsRef,
    (state) => state.children['modelInteraction'] as ModelInteractionRef | undefined,
  );

  if (!modelInteractionRef) {
    throw new Error('modelInteraction actor is not available on the graphics machine');
  }

  return modelInteractionRef;
}

export function useModelInteractionSelector<T>(
  selector: (state: SnapshotFrom<typeof modelInteractionMachine>) => T,
): T {
  const modelInteractionRef = useModelInteractionRef();
  return useSelector(modelInteractionRef, selector);
}
