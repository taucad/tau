/**
 * Worker-side Message Dispatcher
 *
 * Routes KernelCommand messages to the appropriate KernelWorker methods
 * and sends KernelResponse messages back via the kernel worker MessagePort.
 *
 * Includes an unhandled-rejection trap around every awaited operation so
 * that errors thrown in fire-and-forget promises (e.g. Emscripten pthread
 * init) surface as structured error responses instead of silent hangs.
 */

import type { OnWorkerLog, LogLevel, LogOrigin } from '@taucad/types';
import type { HashedGeometryResult } from '#types/kernel.types.js';
import type { KernelCommand, KernelResponse, PerformanceEntryData } from '#types/kernel-protocol.types.js';
import type { KernelWorker } from '#framework/kernel-worker.js';
import type { KernelMessagePort } from '#framework/kernel-message-adapter.js';
import { createErrorTrap } from '#framework/worker-error-trap.js';

function extractGltfTransferables(result: HashedGeometryResult): Transferable[] {
  if (!result.success) {
    return [];
  }

  const buffers: Transferable[] = [];
  for (const geometry of result.data) {
    if (geometry.format === 'gltf') {
      buffers.push(geometry.content.buffer);
    }
  }

  return buffers;
}

/**
 * Create a message dispatcher that routes commands to a KernelWorker.
 * This is the worker-side counterpart to the KernelWorkerClient on the main thread.
 *
 * @param worker - The KernelWorker instance to dispatch commands to
 * @param port - The message port to receive commands from and send responses to
 */
export function createWorkerDispatcher(worker: KernelWorker, port: KernelMessagePort): void {
  const respond = (response: KernelResponse, transferables?: Transferable[]): void => {
    port.postMessage(response, transferables);
  };

  const pendingLogs: Array<{ level: LogLevel; message: string; origin?: LogOrigin; data?: unknown }> = [];
  let logFlushTimer: ReturnType<typeof setTimeout> | undefined;

  const flushLogs = (): void => {
    if (pendingLogs.length === 0) {
      return;
    }

    respond({ type: 'logBatch', entries: pendingLogs.splice(0) });
    logFlushTimer = undefined;
  };

  const onLog: OnWorkerLog = (log) => {
    pendingLogs.push({ level: log.level, message: log.message, origin: log.origin, data: log.data });
    logFlushTimer ??= setTimeout(flushLogs, 250);
  };

  worker.setTelemetrySend((entries: PerformanceEntryData[]) => {
    respond({ type: 'telemetry', entries });
  });

  port.onMessage(async (command: KernelCommand | KernelResponse) => {
    const message = command as KernelCommand;
    const requestId = 'requestId' in message ? message.requestId : '';

    const { promise: trapPromise, cleanup: cleanupTrap } = createErrorTrap();

    try {
      switch (message.type) {
        case 'initialize': {
          let fileSystemPort: MessagePort | undefined;
          if ('fileSystemPort' in message && message.fileSystemPort) {
            fileSystemPort = message.fileSystemPort;
          }

          await Promise.race([
            worker.initialize({
              callbacks: { onLog },
              transferables: { fileSystemPort },
              options: message.options,
              middlewareEntries: message.middlewareEntries,
            }),
            trapPromise,
          ]);

          if (message.bundlerEntries) {
            for (const entry of message.bundlerEntries) {
              // eslint-disable-next-line no-await-in-loop -- Sequential: bundlers must be loaded before use
              await Promise.race([worker.ensureLoadedBundler(entry), trapPromise]);
            }
          }

          respond({ type: 'initialized', requestId });
          break;
        }

        case 'render': {
          const result = await Promise.race([
            worker.render({
              file: message.file,
              parameters: message.params,
              onParametersResolved(parametersResult) {
                respond({ type: 'parametersResolved', requestId, result: parametersResult });
              },
              onProgress(phase) {
                respond({ type: 'progress', requestId, phase });
              },
              tessellation: message.tessellation,
            }),
            trapPromise,
          ]);
          const transferables = extractGltfTransferables(result);

          flushLogs();
          worker.flushTelemetry();
          respond({ type: 'geometryComputed', requestId, result }, transferables);
          break;
        }

        case 'fileChanged': {
          await Promise.race([worker.notifyFileChanged(message.paths), trapPromise]);
          break;
        }

        case 'configureMiddleware': {
          await Promise.race([worker.configureMiddleware(message.entries), trapPromise]);
          break;
        }

        case 'export': {
          const exportResult = await Promise.race([
            worker.exportGeometry(message.format, message.tessellation),
            trapPromise,
          ]);
          respond({ type: 'exported', requestId, result: exportResult });
          break;
        }

        case 'cancel': {
          break;
        }

        case 'cleanup': {
          if (logFlushTimer) {
            clearTimeout(logFlushTimer);
            logFlushTimer = undefined;
          }

          flushLogs();
          await Promise.race([worker.cleanup(), trapPromise]);
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      respond({
        type: 'error',
        requestId,
        issues: [{ message: errorMessage, type: 'runtime', severity: 'error' }],
      });
    } finally {
      cleanupTrap();
    }
  });
}
