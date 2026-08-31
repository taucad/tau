import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';
import { resolveRepositoryShare } from '#repository-provider.js';

/** Public GitHub repository project source. @public */
export const githubShareProviderDescriptor = {
  id: 'github',
  label: 'GitHub repository',
  capabilities: ['project.resolve'],
} as const satisfies ShareProviderDescriptor;

/** Resolve-only GitHub repository provider. @public */
export const githubShareProvider: ShareProvider = {
  descriptor: githubShareProviderDescriptor,
  resolve: async (input, context) => resolveRepositoryShare('github', input, context),
};
