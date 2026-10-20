/** The GeoSpec engine for a Node host: the native addon when it loads, else the WASM build. @module */

import type * as NativeEngine from 'geospec-engine/node';
import type { GeoSpecNativeModelEngine } from '#model/native-model-loader.js';

/**
 * Which build of `geospec-engine` a Node engine runs on.
 *
 * @public
 */
export type GeoSpecEngineBinding = 'napi' | 'wasm';

/**
 * Options for {@link createNodeGeoSpecEngine}.
 *
 * @public
 */
export type CreateNodeGeoSpecEngineOptions = {
  /** Caller-inclusive CPU permits for the native addon; the WASM build is single-threaded and ignores them. */
  readonly executionPermits?: number;
};

/**
 * An engine and the build it runs on.
 *
 * @public
 */
export type NodeGeoSpecEngine = {
  readonly engine: GeoSpecNativeModelEngine & { close(): void };
  readonly binding: GeoSpecEngineBinding;
};

/** The message napi-rs throws when no candidate binding loaded, whether absent or broken. */
const noBinding = 'Cannot find native binding.';

/** A candidate the napi-rs loader tried that is not installed, or a platform it has no candidate for. */
const absentCandidate =
  /^(?:Cannot find module '(?:\.\/geospec-engine\.|geospec-engine-)|Unsupported architecture on )/u;

/**
 * The messages of an error and its causes, outermost first.
 * @param error - The error to walk.
 * @returns One message per error in the chain.
 */
const causeMessages = (error: unknown): string[] =>
  error instanceof Error ? [error.message, ...causeMessages(error.cause)] : [];

/**
 * Whether a load error, or an error a module loader wrapped it in, says no platform addon is installed. napi-rs
 * throws the same message for an installed addon that fails to load, so every candidate in its cause chain must be
 * missing rather than broken.
 * @param error - The error the native entry's import threw.
 * @returns True only when no candidate binding is installed.
 */
const isAbsentAddon = (error: unknown): boolean => {
  const messages = causeMessages(error);
  const outer = messages.findIndex((message) => message.startsWith(noBinding));
  const candidates = messages.slice(outer + 1);
  return outer !== -1 && candidates.length > 0 && candidates.every((message) => absentCandidate.test(message));
};

/**
 * Create a GeoSpec engine for this process: the `geospec-engine` native addon when this platform has one, else its
 * WASM build. Only an absent addon selects WASM; an addon that is installed but broken throws.
 *
 * @param options - CPU permits for the native addon.
 * @returns The engine and its binding.
 * @throws Error when the native addon is installed but cannot load, or the permits are invalid.
 * @public
 */
export const createNodeGeoSpecEngine = async (
  options: CreateNodeGeoSpecEngineOptions = {},
): Promise<NodeGeoSpecEngine> => {
  let native: typeof NativeEngine;
  try {
    native = await import('geospec-engine/node');
  } catch (error) {
    if (!isAbsentAddon(error)) {
      throw error;
    }
    const wasm = await import('geospec-engine/wasm');
    await wasm.initialize();
    return { engine: new wasm.Engine(), binding: 'wasm' };
  }
  return { engine: new native.Engine(undefined, options.executionPermits), binding: 'napi' };
};
