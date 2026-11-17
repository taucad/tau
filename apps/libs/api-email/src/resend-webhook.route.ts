import { HttpException } from '@nestjs/common';
import type { FastifyInstance, FastifyReply as Reply, FastifyRequest as Request } from 'fastify';
import type { ResendWebhookService } from '#resend-webhook.service.js';

/** Resend delivers single events; a quarter of a megabyte is ample and bounds an unsigned flood (blueprint, Limits). */
const resendWebhookBodyLimit = 256 * 1024;

/** A route the auth module registers under its base path, structurally `AuthRouteExtension` from `@taucad/api-auth`. */
export type ResendWebhookRouteExtension = {
  register(instance: FastifyInstance, basePath: string): void;
};

const headerValue = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/**
 * The Resend webhook, `POST ${basePath}/resend/webhook` under the auth base path
 * (`/v1/auth/resend/webhook`). Like the Stripe route, its scoped parser keeps the
 * signed bytes exactly as delivered, so it registers ahead of the Better Auth wildcard
 * through the auth module's route extension port and never reaches Better Auth.
 *
 * Answers: 200 for a verified delivery (stored, duplicate, other environment or an
 * unsubscribed type); 400 for a missing header or a body that does not verify; 503
 * while `RESEND_WEBHOOK_SECRET` is unset, so Resend retries until the secret arrives.
 *
 * @param webhook - The service that verifies and records the delivery.
 * @returns The route extension the app binds for the auth module.
 */
export const resendWebhookRoute = (webhook: Pick<ResendWebhookService, 'receive'>): ResendWebhookRouteExtension => ({
  register(instance, basePath): void {
    const resendWebhookPath = `${basePath}/resend/webhook`;
    void instance.register(async (scoped) => {
      scoped.removeContentTypeParser('application/json');
      scoped.addContentTypeParser(
        'application/json',
        { parseAs: 'string', bodyLimit: resendWebhookBodyLimit },
        (_request, body, done) => {
          done(null, body);
        },
      );
      scoped.post(resendWebhookPath, { bodyLimit: resendWebhookBodyLimit }, async (request: Request, reply: Reply) => {
        if (typeof request.body !== 'string') {
          await reply.status(400).send({ code: 'invalid_resend_delivery' });
          return;
        }
        try {
          const outcome = await webhook.receive({
            payload: request.body,
            headers: {
              id: headerValue(request.headers['svix-id']),
              timestamp: headerValue(request.headers['svix-timestamp']),
              signature: headerValue(request.headers['svix-signature']),
            },
          });
          await reply.status(200).send({ received: true, outcome });
        } catch (error) {
          const status = error instanceof HttpException ? error.getStatus() : 503;
          await reply.status(status).send({
            code: status >= 500 ? 'resend_inbox_unavailable' : 'invalid_resend_delivery',
          });
        }
      });
    });
  },
});
