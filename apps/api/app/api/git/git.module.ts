/* oxlint-disable new-cap -- NestJS decorators are factories */
import { Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { FastifyInstance } from 'fastify';
import { DatabaseModule } from '#database/database.module.js';
import { ProjectAccessModule } from '#api/collaboration/project-access.module.js';
import { repositoryStoreKey } from '#api/git/git.constants.js';
import { GitBasicAuthMiddleware, registerGitContentTypeParsers } from '#api/git/git-transport.js';
import { GitController } from '#api/git/git.controller.js';
import { GitLfsService } from '#api/git/git-lfs.service.js';
import { GitProxyController } from '#api/git/git-proxy.controller.js';
import { GitRepositoryService } from '#api/git/git.service.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';

/**
 * The Tau Hosted Remote. StorageModule is `@Global()`, so `ObjectStorageService`
 * (LFS objects, the repository store's driver) needs no explicit import.
 *
 * The adapter is bound to `repositoryStoreKey` here and nowhere else, which is
 * the whole of NI14 in the container: every injection site above the adapter
 * asks for the port and cannot name a provider.
 */
@Module({
  imports: [DatabaseModule, ProjectAccessModule],
  controllers: [GitController, GitProxyController],
  providers: [
    GitRepositoryService,
    GitLfsService,
    S3RepositoryStore,
    { provide: repositoryStoreKey, useExisting: S3RepositoryStore },
  ],
  exports: [GitRepositoryService, S3RepositoryStore, repositoryStoreKey],
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
