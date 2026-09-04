/**
 * The substrate/engine seam.
 *
 * `geospec` is the Apache-2.0 matcher-API substrate: it owns the DSL, the
 * selector language, the diagnostics schema and every public entry point, but
 * it executes no geometry. An engine — `@taucad/geospec-engine` today, a
 * future out-of-process, native or GPU-cloud binary tomorrow — calls
 * {@link registerGeoSpecEngine} once at import time and supplies the bodies.
 *
 * The seam is the *TypeScript binding* of a language-neutral protocol
 * (charter DL13, split-doc D-S0): the invocation and descriptor types are
 * JSON-serializable and schema-versioned, capability discovery is
 * first-class, and no contract type carries a live handle. Engine-owned
 * native handles never appear here.
 *
 * With no engine registered every engine-backed entry point answers with the
 * `GEOSPEC_ENGINE_UNAVAILABLE` diagnostic — modelled on the established
 * `GEOSPEC_NATIVE_UNAVAILABLE` pattern — rather than crashing.
 *
 * @module
 */

import type { VmFileSystem } from '@taucad/esbuild/vm';
import type { AnalyzeMeshResult, LoadMeshOptions, LoadMeshResult } from '#mesh/load-mesh.js';
import type { GeometryDiagnostic, GeometrySubject } from '#mesh/types.js';
import type { CreateModelLoaderOptions, LoadModelOptions, ManagedGeoSpecModelLoader } from '#model/types.js';
import type { GeoSpecNodePoolRunnerOptions } from '#runner/node/node-pool-runner.js';
import type { GeoSpecNodeRunnerOptions } from '#runner/node/node-runner.js';
import type { GeoSpecPoolWorkerHostOptions } from '#runner/worker/pool-worker-host.js';
import type { GeoSpecRunner } from '#runner/worker/runner-types.js';
import type { GeoSpecWebPoolRunnerOptions } from '#runner/web/web-pool-runner.js';
import type { GeoSpecWebRunnerOptions } from '#runner/web/web-runner.js';
import type { LoadStepOptions } from '#step/types.js';
import type { GeoSpecEngineProtocol } from '#engine/protocol.js';
import {
  clearGeoSpecEngine as clearRegisteredGeoSpecEngine,
  describeGeoSpecEngine as describeRegisteredGeoSpecEngine,
  geoSpecEngineUnavailableDiagnostic as registeredGeoSpecEngineUnavailableDiagnostic,
  GeoSpecEngineUnavailableError as RegisteredGeoSpecEngineUnavailableError,
  getGeoSpecEngineImplementation,
  getGeoSpecEngineProtocol as getRegisteredGeoSpecEngineProtocol,
  getRegisteredGeoSpecHostBinding,
  registerGeoSpecEngineImplementation,
  requireRegisteredGeoSpecHostBinding,
} from '#engine/registry.js';
import type { GeoSpecEngineRegistryDescriptor, GeoSpecEngineRegistryImplementation } from '#engine/registry.js';

/** @public */
export const geoSpecEngineUnavailableCode = 'GEOSPEC_ENGINE_UNAVAILABLE';
/** @public */
export const geoSpecEngineGlobalKey = '__GEOSPEC_ENGINE__';
/** @public */
export const geoSpecEngineUnavailableDiagnostic = (capability: string): GeometryDiagnostic =>
  registeredGeoSpecEngineUnavailableDiagnostic(capability);
/* oxlint-disable no-redeclare -- The public type/value pair preserves the registry constructor identity. */
/** Registry error constructor, re-exported without changing its identity. @public */
export const GeoSpecEngineUnavailableError = RegisteredGeoSpecEngineUnavailableError; // eslint-disable-line @typescript-eslint/naming-convention -- Preserve the registry error's constructor identity.
/* oxlint-enable no-redeclare -- Resume normal declaration checks after the intentional type/value pair. */
/** @public */
export type GeoSpecEngineUnavailableError = RegisteredGeoSpecEngineUnavailableError;
/**
 * Diagnostic code answered by every engine-backed entry point while no engine
 * is registered.
 *
 * @public
 */
/**
 * Host-only bootstrap operations. These carry live runtime/filesystem/worker
 * objects by design and therefore are explicitly outside Contract B. Geometry
 * claims never use this map: they cross {@link GeoSpecEngineProtocol}.
 *
 * @public
 */
export type GeoSpecEngineHostBindings = {
  loadMesh(options: LoadMeshOptions): Promise<LoadMeshResult>;
  analyzeMesh(options: LoadMeshOptions): Promise<AnalyzeMeshResult>;
  loadStep(options: LoadStepOptions): Promise<GeometrySubject>;
  loadModel<Code extends Record<string, string> = Record<string, string>>(
    options: LoadModelOptions<Code>,
  ): Promise<GeometrySubject>;
  createModelLoader(options: CreateModelLoaderOptions): ManagedGeoSpecModelLoader;
  createGeoSpecNodeRunner(options: GeoSpecNodeRunnerOptions): GeoSpecRunner;
  createGeoSpecNodePoolRunner(options: GeoSpecNodePoolRunnerOptions): GeoSpecRunner;
  createGeoSpecWebRunner(options: GeoSpecWebRunnerOptions): GeoSpecRunner;
  createGeoSpecWebPoolRunner(options: GeoSpecWebPoolRunnerOptions): GeoSpecRunner;
  createNodeVmFileSystem(root: string): VmFileSystem;
  startGeoSpecPoolWorkerHost(options: GeoSpecPoolWorkerHostOptions): void;
  flushEvidenceStore(): Promise<void>;
};

/**
 * A capability name an engine build may advertise: a matcher name, or an
 * engine export name.
 *
 * @public
 */
export type GeoSpecEngineCapability = string;

/**
 * What an engine registers with the substrate.
 *
 * @public
 */
export type GeoSpecEngineImplementation = {
  /** Must equal {@link geoSpecEngineProtocolVersion}. */
  readonly protocolVersion: number;
  /** Engine identity, e.g. `'@taucad/geospec-engine'`. */
  readonly engine: string;
  /** Engine build version, recorded in provenance and cache keys. */
  readonly version: string;
  /** Contract-B transport binding used for every geometry claim. */
  readonly protocol: GeoSpecEngineProtocol;
  /** Optional in-process host bootstrap; never part of the wire contract. */
  readonly host?: Partial<GeoSpecEngineHostBindings>;
};

/**
 * Serializable description of the registered engine — the capability
 * discovery surface (D-S0: capability discovery is first-class, and it
 * generalizes the PE2 activation ladder).
 *
 * @public
 */
export type GeoSpecEngineDescriptor = GeoSpecEngineRegistryDescriptor;

/**
 * Global key holding the registered engine. A global (rather than a module
 * binding) so the substrate loaded through a bundler, a VM realm and the
 * engine's own resolution all observe one registration.
 *
 * @public
 */
/**
 * Register the engine that executes GeoSpec claims. Idempotent per engine:
 * registering again replaces the previous implementation.
 *
 * @param implementation - The engine's protocol implementation.
 * @throws GeoSpecEngineUnavailableError when the engine speaks a different
 * protocol version — an unusable engine must never register silently.
 * @public
 */
export const registerGeoSpecEngine = (implementation: GeoSpecEngineImplementation): void => {
  registerGeoSpecEngineImplementation(implementation as GeoSpecEngineRegistryImplementation);
};

/** Remove the registered engine. Test-support only. @public */
export const clearGeoSpecEngine = (): void => {
  clearRegisteredGeoSpecEngine();
};

/**
 * The registered engine, if any.
 *
 * @returns The engine implementation, or `undefined` when none is registered.
 * @public
 */
export const getGeoSpecEngine = (): GeoSpecEngineImplementation | undefined =>
  getGeoSpecEngineImplementation() as GeoSpecEngineImplementation | undefined;

/** The registered Contract-B binding, if any. @public */
export const getGeoSpecEngineProtocol = (): GeoSpecEngineProtocol | undefined => getRegisteredGeoSpecEngineProtocol();

/** Describe the registered engine and its advertised capabilities. @public */
export const describeGeoSpecEngine = (): GeoSpecEngineDescriptor | undefined => describeRegisteredGeoSpecEngine();

/**
 * Look up one engine export.
 *
 * @param capability - Export name.
 * @returns The engine's implementation, or `undefined`.
 * @public
 */
export const getGeoSpecEngineHostBinding = <Name extends keyof GeoSpecEngineHostBindings>(
  capability: Name,
): GeoSpecEngineHostBindings[Name] | undefined =>
  getRegisteredGeoSpecHostBinding<GeoSpecEngineHostBindings[Name]>(capability);

/**
 * Look up one engine export or fail with the engine-unavailable error. Used by
 * substrate entry points whose return type cannot carry a diagnostic.
 *
 * @param capability - Export name.
 * @returns The engine's implementation.
 * @throws GeoSpecEngineUnavailableError when no engine provides it.
 * @public
 */
export const requireGeoSpecEngineHostBinding = <Name extends keyof GeoSpecEngineHostBindings>(
  capability: Name,
): GeoSpecEngineHostBindings[Name] => requireRegisteredGeoSpecHostBinding<GeoSpecEngineHostBindings[Name]>(capability);
