import { access, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readGeoSpecConfig } from '#config/index.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';

const project = async (files: Readonly<Record<string, string>>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'geospec-read-config-'));
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      await mkdir(join(root, name, '..'), { recursive: true });
      await writeFile(join(root, name), content);
    }),
  );
  return root;
};

const read = async (root: string) => readGeoSpecConfig({ filesystem: createNodeVmFileSystem(root), projectPath: '' });

describe('readGeoSpecConfig', () => {
  it('should report a project without a config as absent', async () => {
    expect(await read(await project({}))).toStrictEqual({ status: 'absent' });
  });

  it('should apply a defineConfig config that imports a project file', async () => {
    const root = await project({
      'geospec.config.ts': [
        "import { defineConfig } from 'geospec/config';",
        "import { timeout } from './shared/timeouts.ts';",
        "export default defineConfig({ include: ['cases/*.geospec.ts'], testTimeout: timeout, bail: true });",
      ].join('\n'),
      'shared/timeouts.ts': 'export const timeout = 4500;\n',
    });

    expect(await read(root)).toStrictEqual({
      status: 'applied',
      configPath: 'geospec.config.ts',
      options: { include: ['cases/*.geospec.ts'], testTimeout: 4500, bail: true },
    });
  });

  it('should not apply a config that imports a package, and write nothing into the project', async () => {
    const root = await project({
      'geospec.config.mjs': [
        "import { commandExporter } from 'geospec/model/node';",
        "export default { exporters: [commandExporter({ id: 'py', extensions: ['py'], command: ['python'], capabilities: { formats: ['step'] } })] };",
      ].join('\n'),
    });

    expect(await read(root)).toMatchObject({
      status: 'not-applied',
      configPath: 'geospec.config.mjs',
      reason: 'unresolved-import',
      message: expect.stringContaining("'geospec/model/node'") as string,
    });
    await expect(access(join(root, 'node_modules'))).rejects.toThrow();
  });

  it.each([
    { name: 'throws', source: "throw new Error('config exploded');", message: /config exploded/u },
    {
      name: 'has an unknown field',
      source: 'export default { cache: true };',
      message: /Unsupported GeoSpec config field 'cache'/u,
    },
    { name: 'imports a missing file', source: "import './missing.ts'; export default {};", message: /missing/u },
  ])('should report a config that $name as invalid', async ({ source, message }) => {
    const result = await read(await project({ 'geospec.config.js': source }));

    expect(result).toMatchObject({ status: 'not-applied', reason: 'invalid' });
    expect(result.status === 'not-applied' ? result.message : '').toMatch(message);
  });

  it('should refuse two configs instead of picking one', async () => {
    const result = await read(
      await project({ 'geospec.config.ts': 'export default {};', 'geospec.config.js': 'export default {};' }),
    );

    expect(result).toMatchObject({ status: 'not-applied', reason: 'invalid', message: /Multiple GeoSpec configs/u });
  });
});
