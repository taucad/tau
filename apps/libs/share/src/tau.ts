import { ShareError } from '#provider.js';
import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';

/** Cloud link provider metadata: the project's one stable link, `tau~shr_…`. @public */
export const tauShareProviderDescriptor = {
  id: 'tau',
  label: 'Cloud link',
  capabilities: ['project.publish', 'project.resolve'],
  connection: { id: 'tau', scopes: [] },
} as const satisfies ShareProviderDescriptor;

/** Adapter around the application's cloud link transport; the locator's reference is the link id. @public */
export const tauShareProvider: ShareProvider = {
  descriptor: tauShareProviderDescriptor,
  async publish(input, context) {
    if (!context.tau) {
      throw new ShareError('SHARE_AUTH_REQUIRED', 'Sign in to create a cloud link.');
    }
    const result = await context.tau.publish({ snapshot: input.snapshot, signal: input.signal });
    return {
      locator: { providerId: 'tau', reference: result.shareId },
      secrets: {},
      ...(result.externalUrl ? { externalUrl: result.externalUrl } : {}),
    };
  },
  async resolve(input, context) {
    const shareId = input.locator.reference;
    if (!context.tau || input.locator.providerId !== 'tau' || !shareId) {
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', "This cloud link isn't available.");
    }
    return context.tau.resolve({ shareId, signal: input.signal });
  },
};
