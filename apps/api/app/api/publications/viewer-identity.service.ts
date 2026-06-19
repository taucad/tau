import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { idPrefix, publicationApiCode, publicationViewCookieName } from '@taucad/types/constants';
import type { Environment } from '#config/environment.config.js';
import type { ResolvedViewerIdentity } from '#api/publications/viewer-identity.types.js';
import { generatePrefixedId } from '@taucad/utils/id';

@Injectable()
export class ViewerIdentityService {
  public constructor(private readonly configService: ConfigService<Environment, true>) {}

  /**
   * Issues or renews the signed anonymous `tau_view_id` cookie when needed and returns a stable viewer hash.
   *
   * Authenticated callers reuse the session user id material and never receive a new cookie.
   */
  public resolveForRequest(args: {
    request: FastifyRequest;
    reply: FastifyReply;
    sessionUserId?: string;
  }): ResolvedViewerIdentity {
    const { request, reply, sessionUserId } = args;

    if (sessionUserId !== undefined && sessionUserId !== '') {
      return {
        sessionUserId,
        viewerHash: this.hashViewerMaterial(`session:${sessionUserId}`),
      };
    }

    const cookieRaw = request.cookies[publicationViewCookieName];
    let visitorToken: string;

    if (cookieRaw !== undefined && cookieRaw !== '') {
      const unsigned = reply.unsignCookie(cookieRaw);
      if (!unsigned.valid || unsigned.value === '') {
        throw new UnauthorizedException({
          code: publicationApiCode.INVALID_VIEW_COOKIE,
          message: 'Invalid viewer cookie',
        });
      }

      visitorToken = unsigned.value;
    } else {
      visitorToken = generatePrefixedId(idPrefix.publicationViewer);
      const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
      void reply.setCookie(publicationViewCookieName, visitorToken, {
        signed: true,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: nodeEnv === 'production',
        /** Seconds (~180d). */
        maxAge: 180 * 24 * 60 * 60,
      });
    }

    return {
      viewerHash: this.hashViewerMaterial(`anon:${visitorToken}`),
    };
  }

  private hashViewerMaterial(material: string): string {
    const secret = this.configService.get('TAU_VIEW_COOKIE_SECRET', { infer: true });
    return createHmac('sha256', secret).update(material).digest('hex');
  }
}
