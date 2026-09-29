import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const isInt32 = (value: number): boolean => Number.isInteger(value) && value >= -(2 ** 31) && value < 2 ** 31;

/**
 * FM-R8: TLC's JSON reader refuses `null` and corrupts floats and 64-bit integers (W1 probe), so a
 * validated copy carries `null` as `"null"` and every number that is not a 32-bit integer as a string.
 */
export const sanitizeValue = (value: unknown): unknown => {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number') {
    return isInt32(value) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
  }
  return value;
};

/** Writes a sanitized NDJSON copy of `source` to `destination`; blank lines are dropped. */
export const sanitizeLog = (source: string, destination: string): void => {
  const lines = readFileSync(source, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.stringify(sanitizeValue(JSON.parse(line))));
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, `${lines.join('\n')}\n`);
};
