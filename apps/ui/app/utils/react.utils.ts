/**
 * Recursively extracts text content from React elements and their children
 */
export function extractTextFromChildren(children: unknown): string {
  if (typeof children === 'string') {
    return children;
  }

  if (typeof children === 'number') {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children
      .map((child) => {
        return extractTextFromChildren(child);
      })
      .join('');
  }

  if (children && typeof children === 'object' && 'props' in children) {
    return extractTextFromChildren((children as { props: { children: unknown } }).props.children);
  }

  return '';
}
