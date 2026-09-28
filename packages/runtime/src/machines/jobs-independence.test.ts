import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const machineDirectory = dirname(fileURLToPath(import.meta.url));
const hostDirectory = join(machineDirectory, '..', 'host');
/** The production modules in `directory` whose names `pattern` matches; tests and fixtures are skipped. */
const productionModules = (directory: string, pattern: RegExp): string[] =>
  readdirSync(directory)
    .filter((name) => pattern.test(name) && !/\.(?:test|test-d|fixture)\.ts$/u.test(name))
    .map((name) => join(directory, name));
// Every machine runtime module, and the Node machine host with each module split out of it.
const productionFiles = [
  ...productionModules(machineDirectory, /\.ts$/u),
  ...productionModules(hostDirectory, /^node(?:-machine-[a-z-]+)?\.ts$/u),
];

describe('machines jobs boundary', () => {
  it('keeps every machine runtime and Node authority source independent of jobs modules', () => {
    // A pattern that stopped matching would pass vacuously, so the entry points must be among the files read.
    expect(productionFiles).toEqual(
      expect.arrayContaining([
        join(machineDirectory, 'machine.ts'),
        join(hostDirectory, 'node.ts'),
        join(hostDirectory, 'node-machine-operations.ts'),
      ]),
    );
    for (const path of productionFiles) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/(?:from|import\()\s*['"][^'"]*jobs(?:\/|['"])/u);
    }
  });
});
