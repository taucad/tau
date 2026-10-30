import type { ShareProviderDescriptor } from '@taucad/share/provider';

/** Catalog metadata stays available without loading project assets. */
export const builtinShareProviderDescriptor = {
  id: 'builtin',
  label: 'Tau catalog',
  capabilities: ['project.resolve'],
} as const satisfies ShareProviderDescriptor;
