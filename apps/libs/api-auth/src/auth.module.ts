/* oxlint-disable no-use-extend-native/no-use-extend-native -- Reflect.Metadata is required */
import type { DynamicModule, NestModule, OnModuleInit } from '@nestjs/common';
import { Global, Inject, Logger, Module, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule, DiscoveryService, HttpAdapterHost, MetadataScanner } from '@nestjs/core';
import { betterAuth } from 'better-auth';
import type { FastifyReply as Reply, FastifyRequest as Request } from 'fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { getBetterAuthConfig } from '#config/better-auth.config.js';
import { authInstanceKey, hookKey, beforeHookKey, afterHookKey } from '#auth.constant.js';
import { DatabaseModule, DatabaseService } from '@taucad/api-database';
import { AuthService } from '#auth.service.js';
import { BetterAuthService } from '#better-auth.service.js';
import type { Environment } from '@taucad/api-core';
import { EmailModule, EmailService } from '@taucad/api-email';
import { accountDeletionGateToken, accountDeletionHooksToken, authRouteExtensionsToken } from '#auth-extensions.js';
import type { AccountDeletionGate, AccountDeletionHook, AuthRouteExtension } from '#auth-extensions.js';

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
  /**
   * The Better Auth instance and its Nest services. What an account deletion
   * and the auth routes extend it with comes through the ports in
   * `auth-extensions.ts`, which the app binds; `tauCloudEnabled` is the mode
   * the app composes them for.
   */
  public static forRootAsync(_options: { readonly tauCloudEnabled: boolean }): DynamicModule {
    const authProvider = {
      provide: authInstanceKey,
      // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Nest resolves five distinct auth composition tokens.
      async useFactory(
        databaseService: DatabaseService,
        configService: ConfigService<Environment, true>,
        emailService: EmailService,
        closure: AccountDeletionGate | undefined,
        deletionHooks: readonly AccountDeletionHook[] | undefined,
      ): Promise<AuthInstance> {
        return betterAuth(
          getBetterAuthConfig({ databaseService, configService, emailService, closure, deletionHooks }),
        );
      },
      inject: [
        DatabaseService,
        ConfigService,
        EmailService,
        { token: accountDeletionGateToken, optional: true },
        { token: accountDeletionHooksToken, optional: true },
      ],
    };
    return {
      global: true,
      module: AuthModule,
      imports: [DatabaseModule, EmailModule],
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
    @Optional() @Inject(authRouteExtensionsToken) private readonly routeExtensions?: readonly AuthRouteExtension[],
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

    // Extensions (the byte-exact Stripe webhook in Tau Cloud) register ahead of the authentication wildcard.
    for (const extension of this.routeExtensions ?? []) {
      extension.register(instance, basePath);
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
