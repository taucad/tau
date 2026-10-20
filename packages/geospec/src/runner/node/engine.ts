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

/** The message napi-rs throws when no platform addon is installed, as opposed to an addon that fails to load. */
const absentAddon = 'Cannot find native binding.';

/**
 * Whether a load error, or an error a module loader wrapped it in, says no platform addon is installed.
 * @param error - The error the native entry's import threw.
 * @returns True only for napi-rs's absent-addon error.
 */
const isAbsentAddon = (error: unknown): boolean =>
  error instanceof Error && (error.message.startsWith(absentAddon) || isAbsentAddon(error.cause));

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
