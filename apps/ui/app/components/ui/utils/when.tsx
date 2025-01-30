/**
 * Conditional rendering for React.
 *
 * @param condition - The condition to check.
 * @param children - The children to render if the condition is true.
 * @returns The children if the condition is true, otherwise null.
 */
export const When = ({ condition, children }: { condition: boolean; children: React.ReactNode }) => {
  // eslint-disable-next-line unicorn/no-null
  return condition ? <>{children}</> : null;
};
