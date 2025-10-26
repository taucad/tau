import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Client-only component.
 *
 * This component is used to render children only on the client side.
 *
 * This is achieved by only mounting children after a `useEffect` hook has run.
 *
 * @param children - The children to render.
 * @returns The children if the component has mounted, otherwise null.
 */
export function ClientOnly({ children }: { readonly children: ReactNode }): ReactNode {
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return children;
}
