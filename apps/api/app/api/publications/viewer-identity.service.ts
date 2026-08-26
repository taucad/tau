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
    let visitorToken = '';

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
      const freshToken = generatePrefixedId(idPrefix.publicationViewer);
      const nodeEnv = this.configService.get('NODE_ENV', { infer: true });
      void reply.setCookie(publicationViewCookieName, freshToken, {
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
      // Fold request.ip (Fastify honours trustProxy) into the material so an absent cookie still yields a
      // stable per-client identity instead of a fresh id every request, preserving view dedup/rate-limit.
      // The freshly-minted cookie token is deliberately NOT hashed here — hashing it would make every
      // cookie-less request unique again; the cookie takes over as the primary signal from the next request.
      viewerHash: this.hashViewerMaterial(`anon:${visitorToken}:${request.ip}`),
    };
  }

  private hashViewerMaterial(material: string): string {
    const secret = this.configService.get('TAU_VIEW_COOKIE_SECRET', { infer: true });
    return createHmac('sha256', secret).update(material).digest('hex');
  }
}
