import { cloneBoundedJson } from '#configuration/bounded-json.js';
import { protocolVersion } from '#types/protocol-header.types.js';

const manifestLimits = {
  code: 'HOST_MANIFEST',
  maximumDepth: 12,
  maximumNodes: 2048,
  maximumCharacters: 65_536,
} as const;

const knownRoles = ['cad', 'jobs', 'machines', 'agent'] as const;

/** Host services with an initial protocol owned by the runtime SDK. @public */
export type HostCapabilityRole = (typeof knownRoles)[number];

/** Local route or explicitly brokered port advertised for one host service. @public */
export type HostCapabilityEndpoint =
  | Readonly<{ type: 'route'; path: string }>
  | Readonly<{ type: 'port'; name: string }>;

/** Versioned service advertisement. `granted` is descriptive, never authorization. @public */
export type HostCapabilityDescriptor = Readonly<{
  endpoint: HostCapabilityEndpoint;
  granted: boolean;
}> &
  (
    | Readonly<{ kind: 'cad'; protocolVersion: typeof protocolVersion }>
    | Readonly<{ kind: Exclude<HostCapabilityRole, 'cad'>; protocolVersion: 1 }>
  );

/** Bounded, re-serializable manifest-v2 wire value. @public */
export type HostManifestV2 = Readonly<{
  v: 2;
  hostId: string;
  capabilities: ReadonlyArray<HostCapabilityDescriptor | Readonly<Record<string, unknown>>>;
}>;

/** Parsed manifest with known and inert-unknown projections over one canonical wire value. @public */
export type AdmittedHostManifestV2 = Readonly<{
  manifest: HostManifestV2;
  knownCapabilities: readonly HostCapabilityDescriptor[];
  unknownCapabilities: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const deepFreeze = <Value>(value: Value): Value => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
};

const assertOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>, context: string): void => {
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new TypeError(`${context} contains unsupported key ${unexpected}`);
  }
};

const parseEndpoint = (value: unknown): HostCapabilityEndpoint => {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    throw new TypeError('INVALID_HOST_CAPABILITY_ENDPOINT');
  }
  if (value['type'] === 'route') {
    assertOnlyKeys(value, new Set(['type', 'path']), 'route endpoint');
    const { path } = value;
    if (
      typeof path !== 'string' ||
      path.length > 256 ||
      !/^\/[a-z][a-z0-9-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/u.test(path) ||
      path.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      throw new TypeError('INVALID_HOST_CAPABILITY_ROUTE');
    }
    return Object.freeze({ type: 'route', path });
  }
  if (value['type'] === 'port') {
    assertOnlyKeys(value, new Set(['type', 'name']), 'port endpoint');
    const { name } = value;
    if (typeof name !== 'string' || name.length > 64 || !/^[a-z][a-z0-9-]*$/u.test(name)) {
      throw new TypeError('INVALID_HOST_CAPABILITY_PORT');
    }
    return Object.freeze({ type: 'port', name });
  }
  throw new TypeError('INVALID_HOST_CAPABILITY_ENDPOINT');
};

/**
 * Parse a bounded host manifest without granting or contacting any advertised service.
 *
 * The `granted` field is an unauthenticated report. MC0B admission must bind an
 * authenticated host, workspace and epoch before it can authorize a route.
 *
 * @param input - Untrusted JSON-compatible manifest candidate.
 * @returns A frozen known-role projection plus inert unknown records.
 * @public
 */
export const parseHostManifest = (input: unknown): AdmittedHostManifestV2 => {
  const cloned = cloneBoundedJson(input, manifestLimits);
  if (!isRecord(cloned)) {
    throw new TypeError('INVALID_HOST_MANIFEST');
  }
  assertOnlyKeys(cloned, new Set(['v', 'hostId', 'capabilities']), 'host manifest');
  if (cloned['v'] !== 2) {
    throw new TypeError('UNSUPPORTED_HOST_MANIFEST_VERSION');
  }
  const { hostId } = cloned;
  if (typeof hostId !== 'string' || hostId.length === 0 || hostId.length > 128 || !hostId.isWellFormed()) {
    throw new TypeError('INVALID_HOST_ID');
  }
  const candidates = cloned['capabilities'];
  if (!Array.isArray(candidates) || candidates.length > 64) {
    throw new TypeError('INVALID_HOST_CAPABILITIES');
  }
  const capabilities: HostCapabilityDescriptor[] = [];
  const unknownCapabilities: Array<Readonly<Record<string, unknown>>> = [];
  const wireCapabilities: Array<Readonly<Record<string, unknown>>> = [];
  const observedRoles = new Set<HostCapabilityRole>();
  for (const candidate of candidates) {
    if (!isRecord(candidate) || typeof candidate['kind'] !== 'string') {
      throw new TypeError('INVALID_HOST_CAPABILITY');
    }
    if (!knownRoles.includes(candidate['kind'] as HostCapabilityRole)) {
      const unknown = deepFreeze(candidate);
      unknownCapabilities.push(unknown);
      wireCapabilities.push(unknown);
      continue;
    }
    const kind = candidate['kind'] as HostCapabilityRole;
    assertOnlyKeys(candidate, new Set(['kind', 'protocolVersion', 'endpoint', 'granted']), `host capability ${kind}`);
    if (observedRoles.has(kind)) {
      throw new TypeError(`DUPLICATE_HOST_CAPABILITY_ROLE:${kind}`);
    }
    const protocol = kind === 'cad' ? ({ kind, protocolVersion } as const) : ({ kind, protocolVersion: 1 } as const);
    if (candidate['protocolVersion'] !== protocol.protocolVersion) {
      throw new TypeError(`UNSUPPORTED_HOST_CAPABILITY_PROTOCOL:${kind}`);
    }
    if (typeof candidate['granted'] !== 'boolean') {
      throw new TypeError(`INVALID_HOST_CAPABILITY_GRANT:${kind}`);
    }
    observedRoles.add(kind);
    const known = Object.freeze({
      ...protocol,
      endpoint: parseEndpoint(candidate['endpoint']),
      granted: candidate['granted'],
    });
    capabilities.push(known);
    wireCapabilities.push(known);
  }
  return Object.freeze({
    manifest: Object.freeze({ v: 2, hostId, capabilities: Object.freeze(wireCapabilities) }),
    knownCapabilities: Object.freeze(capabilities),
    unknownCapabilities: Object.freeze(unknownCapabilities),
  });
};
