/** Runtime-only engine registry kept below every public host facade. @module */

import type { GeometryDiagnostic } from '#mesh/types.js';
import { geoSpecEngineProtocolVersion } from '#engine/protocol.js';
import type { GeoSpecEngineProtocol } from '#engine/protocol.js';

/** Engine implementation shape without facade-specific host types. */
export type GeoSpecEngineRegistryImplementation = {
  readonly protocolVersion: number;
  readonly engine: string;
  readonly version: string;
  readonly protocol: GeoSpecEngineProtocol;
  readonly host?: Readonly<Record<string, unknown>>;
};

/** Serializable registered-engine description. */
export type GeoSpecEngineRegistryDescriptor = {
  readonly protocolVersion: number;
  readonly engine: string;
  readonly version: string;
  readonly capabilities: readonly string[];
};

export const geoSpecEngineUnavailableCode = 'GEOSPEC_ENGINE_UNAVAILABLE';
export const geoSpecEngineGlobalKey = '__GEOSPEC_ENGINE__';

const geospecGlobal = globalThis as typeof globalThis & Record<string, unknown>;

export const geoSpecEngineUnavailableDiagnostic = (capability: string): GeometryDiagnostic => ({
  code: geoSpecEngineUnavailableCode,
  severity: 'error',
  message: `GeoSpec cannot run '${capability}': no GeoSpec engine is registered.`,
  suggestion:
    "Install @taucad/geospec-engine and import '@taucad/geospec-engine/register' once at startup, or register a custom engine with registerGeoSpecEngine().",
  details: { capability, protocolVersion: geoSpecEngineProtocolVersion },
});

/**
 *
 */
export class GeoSpecEngineUnavailableError extends Error {
  public readonly code = geoSpecEngineUnavailableCode;
  public readonly diagnostics: readonly GeometryDiagnostic[];

  public constructor(capability: string) {
    const diagnostic = geoSpecEngineUnavailableDiagnostic(capability);
    super(diagnostic.message);
    this.name = 'GeoSpecEngineUnavailableError';
    this.diagnostics = Object.freeze([diagnostic]);
  }
}

export const registerGeoSpecEngineImplementation = (implementation: GeoSpecEngineRegistryImplementation): void => {
  if (implementation.protocolVersion !== geoSpecEngineProtocolVersion) {
    throw new GeoSpecEngineUnavailableError(
      `${implementation.engine}@${implementation.version} (protocol v${implementation.protocolVersion}, expected v${geoSpecEngineProtocolVersion})`,
    );
  }
  const initialized = implementation.protocol.initialize({
    protocolVersion: geoSpecEngineProtocolVersion,
    client: { name: 'geospec', version: '0.0.1' },
  });
  if (initialized.protocolVersion !== geoSpecEngineProtocolVersion) {
    throw new GeoSpecEngineUnavailableError(
      `${initialized.engine.name}@${initialized.engine.version} (initialized protocol v${initialized.protocolVersion}, expected v${geoSpecEngineProtocolVersion})`,
    );
  }
  geospecGlobal[geoSpecEngineGlobalKey] = implementation;
};

export const clearGeoSpecEngine = (): void => {
  Reflect.deleteProperty(geospecGlobal, geoSpecEngineGlobalKey);
};

export const getGeoSpecEngineImplementation = (): GeoSpecEngineRegistryImplementation | undefined =>
  geospecGlobal[geoSpecEngineGlobalKey] as GeoSpecEngineRegistryImplementation | undefined;

export const getGeoSpecEngineProtocol = (): GeoSpecEngineProtocol | undefined =>
  getGeoSpecEngineImplementation()?.protocol;

export const describeGeoSpecEngine = (): GeoSpecEngineRegistryDescriptor | undefined => {
  const engine = getGeoSpecEngineImplementation();
  if (!engine) {
    return undefined;
  }
  const initialized = engine.protocol.initialize({
    protocolVersion: geoSpecEngineProtocolVersion,
    client: { name: 'geospec', version: '0.0.1' },
  });
  return {
    protocolVersion: initialized.protocolVersion,
    engine: initialized.engine.name,
    version: initialized.engine.version,
    capabilities: initialized.capabilities.map((capability) => capability.name),
  };
};

export const getRegisteredGeoSpecHostBinding = <Binding>(capability: string): Binding | undefined => {
  const host = getGeoSpecEngineImplementation()?.host;
  return host === undefined ? undefined : (Reflect.get(host, capability) as Binding | undefined);
};

export const requireRegisteredGeoSpecHostBinding = <Binding>(capability: string): Binding => {
  const implementation = getRegisteredGeoSpecHostBinding<Binding>(capability);
  if (implementation === undefined) {
    throw new GeoSpecEngineUnavailableError(capability);
  }
  return implementation;
};
