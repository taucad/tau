/**
 * Phase 5 / R16 — `@taucad/runtime/filesystem` public surface.
 *
 * The filesystem barrel exposes the consumer-facing opaque
 * `RuntimeFileSystem`, bundled `fromX` factories, and the filesystem-specific
 * bridge adapters needed by external hosts. Generic bridge primitives remain
 * internal to the bundled RPC implementation.
 *
 * This test pins both sides of that boundary.
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
  'filesystemBridgeConnectMessageType',
  'waitForWorkerReady',
  'workerReadyMessageType',
  'createRuntimeFileSystem',
] as const;

const filesystemBridgeNames = [
  'exposeFileSystem',
  'createFileSystemBridge',
  'openFileSystemBridge',
  'createFileSystemBridgeProxy',
] as const;

describe('@taucad/runtime/filesystem public surface (R16)', () => {
  it.each(forbiddenNames)('should not export bridge primitive %s', (name) => {
    expect((fsBarrel as Record<string, unknown>)[name]).toBeUndefined();
  });

  it.each(filesystemBridgeNames)('should export filesystem bridge adapter %s', (name) => {
    expect((fsBarrel as Record<string, unknown>)[name]).toBeTypeOf('function');
  });
});
