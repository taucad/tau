import type { GeoSpecConfig } from '#config/types.js';
import type { GeoSpecModelExporter } from '#model/types.js';

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

const exporter = (value: unknown, index: number): GeoSpecModelExporter => {
  const label = `GeoSpec exporters[${String(index)}]`;
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${label} must be a model exporter object.`);
  }
  const { id, extensions, capabilities, export: run } = value as Partial<Record<keyof GeoSpecModelExporter, unknown>>;
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError(`${label} must have a non-empty string id.`);
  }
  if (!Array.isArray(extensions) || !extensions.every((extension) => typeof extension === 'string')) {
    throw new TypeError(`GeoSpec exporter '${id}' extensions must be an array of strings.`);
  }
  if (
    capabilities === null ||
    typeof capabilities !== 'object' ||
    !Array.isArray((capabilities as { formats?: unknown }).formats)
  ) {
    throw new TypeError(`GeoSpec exporter '${id}' must declare capabilities with a formats array.`);
  }
  if (typeof run !== 'function') {
    throw new TypeError(`GeoSpec exporter '${id}' must have an export function.`);
  }
  return value as GeoSpecModelExporter;
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
      case 'testNamePattern': {
        if (entry === undefined) {
          break;
        }
        if (typeof entry !== 'string') {
          throw new TypeError(`GeoSpec ${key} must be a string.`);
        }
        result[key] = entry;
        break;
      }
      case 'testTimeout': {
        if (entry === undefined) {
          break;
        }
        if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0) {
          throw new TypeError(`GeoSpec ${key} must be positive finite milliseconds.`);
        }
        result[key] = entry;
        break;
      }
      case 'bail': {
        if (entry === undefined) {
          break;
        }
        if (typeof entry !== 'boolean') {
          throw new TypeError(`GeoSpec ${key} must be a boolean.`);
        }
        result[key] = entry;
        break;
      }
      case 'exporters': {
        if (entry === undefined) {
          break;
        }
        if (!Array.isArray(entry)) {
          throw new TypeError('GeoSpec exporters must be an array of model exporters.');
        }
        result.exporters = (entry as unknown[]).map((item, index) => exporter(item, index));
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
