import { assertGeoSpecJsonValue } from '#engine/protocol.js';
import type { GeoSpecConfig, GeoSpecTauProjectDescriptor } from '#config/types.js';
import type { JSONValue } from '@taucad/runtime/types';

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
};

const jsonObject = (value: unknown, label: string): Record<string, JSONValue> => {
  const result = object(value, label);
  assertGeoSpecJsonValue(result);
  return result as Record<string, JSONValue>;
};

const descriptor = (value: unknown): GeoSpecTauProjectDescriptor => {
  const input = object(value, 'GeoSpec Tau descriptor');
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !['kind', 'manifestPath', 'manifest', 'format', 'parameters'].includes(key)) {
      throw new TypeError(`Unsupported GeoSpec Tau descriptor field '${String(key)}'.`);
    }
  }
  const { kind, manifestPath, manifest, format, parameters } = input;
  if (kind !== 'tau-project') {
    throw new TypeError("GeoSpec Tau descriptor kind must be 'tau-project'.");
  }
  if (
    typeof manifestPath !== 'string' ||
    manifestPath.length === 0 ||
    manifestPath.length > 2048 ||
    manifestPath.includes('\0') ||
    manifestPath.includes('\\') ||
    manifestPath.startsWith('/') ||
    manifestPath.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new TypeError('GeoSpec manifestPath must be a normalized project-relative POSIX path.');
  }
  if (format !== 'step' && format !== 'glb') {
    throw new TypeError("GeoSpec Tau descriptor format must be 'step' or 'glb'.");
  }
  return {
    kind,
    manifestPath,
    manifest: jsonObject(manifest, 'GeoSpec manifest'),
    format,
    ...(parameters === undefined ? {} : { parameters: jsonObject(parameters, 'GeoSpec parameters') }),
  };
};

const validateConfig = (value: unknown): GeoSpecConfig => {
  const input = object(value, 'GeoSpec config');
  const result: GeoSpecConfig = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string') {
      throw new TypeError(`Unsupported GeoSpec config field '${String(key)}'.`);
    }
    const entry = input[key];
    switch (key) {
      case 'include':
      case 'exclude': {
        if (entry === undefined) {
          break;
        }
        if (!Array.isArray(entry)) {
          throw new TypeError(`GeoSpec ${key} must be an array of strings.`);
        }
        const items = [...(entry as unknown[])];
        if (!items.every((item): item is string => typeof item === 'string')) {
          throw new TypeError(`GeoSpec ${key} must be an array of strings.`);
        }
        result[key] = items;
        break;
      }
      case 'testNamePattern':
      case 'cacheDirectory': {
        if (entry === undefined) {
          break;
        }
        if (typeof entry !== 'string') {
          throw new TypeError(`GeoSpec ${key} must be a string.`);
        }
        result[key] = entry;
        break;
      }
      case 'testTimeout':
      case 'matcherWallBackstop': {
        if (entry === undefined) {
          break;
        }
        if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) {
          throw new TypeError(`GeoSpec ${key} must be positive finite milliseconds.`);
        }
        result[key] = entry;
        break;
      }
      case 'bail':
      case 'forensic':
      case 'cache': {
        if (entry === undefined) {
          break;
        }
        if (typeof entry !== 'boolean') {
          throw new TypeError(`GeoSpec ${key} must be a boolean.`);
        }
        result[key] = entry;
        break;
      }
      case 'subjects': {
        if (entry === undefined) {
          break;
        }
        const subjects = object(entry, 'GeoSpec subjects');
        result.subjects = Object.fromEntries(
          Reflect.ownKeys(subjects).map((name) => {
            if (typeof name !== 'string') {
              throw new TypeError('GeoSpec subjects keys must be strings.');
            }
            return [name, descriptor(subjects[name])];
          }),
        );
        break;
      }
      default: {
        throw new TypeError(`Unsupported GeoSpec config field '${key}'.`);
      }
    }
  }
  return result;
};

/**
 * Validate both data sources and apply defined whole-field overrides.
 * @internal
 * @param config - Imported default configuration object.
 * @param overrides - Caller-supplied option fields.
 * @returns Fresh option fields without applying runner defaults.
 */
export const resolveGeoSpecConfig = (config: unknown, overrides: unknown = {}): GeoSpecConfig => ({
  ...validateConfig(config),
  ...validateConfig(overrides),
});
