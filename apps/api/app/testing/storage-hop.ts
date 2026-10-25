import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { developmentPublicKeysJson, developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { parsePublicKeys, parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { ReplayGuard } from '#api/git/forwarding/contract/replay-guard.js';
import { StorageForwarder } from '#api/git/forwarding/storage-forwarder.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { StorageGitService } from '#api/git/worker/storage-git.service.js';
import type { ReceiptChannel } from '#api/git/worker/storage-git.service.js';
import { createStorageRequestHandler } from '#api/git/worker/storage-server.js';
import { loopbackReceiptChannel } from '#testing/loopback-executor.js';

/**
 * The real hop for a suite (DC1): tau-storage's request handler on a loopback
 * port over the suite's store, and the API's `StorageForwarder` pointed at it
 * under the development keys. Everything between the two is the deployed
 * code: grant minting and verification, the streamed body, the receipt
 * prefix, and refusals relayed as the worker decided them.
 */

/** A running hop. */
export type StorageHop = {
  readonly worker: StorageGitService;
  readonly forwarder: StorageForwarder;
  readonly url: string;
  readonly shutdown: ShutdownService;
  close(): Promise<void>;
};

/**
 * Starts a worker and a forwarder to it.
 *
 * @param args - The store the worker commits to, where posted receipts go, and optional metrics and replay guard.
 * @returns The hop.
 */
export const startStorageHop = async (args: {
  readonly store: RepositoryStore;
  readonly post?: (receipt: string) => Promise<unknown>;
  readonly receipts?: ReceiptChannel;
  readonly metrics?: MetricsService;
  readonly forwarderMetrics?: MetricsService;
  readonly replay?: ReplayGuard;
  readonly grantVersion?: number;
  readonly forwarderGrantVersion?: number;
}): Promise<StorageHop> => {
  const metrics = args.metrics ?? new MetricsService();
  const shutdown = new ShutdownService();
  const worker = new StorageGitService({
    store: args.store,
    shutdown,
    metrics,
    receipts: args.receipts ?? loopbackReceiptChannel(args.post),
  });
  /* A 1 TiB stand-in disk, so a reservation never meets the runner's free space. */
  worker.readLeaseDiskFreeBytes = async () => 1024 ** 4;
  const server = createServer(
    { requestTimeout: 0 },
    createStorageRequestHandler({
      service: worker,
      grantKeys: parsePublicKeys(developmentPublicKeysJson('grant'), 'grant'),
      metrics,
      logger: new Logger('StorageHop'),
      stopping: () => shutdown.signal.aborted,
      ...(args.grantVersion === undefined ? {} : { grantVersion: args.grantVersion }),
      ...(args.replay === undefined ? {} : { replay: args.replay }),
    }),
  );
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const forwarder = new StorageForwarder({
    urls: [url],
    key: parseSigningKey(developmentSigningKeyJson('grant'), 'grant'),
    metrics: args.forwarderMetrics ?? metrics,
    ...(args.forwarderGrantVersion === undefined ? {} : { grantVersion: args.forwarderGrantVersion }),
  });
  return {
    worker,
    forwarder,
    url,
    shutdown,
    async close() {
      forwarder.close();
      shutdown.stop();
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
      await shutdown.settled(Date.now() + 10_000);
    },
  };
};
