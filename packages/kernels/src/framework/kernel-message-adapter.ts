/**
 * Isomorphic Message Adapter for Kernel Workers
 *
 * Provides a unified message interface for browser Web Workers and Node.js worker_threads,
 * Abstracts browser/Node.js worker context differences for the MessagePort protocol.
 */

import type { KernelCommand, KernelResponse } from '#types/kernel-protocol.types.js';
import { isWebWorker } from '#framework/environment.js';

/**
 * Unified message port interface for kernel worker communication.
 * Abstracts browser Worker and Node.js worker_threads differences.
 */
export type KernelMessagePort = {
  postMessage(message: KernelCommand | KernelResponse, transferables?: Transferable[]): void;
  onMessage(handler: (data: KernelCommand | KernelResponse) => void): void;
  close(): void;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Dynamic require for Node.js detection
function getNodeParentPort(): import('node:worker_threads').MessagePort | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, unicorn/prefer-module, @typescript-eslint/consistent-type-imports -- Dynamic require for Node.js detection
    const workerThreads = require('node:worker_threads') as typeof import('node:worker_threads');
    return workerThreads.parentPort ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Checks if we're running in a worker context (browser or Node.js).
 * Use this to guard dispatcher setup in worker files.
 */
export function isWorkerContext(): boolean {
  return isWebWorker() || getNodeParentPort() !== undefined;
}

/**
 * Get a unified message port for the current worker context.
 * Works in both browser Web Workers and Node.js worker_threads.
 *
 * @returns KernelMessagePort with unified send/receive interface
 * @throws Error if called outside a worker context
 */
export function getWorkerMessagePort(): KernelMessagePort {
  if (isWebWorker()) {
    return {
      postMessage(message, transferables) {
        self.postMessage(message, { transfer: transferables ?? [] });
      },
      onMessage(handler) {
        globalThis.addEventListener('message', (event: MessageEvent<KernelCommand | KernelResponse>) => {
          handler(event.data);
        });
      },
      close() {
        globalThis.close();
      },
    };
  }

  const parentPort = getNodeParentPort();
  if (parentPort) {
    return {
      postMessage(message, transferables) {
        // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Dynamic require for Node.js detection
        parentPort.postMessage(message, transferables as Array<import('node:worker_threads').Transferable> | undefined);
      },
      onMessage(handler) {
        parentPort.on('message', (data: KernelCommand | KernelResponse) => {
          handler(data);
        });
      },
      close() {
        parentPort.close();
      },
    };
  }

  throw new Error('getWorkerMessagePort() must be called from a worker context');
}
