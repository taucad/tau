/* eslint-disable no-use-extend-native/no-use-extend-native -- Reflect.Metadata is required */
import type { DynamicModule, NestModule, OnModuleInit } from '@nestjs/common';
import { Global, Inject, Logger, Module } from '@nestjs/common';
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

type AuthInstance = ReturnType<typeof betterAuth>;

const hooks = [
  { metadataKey: beforeHookKey, hookType: 'before' as const },
  { metadataKey: afterHookKey, hookType: 'after' as const },
];

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
      imports: [DatabaseModule],
      providers: [
        {
          provide: authInstanceKey,
          async useFactory(
            databaseService: DatabaseService,
            configService: ConfigService<Environment, true>,
            authService: AuthService,
          ): Promise<AuthInstance> {
            const config = getBetterAuthConfig({
              databaseService,
              configService,
              authService,
            });
            return betterAuth(config);
          },
          inject: [DatabaseService, ConfigService, AuthService],
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
    @Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost,
  ) {}

  public onModuleInit(): void {
    if (!this.auth.options.hooks) {
      return;
    }

    const providers = this.discoveryService
      .getProviders()
      .filter(({ metatype }) => metatype && Reflect.getMetadata(hookKey, metatype));

    for (const provider of providers) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- providerPrototype is not typed
      const providerPrototype = Object.getPrototypeOf(provider.instance);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- providerPrototype is not typed
      const methods = this.metadataScanner.getAllMethodNames(providerPrototype);

      for (const method of methods) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- providerPrototype is not typed
        const providerMethod = providerPrototype[method];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- providerPrototype is not typed
        this.setupHooks(providerMethod);
      }
    }
  }

  public configure(): void {
    const basePath = this.auth.options.basePath!;

    const { httpAdapter } = this.adapter;
    const instance = httpAdapter.getInstance<FastifyAdapter>();

    // Configure the auth routes
    instance.all(`${basePath}/*`, async (request: Request, reply: Reply) => {
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
          body: request.body ? JSON.stringify(request.body) : undefined,
        });

        const response = await this.auth.handler(request_);

        void reply.status(response.status);
        // eslint-disable-next-line unicorn/no-array-for-each -- headers are not iterable
        response.headers.forEach((value, key) => reply.header(key, value));

        const responseText = response.body ? await response.text() : null;
        void reply.send(
          responseText ?? {
            status: response.status,
            message: response.statusText,
          },
        );
      } catch (error) {
        this.logger.fatal(`Better auth error ${String(error)}`);
        void reply.status(500).send({
          error: 'Internal authentication error',
          code: 'AUTH_FAILURE',
        });
      }
    });

    this.logger.log(`AuthModule initialized at '${basePath}/*'`);
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
