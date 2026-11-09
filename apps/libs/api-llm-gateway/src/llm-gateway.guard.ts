import { HttpStatus, Inject, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'better-auth';
import type { FastifyRequest } from 'fastify';
import { AuthGuard, authInstanceKey } from '@taucad/api-auth';
import type { Environment } from '@taucad/api-core';
import { HostsService } from '@taucad/api-hosts';
import { createTauCorsOriginValidator } from '@taucad/api-core/utils/cors';
import { LlmGatewayError } from '#llm-gateway.error.js';
import { readSingleHeader } from '#llm-gateway.headers.js';

const principalKey = Symbol('llmGatewayPrincipal');
// oxlint-disable-next-line typescript/no-restricted-types -- AuthGuard assigns `session?.user ?? null` (auth.guard.ts:58); typing it `undefined` would describe a value this request never carries.
type PrincipalRequest = FastifyRequest & { [principalKey]?: string; user?: { id?: string } | null };

@Injectable()
export class LlmGatewayAuthGuard extends AuthGuard implements CanActivate {
  private readonly validateOrigin: ReturnType<typeof createTauCorsOriginValidator>;

  public constructor(
    @Inject(Reflector) reflector: Reflector,
    @Inject(authInstanceKey) auth: Auth,
    @Inject(HostsService) private readonly hosts: HostsService,
    @Inject(ConfigService) config: ConfigService<Environment, true>,
  ) {
    super(reflector, auth);
    this.validateOrigin = createTauCorsOriginValidator(
      config.get('TAU_FRONTEND_URL', { infer: true }),
      config.get('ADDITIONAL_CORS_ORIGINS', { infer: true }),
      config.get('NODE_ENV', { infer: true }),
    );
  }

  public override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    await this.assertTauOrigin(request.headers.origin);

    try {
      if (await super.canActivate(context)) {
        const userId = request.user?.id;
        if (userId) {
          request[principalKey] = userId;
          return true;
        }
      }
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) {
        throw error;
      }
    }

    const authorization = readSingleHeader(request, 'authorization', 'UNAUTHENTICATED');
    const device = await this.hosts.authenticateDevice(authorization);
    if (!device) {
      throw new LlmGatewayError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentication is required.');
    }
    request[principalKey] = device.ownerId;
    return true;
  }

  /**
   * Refuses browser callers from origins Tau does not own.
   *
   * This is **defence in depth, not a security control**: it only constrains
   * callers a browser forces to send `Origin`. A missing `Origin` is admitted
   * on purpose — every non-browser caller (Electron main, the agent host, curl)
   * sends none, and those are authenticated by the bearer or device credential
   * checked in `canActivate`. Never treat passing this check as authentication.
   *
   * @param origin - The request's `Origin` header, if it carried one.
   */
  private async assertTauOrigin(origin: string | undefined): Promise<void> {
    const allowed = await new Promise<boolean>((resolve) => {
      this.validateOrigin(origin, (error, result) => {
        resolve(error === null && result);
      });
    });
    if (!allowed) {
      throw new LlmGatewayError(
        HttpStatus.FORBIDDEN,
        'ORIGIN_NOT_ALLOWED',
        'This origin cannot use the model gateway.',
      );
    }
  }
}

export const readLlmGatewayPrincipal = (request: FastifyRequest): string => {
  const principal = (request as PrincipalRequest)[principalKey];
  if (!principal) {
    throw new LlmGatewayError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentication is required.');
  }
  return principal;
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- parameter decorators follow NestJS class-like naming.
export const LlmGatewayPrincipal = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return readLlmGatewayPrincipal(context.switchToHttp().getRequest<FastifyRequest>());
});
