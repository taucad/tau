import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
// oxlint-disable-next-line eslint-plugin-import/no-unassigned-import -- Side-effect import to register Fastify type augmentation
import '#api/publications/viewer-identity.fastify-augmentation.js';
import { ViewerIdentityService } from '#api/publications/viewer-identity.service.js';

function readSessionUserId(request: FastifyRequest): string | undefined {
  const userUnknown = (request as FastifyRequest & { user?: { id?: unknown } }).user;
  const id = userUnknown?.id;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

@Injectable()
export class ViewerIdentityInterceptor implements NestInterceptor {
  public constructor(private readonly viewerIdentityService: ViewerIdentityService) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    request.viewerIdentity = this.viewerIdentityService.resolveForRequest({
      request,
      reply,
      sessionUserId: readSessionUserId(request),
    });

    return next.handle();
  }
}
