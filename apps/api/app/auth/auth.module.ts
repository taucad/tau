/* oxlint-disable no-use-extend-native/no-use-extend-native -- Reflect.Metadata is required */
import type { DynamicModule, NestModule, OnModuleInit } from '@nestjs/common';
import { Global, Inject, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule, DiscoveryService, HttpAdapterHost, MetadataScanner } from '@nestjs/core';
import { betterAuth } from 'better-auth';
import type { FastifyReply as Reply, FastifyRequest as Request } from 'fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type Stripe from 'stripe';
import { getBetterAuthConfig } from '#config/better-auth.config.js';
import { authInstanceKey, hookKey, beforeHookKey, afterHookKey } from '#constants/auth.constant.js';
import { DatabaseModule } from '#database/database.module.js';
import { DatabaseService } from '#database/database.service.js';
import { AuthService } from '#auth/auth.service.js';
import { BetterAuthService } from '#auth/better-auth.service.js';
import type { Environment } from '#config/environment.config.js';
import { EmailModule } from '#email/email.module.js';
import { EmailService } from '#email/email.service.js';
import { BillingModule } from '#api/billing/billing.module.js';
import { BillingService } from '#api/billing/billing.service.js';
import { StripeEventRouter } from '#api/billing/stripe-event-router.service.js';
import { stripeClientKey } from '#api/billing/billing.constants.js';

type AuthInstance = ReturnType<typeof betterAuth>;

const hooks = [
  { metadataKey: beforeHookKey, hookType: 'before' },
  { metadataKey: afterHookKey, hookType: 'after' },
] as const;

/**
 * Better Auth host module (BA12 responsibility split):
 * - The **`@better-auth/stripe` plugin** owns Stripe-facing session flows —
 *   checkout, billing portal, subscription mirroring, and webhook signature
 *   verification at `/v1/auth/stripe/webhook` (which is why that path gets a
 *   byte-exact raw-body carve-out below; `JSON.stringify` re-serialization
 *   breaks signatures).
 * - The **BillingModule** owns everything money: credit grants flow ONLY via
 *   `invoice.paid` through `StripeEventRouter.dispatch` (plugin `onEvent`);
 *   the plugin's lifecycle hooks are invalidate-only. Entitlements are a
 *   projection over the plugin-mirrored `subscription` rows.
 * - Stripe customers are created lazily at the first billing action
 *   (`createCustomerOnSignUp: false`) — signup never depends on Stripe.
 */
@Global()
@Module({
  imports: [DiscoveryModule, DatabaseModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule implements NestModule, OnModuleInit {
  public static forRootAsync(): DynamicModule {
    return {
      global: true,
      module: AuthModule,
      imports: [DatabaseModule, EmailModule, BillingModule],
      providers: [
        {
          provide: authInstanceKey,
          async useFactory(
            databaseService: DatabaseService,
            configService: ConfigService<Environment, true>,
            authService: AuthService,
            emailService: EmailService,
            billingService: BillingService,
            stripeEventRouter: StripeEventRouter,
            stripeClient: Stripe,
          ): Promise<AuthInstance> {
            const config = getBetterAuthConfig({
              databaseService,
              configService,
              authService,
              emailService,
              billingService,
              stripeEventRouter,
              stripeClient,
            });
            return betterAuth(config);
          },
          inject: [
            DatabaseService,
            ConfigService,
            AuthService,
            EmailService,
            BillingService,
            StripeEventRouter,
            stripeClientKey,
          ],
        },
        BetterAuthService,
      ],
      exports: [authInstanceKey, BetterAuthService],
    };
  }

  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    @Inject(authInstanceKey) private readonly auth: AuthInstance,
    @Inject(DiscoveryService) private readonly discoveryService: DiscoveryService,
    @Inject(MetadataScanner) private readonly metadataScanner: MetadataScanner,
    @Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost<FastifyAdapter>,
  ) {}

  public onModuleInit(): void {
    if (!this.auth.options.hooks) {
      return;
    }

    const providers = this.discoveryService
      .getProviders()
      .filter(({ metatype }) => metatype && Reflect.getMetadata(hookKey, metatype));

    for (const provider of providers) {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- providerPrototype is not typed
      const providerPrototype = Object.getPrototypeOf(provider.instance);
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument -- providerPrototype is not typed
      const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

      for (const method of methods) {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- providerPrototype is not typed
        const providerMethod = providerPrototype[method];
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument -- providerPrototype is not typed
        this.setupHooks(providerMethod);
      }
    }
  }

  public configure(): void {
    const basePath = this.auth.options.basePath!;

    const { httpAdapter } = this.adapter;
    const instance = httpAdapter.getInstance();

    const isAuthRouteRegistered = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].some((method) =>
      instance.hasRoute({ url: `${basePath}/*`, method }),
    );

    if (isAuthRouteRegistered) {
      // Vite HMR will reload the app but can leave the routes registered, so we check
      // if the routes are already registered and skip the configuration.
      this.logger.log(`Routes: "${basePath}/*" already registered`);
      return;
    }

    // Stripe webhook signature verification needs the byte-exact raw payload:
    // the JSON.stringify re-serialization used by the catch-all below changes
    // whitespace and breaks every delivery (silent loss of credit grants). A
    // scoped Fastify plugin swaps the JSON parser for a raw-buffer parser on
    // exactly this route; @better-auth/stripe then reads the original bytes via
    // request.text() and verifies the signature (blueprint AD8).
    const stripeWebhookPath = `${basePath}/stripe/webhook`;
    void instance.register(async (scoped) => {
      scoped.removeContentTypeParser('application/json');
      scoped.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
        done(null, body);
      });
      scoped.post(stripeWebhookPath, async (request: Request, reply: Reply) => {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- the scoped parser above guarantees a raw byte body
        const rawBody = request.body as Uint8Array<ArrayBuffer>;
        // UTF-8 decode is byte-faithful for valid UTF-8 (all Stripe JSON);
        // Request re-encodes the string to the identical bytes for
        // signature verification downstream.
        await this.forwardToAuth(request, reply, new TextDecoder().decode(rawBody));
      });
    });

    // Configure the auth routes
    instance.all(`${basePath}/*`, async (request: Request, reply: Reply) => {
      await this.forwardToAuth(request, reply, request.body ? JSON.stringify(request.body) : undefined);
    });

    this.logger.log(`AuthModule initialized at '${basePath}/*'`);
  }

  private async forwardToAuth(request: Request, reply: Reply, body: string | undefined): Promise<void> {
    try {
      const url = new URL(request.url, `${request.protocol}://${request.hostname}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value) {
          headers.append(key, value.toString());
        }
      }

      const request_ = new Request(url.toString(), {
        method: request.method,
        headers,
        body,
      });

      const response = await this.auth.handler(request_);

      void reply.status(response.status);
      // oxlint-disable-next-line unicorn/no-array-for-each -- headers are not iterable
      response.headers.forEach((value, key) => reply.header(key, value));

      const responseText = response.body ? await response.text() : null;
      void reply.send(
        responseText ?? {
          status: response.status,
          message: response.statusText,
        },
      );
    } catch (error) {
      this.logger.fatal(error, 'Better auth error');
      void reply.status(500).send({
        error: 'Internal authentication error',
        code: 'AUTH_FAILURE',
      });
    }
  }

  private setupHooks(providerMethod: (context: unknown) => Promise<void>): void {
    if (!this.auth.options.hooks) {
      return;
    }

    for (const { metadataKey, hookType } of hooks) {
      const hookPath = Reflect.getMetadata(metadataKey, providerMethod) as string;
      if (!hookPath) {
        continue;
      }

      const originalHook = this.auth.options.hooks[hookType];
      this.auth.options.hooks[hookType] = async (context) => {
        if (originalHook) {
          await originalHook(context);
        }

        if (hookPath === context.request?.url) {
          await providerMethod(context);
        }
      };
    }
  }
}
