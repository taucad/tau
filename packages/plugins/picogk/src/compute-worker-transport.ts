import { randomUUID } from 'node:crypto';
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalizeComputeAction } from '@taucad/cache-core';
import type { KernelComputeCapability, ComputeScopeReceipt, ResidentCacheBinding } from '@taucad/runtime/kernel';
import { decodeStoredEnvelope } from '#compute-stored-envelope.js';
import { createCanonicalFragments, operationCodecs, readComputeManifest } from '#picogk-compute-contract.js';
import { createPicogkComputeReuse } from '#picogk-compute-reuse.js';
import type { ComputeAdapterOptions } from '#picogk-compute-reuse.js';

type ComputeTransportReceipt = ComputeScopeReceipt & {
  readonly omission: { readonly boundary: string; readonly reason: string } | undefined;
};
type ComputeWorkerJob = {
  readonly signal: AbortSignal;
  readonly request: ComputeAdapterOptions & {
    readonly generation: number;
    readonly producerCanonical: string;
    readonly environmentCanonical: string;
    readonly preloadManifest: string;
    readonly resultManifest: string;
  };
  readonly delivered: (path: string | undefined) => Promise<ComputeTransportReceipt>;
  readonly failed: () => Promise<ComputeTransportReceipt>;
};
type ComputeWorkerTransport = {
  readonly resident: ResidentCacheBinding;
  readonly dispose: () => void;
  readonly open: (input: {
    readonly compute: KernelComputeCapability;
    readonly sessionRoot: string;
    readonly signal: AbortSignal;
  }) => Promise<ComputeWorkerJob | undefined>;
};
/**
 * Private process bridge; its caller owns successful scene delivery and the session root.
 * @param options - Private codec or lifecycle input.
 * @returns The validated result or owned lifecycle receipt.
 * @internal
 */
export const createComputeWorkerTransport = (options: ComputeAdapterOptions): ComputeWorkerTransport => {
  const adapter = createPicogkComputeReuse(options);
  return {
    resident: adapter.resident,
    dispose: adapter.dispose,
    open: async (input: {
      readonly compute: KernelComputeCapability;
      readonly sessionRoot: string;
      readonly signal: AbortSignal;
    }): Promise<ComputeWorkerJob | undefined> => {
      const job = await adapter.openJob(input);
      if (!job) {
        return undefined;
      }
      let directory: string | undefined;
      try {
        const sessionRoot = await realpath(input.sessionRoot);
        job.signal.throwIfAborted();
        // A unique request directory remains inside the existing session artifact owner.
        directory = join(sessionRoot, `compute-${randomUUID()}`);
        await mkdir(directory);
        const fragments = createCanonicalFragments(options);
        const records = [];
        const written = new Set<string>();
        let preloadNative = 0;
        for (const entry of job.preload()) {
          job.signal.throwIfAborted();
          const family = operationCodecs[entry.action.operation as keyof typeof operationCodecs];
          const framed = decodeStoredEnvelope({
            bytes: entry.bytes,
            family,
            maximumEncoded: options.maxEncodedBytes,
            maximumNative: options.maxNativeBytes,
          });
          if (framed.nativeAllowance > options.maxNativeBytes - preloadNative) {
            continue;
          }
          preloadNative += framed.nativeAllowance;
          const filename = `${entry.contentDigest.slice(7)}.${family}`;
          if (!written.has(filename)) {
            // oxlint-disable-next-line no-await-in-loop -- Write preloads sequentially with bounded ownership and cancellation.
            await writeFile(join(directory, filename), entry.bytes, {
              flag: 'wx',
              signal: job.signal,
            });
            written.add(filename);
          }
          const { bytes, ...record } = entry;
          records.push({
            ...record,
            canonicalAction: canonicalizeComputeAction(entry.action),
            filename,
            size: bytes.byteLength,
            nativeBytes: framed.nativeAllowance,
            computeDuration: 0,
          });
        }
        const preloadManifest = join(directory, 'preload.json');
        await writeFile(
          preloadManifest,
          JSON.stringify({
            version: 1,
            generation: job.generation,
            producer: options.producer,
            environment: options.environment,
            ...fragments,
            records,
          }),
          { flag: 'wx', signal: job.signal },
        );
        job.signal.throwIfAborted();
        const context = {
          sessionRoot: directory,
          generation: job.generation,
          producer: options.producer,
          environment: options.environment,
          maxEncodedBytes: options.maxEncodedBytes,
          maxNativeBytes: options.maxNativeBytes,
          signal: job.signal,
        };
        // Prove the exact request bytes through the same confined reader used for results.
        await readComputeManifest({ context, path: preloadManifest });
        const ownedDirectory = directory;
        const finish = async (outcome: Parameters<typeof job.finish>[0]): Promise<ComputeTransportReceipt> => {
          const receipt = job.finish(outcome);
          try {
            await rm(ownedDirectory, { recursive: true, force: true });
            return { ...receipt, omission: undefined };
          } catch (error) {
            return {
              ...receipt,
              omission: {
                boundary: 'cleanup',
                reason: error instanceof Error ? error.message : String(error),
              },
            };
          }
        };
        return {
          signal: job.signal,
          request: {
            generation: job.generation,
            producer: options.producer,
            environment: options.environment,
            ...fragments,
            preloadManifest,
            resultManifest: join(ownedDirectory, 'result.json'),
            maxEncodedBytes: options.maxEncodedBytes,
            maxNativeBytes: options.maxNativeBytes,
            maxEntries: options.maxEntries,
          },
          /**
           * Called after the ordinary scene artifact has passed validation and delivery.
           * @internal
           * @param path - Private codec or lifecycle input.
           * @returns The validated result or owned lifecycle receipt.
           */
          delivered: async (path: string | undefined): Promise<ComputeTransportReceipt> => {
            try {
              job.signal.throwIfAborted();
              if (path === undefined) {
                return await finish('delivered');
              }
              if (path !== join(ownedDirectory, 'result.json')) {
                throw new TypeError('Foreign compute result manifest.');
              }
              const records = await readComputeManifest({ context, path });
              await job.acceptDelivered(records);
              job.signal.throwIfAborted();
              return await finish('delivered');
            } catch (error) {
              const receipt = await finish(job.signal.aborted ? 'cancelled' : 'failed');
              if (job.signal.aborted) {
                throw error;
              }
              return {
                ...receipt,
                omission: {
                  boundary: 'result',
                  reason: error instanceof Error ? error.message : String(error),
                },
              };
            }
          },
          failed: async () => finish(job.signal.aborted ? 'cancelled' : 'failed'),
        };
      } catch (error) {
        job.finish(job.signal.aborted ? 'cancelled' : 'failed');
        if (directory) {
          await rm(directory, { recursive: true, force: true }).catch(() => undefined);
        }
        throw error;
      }
    },
  };
};
