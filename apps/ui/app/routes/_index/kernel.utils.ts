import { kernelConfigurations } from '@taucad/types/constants';

/**
 * Format kernel names as a readable list with the specified conjunction.
 * @example formatKernelList('or') // "OpenSCAD, Replicad, Zoo, or JSCAD"
 * @example formatKernelList('and') // "OpenSCAD, Replicad, Zoo, and JSCAD"
 */
export function formatKernelList(conjunction: 'and' | 'or' = 'and'): string {
  const names = kernelConfigurations.map((k) => k.name);
  if (names.length <= 1) {
    return names[0] ?? '';
  }

  return `${names.slice(0, -1).join(', ')}, ${conjunction} ${names.at(-1)}`;
}

