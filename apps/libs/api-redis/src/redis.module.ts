import { Global, Module } from '@nestjs/common';
import { RedisService } from '#redis.service.js';

@Global() // Make RedisService available app-wide without importing
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
