import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { readProjectId } from '#machine-host.js';
import { projectManifestSchemaUrl, projectToManifest, serializeProjectManifest } from '@taucad/project-core';
import { openNodeProjectFileSystem, resolveNodeProjectIdentity } from '#project-identity.js';

const roots: string[] = [];
const originalConfig = process.env['TAU_CONFIG_DIR'];
afterEach(async () => {
  if (originalConfig === undefined) {
    delete process.env['TAU_CONFIG_DIR'];
  } else {
    process.env['TAU_CONFIG_DIR'] = originalConfig;
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});
const project = async (): Promise<string> => {
  const sandbox = await mkdtemp(join(tmpdir(), 'tau-project-identity-'));
  roots.push(sandbox);
  process.env['TAU_CONFIG_DIR'] = join(sandbox, 'config');
  const root = join(sandbox, 'project');
  await mkdir(root);
  return root;
};
const declaration = projectToManifest({
  name: 'Hand authored',
  description: '',
  tags: [],
  assets: { main: { entryPath: 'main.scad' } },
});
const preservedId = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const legacy = (): string =>
  JSON.stringify({ ...declaration, $schema: 'https://tau.new/schemas/tau-schema-v1.json', id: preservedId });

describe('native project identity', () => {
  it('should initialize an id-free declaration once and preserve its exact authored bytes', async () => {
    const root = await project();
    const bytes = serializeProjectManifest(declaration);
    await writeFile(join(root, 'tau.json'), bytes);
    const filesystem = new NodeFsProvider(root);
    expect(await readProjectId(filesystem)).toBeUndefined();
    const first = await resolveNodeProjectIdentity({ workspaceRoot: root });
    expect(await readProjectId(filesystem)).toBe(first);
    expect(first).toMatch(/^proj_[A-Za-z0-9]{21}$/u);
    expect(await resolveNodeProjectIdentity({ workspaceRoot: root })).toBe(first);
    expect(new Uint8Array(await readFile(join(root, 'tau.json')))).toEqual(bytes);
    expect(JSON.parse(await readFile(join(root, '.tau/project.json'), 'utf8'))).toEqual({
      version: 1,
      projectId: first,
    });
  });
  it('should converge concurrent first opens on one complete durable identity', async () => {
    const root = await project();
    await writeFile(join(root, 'tau.json'), serializeProjectManifest(declaration));
    const results = await Promise.all(
      Array.from({ length: 24 }, async () => resolveNodeProjectIdentity({ workspaceRoot: root })),
    );
    expect(new Set(results).size).toBe(1);
    expect(JSON.parse(await readFile(join(root, '.tau/project.json'), 'utf8')).projectId).toBe(results[0]);
  });
  it('should refuse a damaged existing identity without minting a replacement', async () => {
    const root = await project();
    const bytes = serializeProjectManifest(declaration);
    await writeFile(join(root, 'tau.json'), bytes);
    await mkdir(join(root, '.tau'));
    const damaged = JSON.stringify({ version: 2, projectId: preservedId });
    await writeFile(join(root, '.tau/project.json'), damaged);
    await expect(resolveNodeProjectIdentity({ workspaceRoot: root })).rejects.toThrow();
    expect(await readFile(join(root, '.tau/project.json'), 'utf8')).toBe(damaged);
    expect(new Uint8Array(await readFile(join(root, 'tau.json')))).toEqual(bytes);
  });
  it('should preserve a cloud identity while converting only the current legacy manifest', async () => {
    const root = await project();
    await writeFile(join(root, 'tau.json'), legacy());
    expect(await resolveNodeProjectIdentity({ workspaceRoot: root, projectId: preservedId })).toBe(preservedId);
    const manifest: unknown = JSON.parse(await readFile(join(root, 'tau.json'), 'utf8'));
    expect(manifest).toEqual({ ...declaration, $schema: projectManifestSchemaUrl });
    expect(manifest).not.toHaveProperty('id');
  });
  it('should refuse contradictory cloud evidence without changing the original declaration', async () => {
    const root = await project();
    await writeFile(join(root, 'tau.json'), legacy());
    await expect(
      resolveNodeProjectIdentity({ workspaceRoot: root, projectId: 'proj_BBBBBBBBBBBBBBBBBBBBB' }),
    ).rejects.toThrow('Project identity conflict');
    expect(await readFile(join(root, 'tau.json'), 'utf8')).toBe(legacy());
  });
  it('should preserve the original declaration when identity changes before checked replacement', async () => {
    const root = await project();
    await writeFile(join(root, 'tau.json'), legacy());
    const authority = await openNodeProjectFileSystem(root);
    const filesystem = authority.open(root);
    try {
      await expect(
        resolveNodeProjectIdentity({
          workspaceRoot: root,
          filesystem: {
            writeFileChecked: async (request) => {
              await writeFile(
                join(root, '.tau/project.json'),
                JSON.stringify({ version: 1, projectId: 'proj_BBBBBBBBBBBBBBBBBBBBB' }),
              );
              return filesystem.writeFileChecked(request);
            },
          },
        }),
      ).rejects.toThrow('changed during identity conversion');
      expect(await readFile(join(root, 'tau.json'), 'utf8')).toBe(legacy());
    } finally {
      await authority.close();
    }
  });
  it('should allow explicit empty-root admission without creating an authored manifest', async () => {
    const root = await project();
    expect(await resolveNodeProjectIdentity({ workspaceRoot: root })).toBeUndefined();
    const id = await resolveNodeProjectIdentity({ workspaceRoot: root, bootstrap: true });
    expect(id).toMatch(/^proj_[A-Za-z0-9]{21}$/u);
    expect(await readProjectId(new NodeFsProvider(root))).toBe(id);
    await expect(readFile(join(root, 'tau.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await resolveNodeProjectIdentity({ workspaceRoot: root })).toBeUndefined();
  });
});
