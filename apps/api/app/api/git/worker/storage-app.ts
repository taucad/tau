import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '#config/environment.config.js';
import type { StorageEnvironment } from '#config/storage-environment.config.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { ObjectStorageService } from '#storage/object-storage.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { storageKeepAliveTimeoutMilliseconds } from '#api/git/forwarding/contract/hop.js';
import { parsePublicKeys, parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import { S3RepositoryStore } from '#api/git/store/s3-repository-store.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { gitVersionProbe } from '#api/git/worker/git-toolchain.js';
import { createReceiptChannel } from '#api/git/worker/receipt-channel.js';
import { dnsMembers } from '#api/git/worker/storage-members.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import { createStorageRequestHandler } from '#api/git/worker/storage-server.js';
import { objectStoragePreviewWriter } from '#api/projects/project-preview-store.js';

/**
 * Wires tau-storage from its parsed configuration (DC1): the private-tier
 * store, the git worker, the receipt channel and the HTTP handler. The entry
 * (`storage-worker.ts`) calls it with the process environment; the suites and
 * the end-to-end tier call it in-process with a port of 0.
 */

/** A running tau-storage. */
export type StorageApp = {
  readonly server: Server;
  readonly service: StorageGitService;
  readonly shutdown: ShutdownService;
  /** `http://127.0.0.1:<port>`. */
  readonly url: string;
  /** Stops accepting, lets in-flight requests and post-reply work finish (up to `graceMilliseconds`), then closes. */
  close(graceMilliseconds?: number): Promise<void>;
};

/**
 * Starts tau-storage.
 *
 * @param args - The configuration, the host to bind, and for tests a store and metrics in place of the real ones.
 * @returns The running app.
 */
export const startStorageApp = async (args: {
  readonly environment: StorageEnvironment;
  readonly host?: string;
  readonly store?: RepositoryStore;
  readonly metrics?: MetricsService;
}): Promise<StorageApp> => {
  const { environment } = args;
  const logger = new Logger('StorageWorker');
  const metrics = args.metrics ?? new MetricsService();
  const shutdown = new ShutdownService();
  /* The driver reads only its TAU_S3_* keys, which this schema carries; the
     cast is to the API's wider schema the constructor is typed against. */
  const objects = new ObjectStorageService(
    new ConfigService(environment) as unknown as ConfigService<Environment, true>,
    undefined,
    metrics,
  );
  const store = args.store ?? new S3RepositoryStore(objects);
  const service = new StorageGitService({
    store,
    shutdown,
    metrics,
    packCacheFraction: environment.TAU_STORAGE_PACK_CACHE_FRACTION,
    previews: objectStoragePreviewWriter(objects),
    receipts: createReceiptChannel({
      key: parseSigningKey(environment.TAU_STORAGE_RECEIPT_SIGNING_KEY, 'TAU_STORAGE_RECEIPT_SIGNING_KEY'),
      receiptUrl: environment.TAU_STORAGE_RECEIPT_URL,
      logger,
    }),
  });
  service.slowBodyMinimumBytes = environment.TAU_STORAGE_SLOW_BODY_MINIMUM_BYTES;
  service.slowBodyWindowMilliseconds = environment.TAU_STORAGE_SLOW_BODY_WINDOW_SECONDS * 1000;
  const server = createServer(
    /* The keep-alive outlives the API's pool timeout, so the API never reuses a
       connection this side is closing (review S6); headers still arrive fast. */
    {
      requestTimeout: 0,
      keepAliveTimeout: storageKeepAliveTimeoutMilliseconds,
      headersTimeout: storageKeepAliveTimeoutMilliseconds + 1000,
    },
    createStorageRequestHandler({
      service,
      grantKeys: parsePublicKeys(environment.TAU_STORAGE_GRANT_PUBLIC_KEYS, 'TAU_STORAGE_GRANT_PUBLIC_KEYS'),
      metrics,
      logger,
      stopping: () => shutdown.signal.aborted,
      ...(environment.FLY_MACHINE_ID === undefined ? {} : { member: environment.FLY_MACHINE_ID }),
      ...(environment.TAU_STORAGE_MEMBERS_DNS === undefined
        ? {}
        : { members: dnsMembers(environment.TAU_STORAGE_MEMBERS_DNS) }),
      /* No git-lfs here by design. */
      gitVersion: gitVersionProbe(),
    }),
  );
  /* No host: Node binds the unspecified IPv6 address, dual-stack, where the
     kernel has IPv6 (Flycast reaches a Machine over its 6PN IPv6 address), and
     falls back to 0.0.0.0 where it has none. */
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    const listening = (): void => {
      server.off('error', reject);
      resolve();
    };
    if (args.host === undefined) {
      server.listen(environment.PORT, listening);
    } else {
      server.listen(environment.PORT, args.host, listening);
    }
  });
  const { port } = server.address() as AddressInfo;
  return {
    server,
    service,
    shutdown,
    url: `http://127.0.0.1:${String(port)}`,
    async close(graceMilliseconds = 100_000): Promise<void> {
      shutdown.stop();
      const closed = new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      server.closeIdleConnections();
      const deadline = Date.now() + graceMilliseconds;
      await Promise.race([
        closed,
        new Promise((resolve) => {
          setTimeout(resolve, graceMilliseconds).unref();
        }),
      ]);
      server.closeAllConnections();
      await shutdown.settled(deadline);
    },
  };
};
