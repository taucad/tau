/**
 * Pool wire protocol (R3): messages between the pool host and its workers.
 * All payloads are structured-clone-safe; results are sanitized by
 * `transport.ts` before posting. One shard = one `(file, testNamePattern?)`
 * work unit executed by the worker's serial engine.
 */

import type { GeoSpecRunResult } from '#runner/types.js';

/** One schedulable work unit. */
export type GeoSpecPoolShard = {
  /** Stable shard id, unique within one pool run. */
  id: number;
  /** GeoSpec file this shard executes. */
  file: string;
  /** Exact-test pattern for split shards (R3: `(file, testNamePattern)` work units). */
  testNamePattern?: string;
};

/** Host → worker messages. */
export type GeoSpecPoolHostMessage =
  | {
      type: 'run-shard';
      shard: GeoSpecPoolShard;
      testNamePattern?: string;
      testTimeout?: number;
      matcherWallBackstop?: number;
      forensic?: boolean;
    }
  | {
      /** List-only collection pass: register tests, run no bodies (R3 splitting). */
      type: 'list-tests';
      shardId: number;
      file: string;
      testTimeout?: number;
      matcherWallBackstop?: number;
      forensic?: boolean;
    }
  | { type: 'shutdown' };

/** Worker → host messages. */
export type GeoSpecPoolWorkerMessage =
  | { type: 'ready' }
  | { type: 'file-start'; shardId: number; file: string }
  | {
      type: 'forensic';
      shardId: number;
      name: string;
      value: number;
      unit: 'milliseconds' | 'count';
    }
  | { type: 'tests-listed'; shardId: number; file: string; names: string[] }
  | { type: 'list-error'; shardId: number; file: string; message: string }
  | {
      type: 'shard-complete';
      shardId: number;
      file: string;
      result: GeoSpecRunResult;
      durationMs: number;
      primaryLoadKey?: string;
      /** Worker-isolate resident memory at completion (heap + external), bytes. */
      workerMemoryBytes?: number;
    }
  | { type: 'shard-error'; shardId: number; file: string; message: string };

/** Minimal worker handle the host-agnostic pool drives (Node or Web Worker). */
export type GeoSpecPoolWorkerHandle = {
  postMessage(message: GeoSpecPoolHostMessage): void;
  onMessage(listener: (message: GeoSpecPoolWorkerMessage) => void): void;
  onExit(listener: (details: { unexpected: boolean; message?: string }) => void): void;
  /** Hard-stop the worker thread (R11 watchdog primitive). */
  terminate(): Promise<void> | void;
};
