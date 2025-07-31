import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { useLoggerFactory } from '#logger/logger-factory.js';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: useLoggerFactory,
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
