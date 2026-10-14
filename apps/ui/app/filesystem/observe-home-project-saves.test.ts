import { afterEach, describe, expect, it, vi } from 'vitest';
import { Topic } from '@taucad/events';
import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
import type { ContentChangeEvent } from '@taucad/fs-client/file-content-service';
import type { FileSystemBackend } from '@taucad/types';
import { observeHomeProjectSaves } from '#filesystem/observe-home-project-saves.js';

const request = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#filesystem/handle-store.js', () => ({ requestHomeStoragePersistence: request }));
afterEach(() => {
  vi.clearAllMocks();
});

function setup(backend: FileSystemBackend = 'opfs', projectId: string | undefined = 'project') {
  const writes = new Topic<ContentChangeEvent>({ name: 'test.content' });
  const remote = new Topic<unknown>({ name: 'test.worker' });
  const channel = new WorkerChangeChannel({ transport: { listen: (_event, handler) => remote.subscribe(handler) } });
  const unsubscribe = observeHomeProjectSaves({
    backend,
    projectId,
    channel,
    contentService: { onDidContentChange: (handler) => writes.subscribe(handler) },
  });
  return {
    writes,
    remote,
    unsubscribe,
    dispose() {
      unsubscribe();
      channel.dispose();
      writes.dispose();
      remote.dispose();
    },
  };
}

const data = new Uint8Array([1]);
describe('Home project save observation', () => {
  it.each(['opfs', 'indexeddb'] as const)('should observe committed editor and agent writes in %s', (backend) => {
    const fixture = setup(backend);
    fixture.writes.emit({ type: 'written', path: 'main.scad', data, source: 'editor' });
    fixture.remote.emit({ type: 'fileWritten', path: 'parts/body.scad', backend });
    fixture.writes.emit({ type: 'batchWritten', paths: ['.tau/cache/item', 'main.scad'], source: 'machine' });
    expect(request).toHaveBeenCalledTimes(3);
    fixture.dispose();
  });

  it('should ignore reads, generated files, records, and disk events', () => {
    const fixture = setup();
    fixture.writes.emit({ type: 'read', path: 'main.scad', data });
    fixture.writes.emit({ type: 'written', path: '.tau/records/chat.json', data, source: 'machine' });
    fixture.writes.emit({ type: 'batchWritten', paths: ['node_modules/lib.js', 'thumbnail.webp'], source: 'machine' });
    fixture.remote.emit({ type: 'fileWritten', path: '.git/objects/hash', backend: 'opfs' });
    fixture.remote.emit({ type: 'fileWritten', path: 'main.scad', backend: 'webaccess' });
    expect(request).not.toHaveBeenCalled();
    fixture.dispose();
  });

  it.each(['webaccess', 'node', 'memory'] as const)('should ignore %s projects', (backend) => {
    const fixture = setup(backend);
    fixture.writes.emit({ type: 'written', path: 'main.scad', data, source: 'editor' });
    fixture.remote.emit({ type: 'fileWritten', path: 'main.scad', backend });
    expect(request).not.toHaveBeenCalled();
    fixture.dispose();
  });

  it('should ignore root housekeeping and unsubscribe on project change', () => {
    const root = setup('opfs', '');
    root.writes.emit({ type: 'written', path: 'main.scad', data, source: 'machine' });
    expect(request).not.toHaveBeenCalled();
    root.dispose();
    const project = setup();
    project.unsubscribe();
    project.writes.emit({ type: 'written', path: 'main.scad', data, source: 'editor' });
    project.remote.emit({ type: 'fileWritten', path: 'main.scad', backend: 'opfs' });
    expect(request).not.toHaveBeenCalled();
    project.dispose();
  });
});
