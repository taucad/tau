import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';
import { resolveRepositoryShare } from '#repository-provider.js';

/** Public Bitbucket Cloud repository project source. @public */
export const bitbucketShareProviderDescriptor = {
  id: 'bitbucket',
  label: 'Bitbucket repository',
  capabilities: ['project.resolve'],
} as const satisfies ShareProviderDescriptor;

/** Resolve-only Bitbucket Cloud repository provider. @public */
export const bitbucketShareProvider: ShareProvider = {
  descriptor: bitbucketShareProviderDescriptor,
  resolve: async (input, context) => resolveRepositoryShare('bitbucket', input, context),
};
