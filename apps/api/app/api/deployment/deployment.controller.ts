/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { DeploymentAnswer } from '@taucad/types/deployment';
import { AuthGuard, PublicAuth } from '@taucad/api-auth';

/** The Nest token for this process's deployment answer, fixed at startup. */
export const deploymentAnswerToken = Symbol('deploymentAnswer');

/** How long a host may reuse the answer: five minutes, so a deployment change reaches hosts quickly. */
export const deploymentMaxAgeSeconds = 300;

/**
 * This API's deployment answer. The funded protocol (operation binding and attempt lookups) runs exactly when the API
 * runs as Tau Cloud, because `ModelInvocationModule` selects the funded invocation owner and the billing routes on the
 * same `TAU_CLOUD_ENABLED` flag.
 *
 * @param input - The Cloud flag and the billing environment.
 * @returns The answer `GET /v1/deployment` publishes.
 */
export const answerDeployment = (
  input: Readonly<{ tauCloudEnabled: boolean; billingEnvironment: string | undefined }>,
): DeploymentAnswer => ({
  version: 1,
  edition: input.tauCloudEnabled ? 'cloud' : 'self-host',
  billing: input.tauCloudEnabled
    ? {
        funded: true,
        ...(input.billingEnvironment ? { environment: input.billingEnvironment } : {}),
      }
    : { funded: false },
  maxAgeSeconds: deploymentMaxAgeSeconds,
});

/**
 * Publishes which edition this API runs and whether its gateway is funded, so a host chooses its model transport's
 * billing layer per run instead of per build.
 */
@UseGuards(AuthGuard)
@Controller({ path: 'deployment', version: '1' })
export class DeploymentController {
  public constructor(@Inject(deploymentAnswerToken) private readonly answer: DeploymentAnswer) {}

  /**
   * The deployment answer. No body and no session: the answer is the same for everyone and carries no account data, so
   * the route is public and its shared `max-age` never accompanies a session cookie.
   *
   * @param reply - The reply, for `Cache-Control`.
   * @returns The deployment answer.
   */
  @Get()
  @PublicAuth()
  public deployment(@Res({ passthrough: true }) reply: FastifyReply): DeploymentAnswer {
    void reply.header('cache-control', `public, max-age=${String(this.answer.maxAgeSeconds)}`);
    return this.answer;
  }
}
