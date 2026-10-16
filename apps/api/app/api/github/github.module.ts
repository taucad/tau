import { GithubGistController } from '#api/github/github-gist.controller.js';
import { GithubGistService } from '#api/github/github-gist.service.js';
import { Module } from '@nestjs/common';
import { GithubController } from '#api/github/github.controller.js';
import { GithubService } from '#api/github/github.service.js';
import { DatabaseModule } from '#database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [GithubController, GithubGistController],
  providers: [GithubService, GithubGistService],
  exports: [GithubService],
})
export class GithubModule {}
