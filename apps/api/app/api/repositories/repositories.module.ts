/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Module } from '@nestjs/common';
import { RepositoriesController } from '#api/repositories/repositories.controller.js';
import { RepositoriesService } from '#api/repositories/repositories.service.js';

@Module({
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
