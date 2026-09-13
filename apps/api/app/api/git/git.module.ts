/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { BillingModule } from '#api/billing/billing.module.js';
import { DatabaseModule } from '#database/database.module.js';
import { GitBackupService } from '#api/git/git-backup.service.js';
import { GitBasicAuthMiddleware, registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitProxyController } from '#api/git/git-proxy.controller.js';
import { GitRepositoryService } from '#api/git/git.service.js';

/**
 * The Tau Hosted Remote. StorageModule is `@Global()`, so `ObjectStorageService`
 * (LFS objects, bundle snapshots) needs no explicit import.
 */
@Module({
  imports: [BillingModule, DatabaseModule],
  controllers: [GitController, GitProxyController],
  providers: [GitRepositoryService, GitLfsService, GitBackupService],
  exports: [GitRepositoryService],
})
export class GitModule implements NestModule, OnModuleInit {
  public constructor(private readonly adapterHost: HttpAdapterHost) {}

  public onModuleInit(): void {
    // Fastify refuses a content type it has no parser for, and git's request
    // bodies are streams this module pipes into a child process unparsed.
    registerGitContentTypeParsers(this.adapterHost.httpAdapter.getInstance<FastifyInstance>());
  }

  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GitBasicAuthMiddleware).forRoutes(GitController);
  }
}
