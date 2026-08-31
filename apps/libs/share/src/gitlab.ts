import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';
import { resolveRepositoryShare } from '#repository-provider.js';

/** Public GitLab.com repository project source. @public */
export const gitlabShareProviderDescriptor = {
  id: 'gitlab',
  label: 'GitLab repository',
  capabilities: ['project.resolve'],
} as const satisfies ShareProviderDescriptor;

/** Resolve-only GitLab.com repository provider. @public */
export const gitlabShareProvider: ShareProvider = {
  descriptor: gitlabShareProviderDescriptor,
  resolve: async (input, context) => resolveRepositoryShare('gitlab', input, context),
};
