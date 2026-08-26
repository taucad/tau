import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';

declare module 'fastify' {
  // oxlint-disable-next-line typescript-eslint/consistent-type-definitions -- Module augmentation requires interface
  interface FastifyRequest {
    viewerIdentity?: ResolvedViewerIdentity;
  }
}

export {};
