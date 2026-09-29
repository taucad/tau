/** Isolated host adapter for one direct AP242 minimum query. @module */

import { createGeoSpecAssertionClient } from 'geospec/assertion-client';
import type { MinimumDistanceResult } from 'geospec/assertion-client';
import type { GeoSpecNativeModelEngine } from 'geospec/runner/native';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const header = { canonicalProfile: 'geospec-jcs-v1', protocolVersion: 3, registryVersion: 5 } as const;
const maxBytes = 64 * 1024 * 1024;
const maxMetadataBytes = 1024 * 1024;
const hashPattern = /^[0-9a-f]{64}$/u;

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Native AP242 response is malformed.');
  }
  return value as Record<string, unknown>;
};

const decode = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> =>
  record(JSON.parse(decoder.decode(bytes)) as unknown);

const request = (method: string, requestId: string, extra: Record<string, unknown> = {}): Uint8Array<ArrayBuffer> =>
  encoder.encode(JSON.stringify({ ...header, method, requestId, ...extra }));

const supportsMinimum = (engine: GeoSpecNativeModelEngine): boolean => {
  const envelope = decode(engine.processRequest(request('initialize', 'configuration')));
  const result = record(envelope['result']);
  if (envelope['requestId'] !== 'configuration' || result['canonicalProfile'] !== header.canonicalProfile ||
    result['protocolVersion'] !== header.protocolVersion || result['registryVersion'] !== header.registryVersion) {
    return false;
  }
  const advertised = result['capabilities'];
  if (!Array.isArray(advertised)) {
    return false;
  }
  const entries = advertised.filter((entry) => record(entry)['name'] === 'minimumDistance');
  return entries.length === 1 && entries.every((entry) => {
    const capability = record(entry);
    return capability['profile'] === 'geospec-minimum-distance-v1' &&
      capability['implementation'] === 'implemented' && capability['registryVersion'] === 5;
  });
};

const namedPath = (rows: unknown[], name: string): string | undefined => {
  let match: string | undefined;
  for (const value of rows) {
    const row = record(value);
    const { occurrencePath: path, instanceName } = row;
    if (typeof path !== 'string' || path.length === 0 ||
      !(typeof instanceName === 'string' || instanceName === null)) {
      throw new TypeError('Native AP242 occurrence metadata is malformed.');
    }
    if (instanceName === name) {
      if (match !== undefined) {
        return undefined;
      }
      match = path;
    }
  }
  return match;
};

const releaseSubject = (engine: GeoSpecNativeModelEngine, handle: Record<string, unknown>): void => {
  const release = record(decode(engine.releaseSubject(request('releaseSubject', 'ap242-minimum-release', {
    subjectHandle: handle,
  })))['result']);
  if (release['released'] !== true) {
    throw new TypeError('Native AP242 subject release was not confirmed.');
  }
};

/**
 * Query two display names against one direct Y-up AP242 export in a dedicated engine slot.
 * The caller owns and closes the slot; this adapter closes it early if admitted state cannot
 * be released after a malformed native response.
 * @param options - Isolated native engine, AP242 bytes and two displayed names.
 * @returns Complete canonical minimum or a typed refusal/interruption.
 * @internal
 */
export const queryDirectAp242MinimumDistance = async (options: {
  readonly engine: GeoSpecNativeModelEngine & { close(): void };
  readonly ap242Bytes: Uint8Array<ArrayBuffer>;
  readonly nameA: string;
  readonly nameB: string;
}): Promise<MinimumDistanceResult> => {
  const { engine, ap242Bytes, nameA, nameB } = options;
  if (!nameA || !nameB || nameA === nameB) {
    return { status: 'refused', code: 'invalid-selection', message: 'Select two distinct displayed AP242 occurrence names.' };
  }
  if (ap242Bytes.byteLength === 0 || ap242Bytes.byteLength > maxBytes) {
    return { status: 'refused', code: 'unsupported-evidence', message: 'The AP242 source exceeds the native input limit.' };
  }
  let admitted = false;
  let released = false;
  try {
    if (!supportsMinimum(engine)) {
      return { status: 'refused', code: 'unsupported-evidence', message: 'This native engine lacks complete AP242 minimum/witness support.' };
    }
    const admissionBytes = engine.ingestSubject(request('ingestSubject', 'ap242-minimum-admit', {
      format: 'step', frame: { coordinateSystem: 'y-up', sourceUnit: 'auto', outputUnit: 'mm' },
      ingestOptions: {}, primaryByteLength: ap242Bytes.byteLength, resources: [],
    }), ap242Bytes, []);
    admitted = true;
    if (admissionBytes.byteLength > maxMetadataBytes) {
      throw new TypeError('AP242 occurrence metadata exceeds one MiB.');
    }
    const subject = record(record(decode(admissionBytes)['result'])['subject']);
    const { subjectHash, occurrences: rows } = subject;
    if (typeof subjectHash !== 'string' || !hashPattern.test(subjectHash) || !Array.isArray(rows)) {
      throw new TypeError('Native AP242 admission omitted subject identity or occurrence paths.');
    }
    const descriptor = record(subject['descriptor']);
    const frame = record(descriptor['frame']);
    if (frame['coordinateSystem'] !== 'y-up' || frame['outputCoordinateSystem'] !== 'z-up' ||
      frame['outputUnit'] !== 'mm' || frame['uniformScale'] !== 1) {
      return { status: 'refused', code: 'unsupported-evidence', message: 'Native AP242 source units or frame are not verified.' };
    }
    const handle = record(record(decode(engine.subjectHandle(request('subjectHandle', 'ap242-minimum-handle', {
      subjectHash,
    })))['result'])['subjectHandle']);
    try {
      const pathA = namedPath(rows, nameA);
      const pathB = namedPath(rows, nameB);
      if (pathA === undefined || pathB === undefined || pathA === pathB) {
        return { status: 'refused', code: 'invalid-selection', message: 'Displayed names do not identify two unique AP242 occurrences.' };
      }
      return await createGeoSpecAssertionClient({ engine }).query({
        capability: 'minimumDistance', subject: { subjectHash },
        payload: { pair: [{ occurrencePath: pathA }, { occurrencePath: pathB }] },
      });
    } finally {
      releaseSubject(engine, handle);
      released = true;
    }
  } catch (error) {
    return { status: 'interrupted', code: 'engine-error', message: error instanceof Error ? error.message : 'AP242 minimum query failed.' };
  } finally {
    if (admitted && !released) {
      engine.close();
    }
  }
};
