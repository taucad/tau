import { Module } from '@nestjs/common';
import { TestApiController } from '#api/test-api/test-api.controller.js';

@Module({
  imports: [],
  controllers: [TestApiController],
})
export class TestApiModule {}
