import { Inject, Injectable, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Auth } from 'better-auth';
import type { FastifyRequest } from 'fastify';
import { authInstanceKey } from '#constants/auth.constant.js';
import { AuthGuard } from '#auth/auth.guard.js';
import { HostsService } from '#api/hosts/hosts.service.js';

/** A provisioned cloud host reporting for its owner on its own project (T11). */
export type CloudHostReporter = {
  readonly deviceId: string;
  readonly projectId: string;
};

const reporterKey = Symbol('cloudHostReporter');
// oxlint-disable-next-line typescript/no-restricted-types -- AuthGuard assigns `session?.user ?? null`; typing it `undefined` would describe a value this request never carries.
type ReporterRequest = FastifyRequest & { [reporterKey]?: CloudHostReporter; user?: { id?: string } | null };

/**
 * A session, or a cloud host's device credential on the two agent-evidence
 * routes it reports through: reading its owner's purposes and posting
 * evidence. Nothing else admits a device credential this way.
 *
 * A paired laptop's credential is refused: a local directory has no cloud
 * project to report for. The host acts for its owner, so the owner's own grant
 * for the host's project still decides what is admitted; being a cloud host is
 * not consent. Callers bind the request to {@link CloudHostReporter}.
 */
@Injectable()
export class CloudHostEvidenceGuard extends AuthGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) reflector: Reflector,
    @Inject(authInstanceKey) auth: Auth,
    @Inject(HostsService) private readonly hosts: HostsService,
  ) {
    super(reflector, auth);
  }

  public override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ReporterRequest>();
    const device = await this.hosts.authenticateDevice(request.headers.authorization);
    if (device === undefined) {
      return super.canActivate(context);
    }
    if (!device.cloudProjectId) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED' });
    }
    request.user = { id: device.ownerId };
    request[reporterKey] = { deviceId: device.id, projectId: device.cloudProjectId };
    return true;
  }
}

/**
 * The cloud host a request was admitted as by {@link CloudHostEvidenceGuard},
 * or `undefined` for a session.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- parameter decorators follow NestJS class-like naming.
export const CloudHost = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CloudHostReporter | undefined =>
    context.switchToHttp().getRequest<ReporterRequest>()[reporterKey],
);
