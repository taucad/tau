import { Module } from '@nestjs/common';
import { GithubController } from '#api/github/github.controller.js';
import { GithubService } from '#api/github/github.service.js';
import { DatabaseModule } from '#database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [GithubController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
