/**
 * The project root a CLI verb evaluates a model in (S11 F2): one discovery for `tau check`, `tau export` and
 * `tau open`, so every verb agrees on where a model's imports resolve.
 *
 * @module
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * The project a model belongs to: the nearest folder at or above it holding a `tau.json`, else the model's own folder.
 *
 * @internal
 * @param inputPath - Absolute path of the model.
 * @returns The absolute project root.
 */
export const findProjectRoot = (inputPath: string): string => {
  for (let current = dirname(inputPath); ; current = dirname(current)) {
    if (existsSync(resolve(current, 'tau.json'))) {
      return current;
    }
    if (dirname(current) === current) {
      return dirname(inputPath);
    }
  }
};
