import { Module } from '@nestjs/common';
import type { DynamicModule, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { DatabaseModule } from '#database/database.module.js';
import { StorageModule } from '#storage/storage.module.js';
import { AuthModule } from '#auth/auth.module.js';
import type { Environment } from '#config/environment.config.js';
import { ApiModule } from '#api/api.module.js';
import { LoggerModule } from '#logger/logger.module.js';
import { RedisModule } from '#redis/redis.module.js';
import { TelemetryModule } from '#telemetry/telemetry.module.js';
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
        RedisModule,
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
