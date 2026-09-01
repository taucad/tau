import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

export const ClientOnly = ({
  children,
  fallback = null,
}: {
  readonly children: ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return isMounted ? children : fallback;
};
