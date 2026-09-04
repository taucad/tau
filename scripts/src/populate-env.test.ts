import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { populateEnv } from '#populate-env.js';

describe('populateEnv', () => {
  it('creates a missing env file without replacing an existing one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-env-'));
    const examplePath = join(directory, '.env.example');
    const envPath = join(directory, '.env');
    await writeFile(examplePath, 'VALUE=default\n');

    await populateEnv(examplePath, envPath);
    await writeFile(envPath, 'VALUE=custom\n');
    await populateEnv(examplePath, envPath);

    await expect(readFile(envPath, 'utf8')).resolves.toBe('VALUE=custom\n');
  });
});
