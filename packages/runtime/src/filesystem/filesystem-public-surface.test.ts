/**
 * Phase 5 / R16 — `@taucad/runtime/filesystem` public surface.
 *
 * The filesystem barrel must expose ONLY the consumer-facing opaque
 * `RuntimeFileSystem` value and the bundled `fromX` factories. Generic
 * bridge primitives live in `@taucad/rpc/bridge`, while filesystem bridge
 * adapters live in `@taucad/fs-bridge`, so the runtime public FS surface
 * stays opaque.
 *
 * This test pins the surface — it MUST fail if a bridge primitive ever
 * leaks back onto the public filesystem barrel.
 */

import { describe, it, expect } from 'vitest';
import * as fsBarrel from '#filesystem/index.js';

const forbiddenNames = [
  'createBridgeServer',
  'createBridgePort',
  'createBridgeCall',
  'createBridgeProxy',
  'catchMessages',
  'extractTransferables',
  'exposeFileSystem',
  'createFileSystemBridge',
  'openFileSystemBridge',
  'createFileSystemBridgeProxy',
  'filesystemBridgeConnectMessageType',
  'waitForWorkerReady',
  'workerReadyMessageType',
] as const;

describe('@taucad/runtime/filesystem public surface (R16)', () => {
  it.each(forbiddenNames)('should not export bridge primitive %s', (name) => {
    expect((fsBarrel as Record<string, unknown>)[name]).toBeUndefined();
  });
});
