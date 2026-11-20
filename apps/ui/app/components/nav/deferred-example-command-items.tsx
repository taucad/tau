import { Suspense, useSyncExternalStore } from 'react';
import { load } from '#lib/code-loading.js';
import { lazy } from '#lib/lazy-component.js';

// Every route mounts the palette items, so the example catalog loads on its own chunk instead of joining each route's
// entry.
const ExampleCommandPaletteItems = lazy(async () => {
  const m = await load(async () =>
    import('#components/nav/example-command-items.js').then((loaded) => ({
      ExampleCommandPaletteItems: loaded.ExampleCommandPaletteItems,
    })),
  );
  return { default: m.ExampleCommandPaletteItems };
});

const subscribeNever = (): (() => void) => () => undefined;

/**
 * The example catalog's command palette items, mounted after hydration only. They render nothing and are needed only
 * once the palette can open, while a server render of the lazy chunk writes a pending or an empty Suspense boundary
 * depending on whether that process had loaded it yet. Rendering nothing on the server keeps every document, the static
 * shells' included, independent of the order the build or the function rendered in (progressive loading shell
 * invariant 2).
 *
 * @returns The deferred items, or nothing before hydration.
 */
export function DeferredExampleCommandPaletteItems(): React.ReactNode {
  const isHydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return isHydrated ? (
    <Suspense fallback={null}>
      <ExampleCommandPaletteItems />
    </Suspense>
  ) : undefined;
}
