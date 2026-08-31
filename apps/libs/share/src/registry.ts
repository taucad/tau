import { ShareError } from '#provider.js';
import type {
  ShareProvider,
  ShareProviderCapability,
  ShareProviderDefinition,
  ShareProviderDescriptor,
} from '#provider.js';

/** Immutable provider lookup and lazy loader. @public */
export type ShareProviderRegistry = {
  readonly descriptors: readonly ShareProviderDescriptor[];
  readonly load: (providerId: string) => Promise<ShareProvider>;
};

const validateProvider = (provider: ShareProvider, descriptor: ShareProviderDescriptor): void => {
  if (provider.descriptor.id !== descriptor.id) {
    throw new Error(`Share provider '${descriptor.id}' loaded descriptor '${provider.descriptor.id}'`);
  }
  const methodByCapability = {
    'project.publish': provider.publish,
    'project.resolve': provider.resolve,
    'project.republish': provider.republish,
    'project.unpublish': provider.unpublish,
  } satisfies Record<ShareProviderCapability, unknown>;
  const registeredCapabilities = new Set(descriptor.capabilities);
  if (
    provider.descriptor.capabilities.length !== descriptor.capabilities.length ||
    provider.descriptor.capabilities.some((capability) => !registeredCapabilities.has(capability))
  ) {
    throw new Error(`Share provider '${descriptor.id}' loaded a different capability inventory`);
  }
  for (const [capability, method] of Object.entries(methodByCapability) as Array<[ShareProviderCapability, unknown]>) {
    if (registeredCapabilities.has(capability) && method === undefined) {
      throw new Error(`Share provider '${descriptor.id}' declares ${capability} without implementing it`);
    }
    if (!registeredCapabilities.has(capability) && method !== undefined) {
      throw new Error(`Share provider '${descriptor.id}' implements undeclared capability ${capability}`);
    }
  }
};

const freezeDescriptor = (descriptor: ShareProviderDescriptor): ShareProviderDescriptor =>
  Object.freeze({
    ...descriptor,
    capabilities: Object.freeze([...descriptor.capabilities]),
    ...(descriptor.connection
      ? {
          connection: Object.freeze({
            ...descriptor.connection,
            scopes: Object.freeze([...descriptor.connection.scopes]),
          }),
        }
      : {}),
  });

/** Create a validated immutable registry from explicit first-party definitions. @public */
export const createShareProviderRegistry = (definitions: readonly ShareProviderDefinition[]): ShareProviderRegistry => {
  const byId = new Map<string, ShareProviderDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.descriptor.id)) {
      throw new Error(`Duplicate share provider id '${definition.descriptor.id}'`);
    }
    if (new Set(definition.descriptor.capabilities).size !== definition.descriptor.capabilities.length) {
      throw new Error(`Share provider '${definition.descriptor.id}' declares duplicate capabilities`);
    }
    byId.set(definition.descriptor.id, definition);
  }
  const descriptors = Object.freeze(definitions.map(({ descriptor }) => freezeDescriptor(descriptor)));
  return Object.freeze({
    descriptors,
    async load(providerId: string): Promise<ShareProvider> {
      const definition = byId.get(providerId);
      if (!definition) {
        throw new ShareError('SHARE_PROVIDER_UNKNOWN', 'This share provider is not supported.');
      }
      const provider = await definition.load();
      validateProvider(provider, definition.descriptor);
      return provider;
    },
  });
};
