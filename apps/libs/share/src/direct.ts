import { shareArtifactLimits } from '@taucad/project-core/share-artifact';
import { publishDirectShare, resolveDirectShare } from '@taucad/project-core/share-direct';
import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';

/** Direct self-contained URL provider metadata. @public */
export const directShareProviderDescriptor = {
  id: 'direct',
  label: 'Direct link',
  capabilities: ['project.publish', 'project.resolve'],
  maxArtifactCharacters: shareArtifactLimits.maxDirectUrlCharacters,
} as const satisfies ShareProviderDescriptor;

/** Direct self-contained URL share provider over `@taucad/project-core/share-direct`. @public */
export const directShareProvider: ShareProvider = {
  descriptor: directShareProviderDescriptor,
  publish: publishDirectShare,
  resolve: resolveDirectShare,
};
