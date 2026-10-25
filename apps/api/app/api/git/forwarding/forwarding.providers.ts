import { Logger } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { Environment } from '#config/environment.config.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { RedisService } from '#redis/redis.service.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { repositoryStoreKey } from '#api/git/git.constants.js';
import { developmentPublicKeysJson } from '#api/git/forwarding/contract/development-keys.js';
import { parsePublicKeys } from '#api/git/forwarding/contract/keys.js';
import { createGitExecution, gitExecutionKey } from '#api/git/forwarding/git-execution.js';
import type { GitExecution } from '#api/git/forwarding/git-execution.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { inProcessPreviewWriter } from '#api/git/forwarding/in-process-executor.js';
import { memoryReceiptLedger, redisReceiptLedger } from '#api/git/forwarding/receipt-ledger.js';
import { GitRepositoryService, receiptVerificationKey } from '#api/git/git.service.js';
import type { ReceiptVerification } from '#api/git/git.service.js';
import type { RepositoryStore } from '#api/git/store/port.js';

/**
 * The tau-api side of the hop as `GitModule` binds it (DC1). Where git runs is
 * decided once at boot (`git-execution.ts`): forwarded to tau-storage when
 * `TAU_STORAGE_URL` is set, otherwise in this process. Outside production an
 * unset key is the development pair; in production the development kids are
 * refused outright, so a staging or production API can never sign or accept
 * with a key anyone can compute.
 */

const refuseDevelopmentKid = (environment: string, kids: readonly string[], name: string): void => {
  if (environment === 'production' && kids.some((kid) => kid.endsWith('-development'))) {
    throw new Error(`${name} must not use the development key in production`);
  }
};

/** The boot-time decision, logged once as `git_execution=forwarded|in_process`. */
export const gitExecutionProvider: Provider = {
  provide: gitExecutionKey,
  // oxlint-disable-next-line max-params -- Nest resolves six distinct injection tokens.
  useFactory: (
    config: ConfigService<Environment, true>,
    metrics: MetricsService,
    store: RepositoryStore,
    shutdown: ShutdownService,
    objects: ObjectStorageService,
    modules: ModuleRef,
  ): GitExecution =>
    createGitExecution({
      nodeEnvironment: config.get('NODE_ENV', { infer: true }),
      storageUrl: config.get('TAU_STORAGE_URL', { infer: true }),
      grantSigningKey: config.get('TAU_STORAGE_GRANT_SIGNING_KEY', { infer: true }),
      metrics,
      store,
      shutdown,
      previews: () => inProcessPreviewWriter(objects),
      /* Resolved per post: the service is built after this provider. */
      applyReceipt: async (receipt) => modules.get(GitRepositoryService, { strict: false }).applyReceipt(receipt),
      logger: new Logger('GitExecution'),
    }),
  inject: [ConfigService, MetricsService, repositoryStoreKey, ShutdownService, ObjectStorageService, ModuleRef],
};

/** The executor the boot-time decision chose. */
export const gitExecutorProvider: Provider = {
  provide: gitExecutorKey,
  useFactory: (execution: GitExecution): GitExecutor => execution.executor,
  inject: [gitExecutionKey],
};

/**
 * The receipt verification keys and the Redis ledger every API Machine shares.
 * In process, the keys are that worker's process keys and nothing else, and
 * the ledger is this process's memory: only this process can sign a receipt
 * those keys verify, so no other Machine can replay one, and a push derives
 * its state before its `ok` without a Redis round trip, as before DC1 (review S4).
 */
export const receiptVerificationProvider: Provider = {
  provide: receiptVerificationKey,
  useFactory: (
    config: ConfigService<Environment, true>,
    redis: RedisService,
    execution: GitExecution,
  ): ReceiptVerification => {
    if (execution.receiptKeys !== undefined) {
      return { keys: execution.receiptKeys, ledger: memoryReceiptLedger() };
    }
    const ledger = redisReceiptLedger(redis.client);
    const environment = config.get('NODE_ENV', { infer: true });
    const raw = config.get('TAU_STORAGE_RECEIPT_PUBLIC_KEYS', { infer: true });
    const keys = parsePublicKeys(raw ?? developmentPublicKeysJson('receipt'), 'TAU_STORAGE_RECEIPT_PUBLIC_KEYS');
    refuseDevelopmentKid(environment, [...keys.keys()], 'TAU_STORAGE_RECEIPT_PUBLIC_KEYS');
    return { keys, ledger };
  },
  inject: [ConfigService, RedisService, gitExecutionKey],
};
