/* oxlint-disable new-cap -- NestJS createParamDecorator factory */
import { createParamDecorator, InternalServerErrorException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
// oxlint-disable-next-line eslint-plugin-import/no-unassigned-import -- Side-effect import to register Fastify type augmentation
import '#api/publications/viewer-identity.fastify-augmentation.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- NestJS decorator factories use PascalCase
export const ViewerIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedViewerIdentity => {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const identity = request.viewerIdentity;
    if (identity === undefined) {
      throw new InternalServerErrorException('viewerIdentity missing — ViewerIdentityInterceptor required');
    }

    return identity;
  },
);
