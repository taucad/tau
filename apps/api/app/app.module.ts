import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { DatabaseModule } from '#database/database.module.js';
import { AuthModule } from '#auth/auth.module.js';
import { getEnvironment } from '#config/environment.config.js';
import { ApiModule } from '#api/api.module.js';
import { LoggerModule } from '#logger/logger.module.js';
import { RequestIdMiddleware } from '#middlewares/request-id.middleware.js';

@Module({
  imports: [
    ApiModule,
    DatabaseModule,
    AuthModule.forRootAsync(),
    ConfigModule.forRoot({ validate: getEnvironment, isGlobal: true }),
    LoggerModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
