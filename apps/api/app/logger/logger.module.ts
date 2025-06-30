import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import useLoggerFactory from '~/logger/logger-factory.js';

@Module({
  imports: [
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- PinoLoggerModule has `any` typings that don't matter for Dependency-injection
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: useLoggerFactory,
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
