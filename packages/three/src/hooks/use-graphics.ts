/**
 * Default graphics context for standalone package usage.
 * Apps can provide their own implementation via module resolution or context.
 */
const defaultGraphicsState = {
  context: {
    cameraFovAngle: 50,
  },
};

/**
 * Select a value from the graphics context state.
 * In standalone mode returns from default state; apps override via GraphicsProvider.
 */
export function useGraphicsSelector<T>(selector: (state: { context: { cameraFovAngle: number } }) => T): T {
  return selector(defaultGraphicsState);
}

/** No-op actor for standalone package usage. Apps provide their own via GraphicsProvider. */
const noopCameraCapability = {
  send(_event: { type: string; reset?: () => void }) {
    // No-op
  },
};

/**
 * Get the camera capability actor for registering reset handlers.
 * In standalone mode returns a no-op; apps provide their own via GraphicsProvider.
 */
export function useCameraCapability(): typeof noopCameraCapability {
  return noopCameraCapability;
}
