import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Environment } from '#config/environment.config.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';

@Injectable()
export class ViewerIdentityService {
  public constructor(private readonly configService: ConfigService<Environment, true>) {}

  /**
   * Returns an authenticated viewer hash or a daily anonymous signal without
   * issuing a persistent identifier.
   */
  public resolveForRequest(args: { request: FastifyRequest; sessionUserId?: string }): ResolvedViewerIdentity {
    const { request, sessionUserId } = args;

    if (sessionUserId !== undefined && sessionUserId !== '') {
      return {
        sessionUserId,
        viewerHash: this.hashViewerMaterial(`session:${sessionUserId}`),
      };
    }

    return {
      viewerHash: this.hashViewerMaterial(`anon:${new Date().toISOString().slice(0, 10)}:${request.ip}`),
    };
  }

  private hashViewerMaterial(material: string): string {
    const secret = this.configService.get('TAU_VIEW_COOKIE_SECRET', { infer: true });
    return createHmac('sha256', secret).update(material).digest('hex');
  }
}
