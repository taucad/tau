import { describe, it, expect } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { ChangeSet } from '@taucad/filesystem';
import { chatMetadataWatchRequest, manifestWatchRequest } from '#hooks/use-project-manager.js';

const workspace = async () => {
  const registry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:watch-kinds' } as const;
  const mounts = new MountTable();
  mounts.mount('/', await registry.getProvider(scope), { class: 'authored', ...scope });
  return new WorkspaceFileService({
    providerRegistry: registry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable: mounts,
  });
};

const pathsOf = (sets: readonly ChangeSet[]): string[] => sets.flatMap((set) => set.entries.map(({ path }) => path));

describe('project discovery and chat membership watch only their kinds (D18)', () => {
  it('hears a manifest and a chat row, and nothing of an agent turn or a chat log append', async () => {
    const service = await workspace();
    const home = service.createRootedFileSystem('/');
    const writer = service.createRootedFileSystem('/', { originClientId: 'writer' });
    const manifests: ChangeSet[] = [];
    const chats: ChangeSet[] = [];
    const stopManifests = home.watchChangeSets!(manifestWatchRequest, (set) => manifests.push(set));
    const stopChats = home.watchChangeSets!(chatMetadataWatchRequest, (set) => chats.push(set));
    try {
      await writer.writeFile('projects/p1/.tau/chats/c1/chat.json', '{}');
      await writer.writeFile('projects/p1/tau.json', '{}');
      const before = { manifests: manifests.length, chats: chats.length };

      await writer.writeFiles!(
        Object.fromEntries(
          Array.from({ length: 50 }, (_, index) => [
            `projects/p1/agent/turn/file-${String(index)}.ts`,
            { content: 'export {};' },
          ]),
        ),
      );
      await writer.appendFile!('projects/p1/.tau/chats/c1/events/segment-0001.jsonl', '{}\n');
      await writer.writeFile('projects/p1/.tau/cache/tau.json', '{}');

      expect(pathsOf(manifests)).toContain('projects/p1/tau.json');
      expect(pathsOf(manifests)).not.toContain('projects/p1/.tau/cache/tau.json');
      expect(pathsOf(chats)).toContain('projects/p1/.tau/chats/c1/chat.json');
      expect(manifests).toHaveLength(before.manifests);
      expect(chats).toHaveLength(before.chats);
    } finally {
      stopManifests();
      stopChats();
      service.dispose();
    }
  });

  it("hears a peer tab's project identity write", async () => {
    const service = await workspace();
    const home = service.createRootedFileSystem('/');
    const peer = service.createRootedFileSystem('/', { originClientId: 'peer' });
    const manifests: ChangeSet[] = [];
    const stop = home.watchChangeSets!(manifestWatchRequest, (set) => manifests.push(set));
    try {
      await peer.writeFile('projects/p1/.tau/project.json', '{"id":"p1"}');

      expect(pathsOf(manifests)).toContain('projects/p1/.tau/project.json');
    } finally {
      stop();
      service.dispose();
    }
  });
});
