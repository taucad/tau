import { HttpException } from '@nestjs/common';
import type { FastifyReply as Reply, FastifyRequest as Request } from 'fastify';
import type { AuthRouteExtension } from '@taucad/api-auth';
import type { BillingPaymentsService } from '#billing-payments.service.js';

/**
 * The Stripe webhook, `POST ${basePath}/stripe/webhook` under the auth base
 * path. Its scoped parser keeps the signed bytes exactly as delivered, so it
 * registers ahead of the Better Auth wildcard (through the auth module's route
 * extension port) and never reaches Better Auth.
 *
 * @param payments - The payment service that verifies and records the delivery.
 * @returns The route extension the app binds for the auth module.
 */
export const stripeWebhookRoute = (payments: BillingPaymentsService): AuthRouteExtension => ({
  register(instance, basePath): void {
    // This scoped parser preserves signed bytes ahead of the authentication wildcard.
    const stripeWebhookPath = `${basePath}/stripe/webhook`;
    void instance.register(async (scoped) => {
      scoped.removeContentTypeParser('application/json');
      scoped.addContentTypeParser(
        'application/json',
        { parseAs: 'buffer', bodyLimit: 1024 * 1024 },
        (_request, body, done) => {
          done(null, body);
        },
      );
      scoped.post(stripeWebhookPath, { bodyLimit: 1024 * 1024 }, async (request: Request, reply: Reply) => {
        if (!Buffer.isBuffer(request.body) || typeof request.headers['stripe-signature'] !== 'string') {
          await reply.status(400).send({ code: 'invalid_stripe_delivery' });
          return;
        }
        try {
          await payments.receiveWebhook(new Uint8Array(request.body), request.headers['stripe-signature']);
          await reply.status(200).send({ received: true });
        } catch (error) {
          const status = error instanceof HttpException ? error.getStatus() : 503;
          await reply
            .status(status)
            .send({ code: status >= 500 ? 'stripe_inbox_unavailable' : 'invalid_stripe_delivery' });
        }
      });
    });
  },
});
