import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const machineDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeDirectory = join(machineDirectory, '..');
const productionFiles = [
  join(machineDirectory, 'index.ts'),
  join(machineDirectory, 'machine.ts'),
  join(machineDirectory, 'machine-client.ts'),
  join(machineDirectory, 'machine-channel.ts'),
  join(machineDirectory, 'machine-directory.ts'),
  join(runtimeDirectory, 'host/node.ts'),
  join(runtimeDirectory, 'host/node-machine-event-log.ts'),
] as const;

describe('machines jobs boundary', () => {
  it('keeps every machine runtime and Node authority source independent of jobs modules', () => {
    for (const path of productionFiles) {
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/(?:from|import\()\s*['"][^'"]*jobs(?:\/|['"])/u);
    }
  });
});
