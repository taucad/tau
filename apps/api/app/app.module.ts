import { Module } from '@nestjs/common';
import type { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { DatabaseModule } from '@taucad/api-database';
import { StorageModule } from '#storage/storage.module.js';
import { AuthModule } from '@taucad/api-auth/module';
import { AuthExtensionsModule } from '#composition/auth-extensions.module.js';
import type { Environment } from '@taucad/api-core';
import { ApiModule } from '#api/api.module.js';
import { LoggerModule } from '@taucad/api-observability/logger-module';
import { RedisModule } from '@taucad/api-redis';
import { TelemetryModule } from '@taucad/api-observability';
import { LifecycleModule } from '@taucad/api-lifecycle';
import { RequestIdMiddleware } from '#middlewares/request-id.middleware.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

@Module({
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ZodSerializerInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  public static forRoot(environment: Environment): DynamicModule {
    const mode = { tauCloudEnabled: environment.TAU_CLOUD_ENABLED };
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ validate: () => environment, isGlobal: true }),
        DatabaseModule,
        TelemetryModule,
        LifecycleModule,
        RedisModule,
        AuthExtensionsModule.forRoot(mode),
        AuthModule.forRootAsync(mode),
        ApiModule.forRoot(mode),
        StorageModule,
        LoggerModule,
      ],
    };
  }

  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
