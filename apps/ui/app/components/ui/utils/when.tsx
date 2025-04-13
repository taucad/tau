import type { ReactNode } from 'react';

/**
 * Conditional rendering for React.
 *
 * @param condition - The condition to check.
 * @param children - The children to render if the condition is true.
 * @returns The children if the condition is true, otherwise null.
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async -- TODO: revisit this
export function When({ shouldRender, children }: { readonly shouldRender: boolean; readonly children: ReactNode }) {
  return shouldRender ? children : null;
}
