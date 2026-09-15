/* oxlint-disable no-use-extend-native/no-use-extend-native -- Reflect.Metadata is required */
import { BillingAccountClosureService } from '#api/billing/billing-account-closure.service.js';
import { BillingPaymentsService } from '#api/billing/billing-payments.service.js';
import type { DynamicModule, NestModule, OnModuleInit } from '@nestjs/common';
import { Global, HttpException, Inject, Logger, Module, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule, DiscoveryService, HttpAdapterHost, MetadataScanner } from '@nestjs/core';
import { betterAuth } from 'better-auth';
import type { FastifyReply as Reply, FastifyRequest as Request } from 'fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
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

type AuthInstance = ReturnType<typeof betterAuth>;

const hooks = [
  { metadataKey: beforeHookKey, hookType: 'before' },
  { metadataKey: afterHookKey, hookType: 'after' },
] as const;

/** Authentication remains available while first-party payment ownership is qualified. */
@Global()
@Module({
  imports: [DiscoveryModule, DatabaseModule],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule implements NestModule, OnModuleInit {
  public static forRootAsync(options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    const authProvider = options.tauCloudEnabled
      ? {
          provide: authInstanceKey,
          // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves four distinct auth composition tokens.
          async useFactory(
            databaseService: DatabaseService,
            configService: ConfigService<Environment, true>,
            emailService: EmailService,
            closure: BillingAccountClosureService,
          ): Promise<AuthInstance> {
            return betterAuth(getBetterAuthConfig({ databaseService, configService, emailService, closure }));
          },
          inject: [DatabaseService, ConfigService, EmailService, BillingAccountClosureService],
        }
      : {
          provide: authInstanceKey,
          async useFactory(
            databaseService: DatabaseService,
            configService: ConfigService<Environment, true>,
            emailService: EmailService,
          ): Promise<AuthInstance> {
            return betterAuth(getBetterAuthConfig({ databaseService, configService, emailService }));
          },
          inject: [DatabaseService, ConfigService, EmailService],
        };
    return {
      global: true,
      module: AuthModule,
      imports: [DatabaseModule, EmailModule, ...(options.tauCloudEnabled ? [BillingModule] : [])],
      providers: [authProvider, BetterAuthService],
      exports: [authInstanceKey, BetterAuthService],
    };
  }

  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    @Inject(authInstanceKey) private readonly auth: AuthInstance,
    @Inject(DiscoveryService) private readonly discoveryService: DiscoveryService,
    @Inject(MetadataScanner) private readonly metadataScanner: MetadataScanner,
    @Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost<FastifyAdapter>,
    // oxlint-disable-next-line eslint/new-cap -- Nest's Optional decorator is a function by contract.
    @Optional() @Inject(BillingPaymentsService) private readonly payments?: BillingPaymentsService,
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

    // This scoped parser preserves signed bytes ahead of the authentication wildcard.
    if (this.payments) {
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
            await this.payments?.receiveWebhook(new Uint8Array(request.body), request.headers['stripe-signature']);
            await reply.status(200).send({ received: true });
          } catch (error) {
            const status = error instanceof HttpException ? error.getStatus() : 503;
            await reply
              .status(status)
              .send({ code: status >= 500 ? 'stripe_inbox_unavailable' : 'invalid_stripe_delivery' });
          }
        });
      });
    }

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
