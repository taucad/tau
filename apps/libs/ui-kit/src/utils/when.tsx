import type { ReactNode } from 'react';

/**
 * Conditional rendering for React.
 *
 * @param condition - The condition to check.
 * @param children - The children to render if the condition is true.
 * @returns The children if the condition is true, otherwise null.
 */

export function When({
  shouldRender,
  children,
}: {
  readonly shouldRender: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return shouldRender ? children : null;
}
