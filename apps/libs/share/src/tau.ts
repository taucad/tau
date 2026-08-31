import { ShareError } from '#provider.js';
import type { ShareProvider, ShareProviderDescriptor } from '#provider.js';

/** Tau persisted publication provider metadata. @public */
export const tauShareProviderDescriptor = {
  id: 'tau',
  label: 'Hosted link',
  capabilities: ['project.publish', 'project.resolve'],
  connection: { id: 'tau', scopes: [] },
} as const satisfies ShareProviderDescriptor;

/** Adapter around the application's existing Tau publication transport. @public */
export const tauShareProvider: ShareProvider = {
  descriptor: tauShareProviderDescriptor,
  async publish(input, context) {
    if (!context.tau) {
      throw new ShareError('SHARE_AUTH_REQUIRED', 'Sign in to persist this project with Tau.');
    }
    const result = await context.tau.publish({ snapshot: input.snapshot, signal: input.signal });
    return {
      locator: { providerId: 'tau', reference: result.publicationId },
      secrets: {},
      ...(result.externalUrl ? { externalUrl: result.externalUrl } : {}),
    };
  },
  async resolve(input, context) {
    const publicationId = input.locator.reference;
    if (!context.tau || input.locator.providerId !== 'tau' || !publicationId) {
      throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'This Tau publication is unavailable.');
    }
    return context.tau.resolve({ publicationId, signal: input.signal });
  },
};
