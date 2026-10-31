// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import { checkKclBodyNames } from '#testing/kcl-body-names.test-utils.js';
import type { KernelFileSystem } from '@taucad/runtime/kernel';

// Programs whose body names were first checked by hand against the Zoo engine: aliases, booleans, patterns,
// concentric and coincident bodies, inches, and a planetary gearbox (without its 54-tooth ring cut, which Zoo times
// out on).
const directory = fileURLToPath(new URL('testing/fixtures/kcl-body-names', import.meta.url));
const programs = readdirSync(directory).filter((file) => file.endsWith('.kcl'));
const zooApiKey = process.env['ZOO_API_KEY'];

const runNames = async (file: string, live: boolean): Promise<string[]> => {
  const code = readFileSync(`${directory}/${file}`, 'utf8');
  const utils = new KclUtilities({
    baseUrl: live ? 'wss://api.zoo.dev/ws/modeling/commands' : 'ws://offline',
    mode: live ? 'online' : 'offline',
    ...(live && { token: zooApiKey }),
    fileSystemManager: new FileSystemManager({
      readFile: async () => new TextEncoder().encode(code),
      exists: async () => true,
      readdir: async () => ['main.kcl'],
    } as unknown as KernelFileSystem),
  });
  try {
    if (live) {
      await utils.initializeWasm();
    }
    await utils.initializeEngine();
    const { program } = await utils.parseKcl(code);
    const { variables } = await utils.executeProgram(program, 'main.kcl');
    return await checkKclBodyNames(utils, variables, live ? 'mass' : 'node-ids');
  } finally {
    await utils.cleanup();
  }
};

describe('KCL body names', () => {
  it.each(programs)('offline: %s', { timeout: 120_000 }, async (file) => {
    expect(await runNames(file, false)).toEqual([]);
  });

  // Zoo's export order and box padding are not a documented contract; run with ZOO_API_KEY to check them.
  it.skipIf(!zooApiKey).each(programs)('Zoo engine: %s', { timeout: 300_000 }, async (file) => {
    expect(await runNames(file, true)).toEqual([]);
  });
});
