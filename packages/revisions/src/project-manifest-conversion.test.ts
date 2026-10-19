import { WorkspaceFileService, ProviderRegistry, MountTable, ResourceQueue, ChangeEventBus } from '@taucad/filesystem';
import { serializeProjectIdentity } from '@taucad/project-core/identity';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertCheckedOutProjectManifest, validateLegacyProjectIdentity } from '#project-manifest-conversion.js';

const services: WorkspaceFileService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) {
    service.dispose();
  }
});
const createFilesystem = async () => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:conversion-test' } as const;
  const mountTable = new MountTable();
  mountTable.mount('/', await providerRegistry.getProvider(scope), { class: 'authored', ...scope });
  const service = new WorkspaceFileService({
    providerRegistry,
    mountTable,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
  });
  services.push(service);
  return service.createRootedFileSystem('/');
};

const projectId = 'proj_AAAAAAAAAAAAAAAAAAAAA';
const otherProjectId = 'proj_BBBBBBBBBBBBBBBBBBBBB';
const oldBytes = new TextEncoder().encode(
  JSON.stringify({
    $schema: 'https://tau.new/schemas/tau-schema-v1.json',
    id: projectId,
    name: 'Preserved',
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.scad' } },
  }),
);

describe('checked-out legacy project conversion', () => {
  it('should preserve identity while leaving the supplied historical bytes untouched', async () => {
    const filesystem = await createFilesystem();
    await filesystem.writeFile('tau.json', oldBytes);
    const converted = await convertCheckedOutProjectManifest({ filesystem, projectId, expected: oldBytes });
    expect(converted).toEqual(await filesystem.readFile('tau.json'));
    expect(JSON.parse(await filesystem.readFile('tau.json', 'utf8'))).toMatchObject({
      $schema: 'https://tau.new/schemas/tau-v1.json',
    });
    expect(JSON.parse(await filesystem.readFile('tau.json', 'utf8'))).not.toHaveProperty('id');
    expect(JSON.parse(await filesystem.readFile('.tau/project.json', 'utf8'))).toEqual({ version: 1, projectId });
    expect(JSON.parse(new TextDecoder().decode(oldBytes)).id).toBe(projectId);
  });

  it('should refuse contradictory imported identity before any checkout mutation', () => {
    expect(() => {
      validateLegacyProjectIdentity(oldBytes, otherProjectId);
    }).toThrow('does not match');
  });

  it('should withhold replacement when cancellation arrives during its last identity check', async () => {
    const filesystem = await createFilesystem();
    await filesystem.writeFile('tau.json', oldBytes);
    await filesystem.writeFile('.tau/project.json', serializeProjectIdentity({ version: 1, projectId }));
    const controller = new AbortController();
    const stat = filesystem.stat.bind(filesystem);
    let identityChecks = 0;
    vi.spyOn(filesystem, 'stat').mockImplementation(async (path, options) => {
      const result = await stat(path, options);
      if (path === '.tau/project.json') {
        identityChecks += 1;
        if (identityChecks === 2) {
          controller.abort(new Error('checkout stopped'));
        }
      }
      return result;
    });
    await expect(
      convertCheckedOutProjectManifest({ filesystem, projectId, expected: oldBytes, signal: controller.signal }),
    ).rejects.toThrow('checkout stopped');
    expect(await filesystem.readFile('tau.json')).toEqual(oldBytes);
  });

  it('should retain the original declaration when identity changes at the write boundary', async () => {
    const filesystem = await createFilesystem();
    await filesystem.writeFile('tau.json', oldBytes);
    await filesystem.writeFile('.tau/project.json', serializeProjectIdentity({ version: 1, projectId }));
    const checkedWrite = filesystem.writeFileChecked.bind(filesystem);
    vi.spyOn(filesystem, 'writeFileChecked').mockImplementationOnce(async (request) => {
      await filesystem.writeFile(
        '.tau/project.json',
        serializeProjectIdentity({ version: 1, projectId: otherProjectId }),
      );
      return checkedWrite(request);
    });
    await expect(convertCheckedOutProjectManifest({ filesystem, projectId, expected: oldBytes })).rejects.toThrow(
      'changed',
    );
    expect(await filesystem.readFile('tau.json')).toEqual(oldBytes);
  });
});
