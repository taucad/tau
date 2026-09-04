import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

type ClientOnlyProps = {
  readonly children: ReactNode;
  /** Rendered during SSR and before the first client-side effect. Defaults to `null`. */
  readonly fallback?: ReactNode;
};

/**
 * Client-only component.
 *
 * This component is used to render children only on the client side.
 *
 * This is achieved by only mounting children after a `useEffect` hook has run.
 *
 * @param props - The component props.
 * @param props.children - The children to render on the client.
 * @param props.fallback - Optional placeholder rendered during SSR and before hydration.
 * @returns The children if the component has mounted, otherwise the fallback (or null).
 */
export function ClientOnly({ children, fallback }: ClientOnlyProps): ReactNode {
  const hasMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  if (!hasMounted) {
    return fallback ?? null;
  }

  return children;
}
