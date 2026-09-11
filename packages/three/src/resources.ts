/** A Three.js-owned resource that releases renderer state through `dispose`. @public */
export type ThreeDisposableResource = Readonly<{ dispose: () => void }>;

/**
 * Creates an idempotent disposer for a captured Three.js resource inventory.
 * Duplicate resource identities are disposed once, even when shared by several objects.
 *
 * @param resources - The complete resource inventory owned by one presentation.
 * @returns An idempotent disposer.
 * @public
 */
export const createThreeResourceDisposer = (resources: Iterable<ThreeDisposableResource>): (() => void) => {
  const owned = [...new Set(resources)];
  let disposed = false;
  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const resource of owned) {
      resource.dispose();
    }
  };
};
