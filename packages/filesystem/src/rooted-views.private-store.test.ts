import { describe, expect, it } from 'vitest';
import type { ChangeEvent } from '#types.js';
import { createWorkspaceFileService, decoder, encoder } from '#testing/workspace-service-harness.js';

describe('rooted storePrivateObject', () => {
  it('should store a Git store file once, with no change event and no mutation claim', async () => {
    const { service, eventBus, resourceQueue } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => {
      events.push(event);
    });
    const depths: number[] = [];
    const object = '.git/lfs/objects/ab/cd/abcd';
    const content = encoder.encode('solid a');

    const stored = rooted.storePrivateObject!(object, content);
    depths.push(resourceQueue.depth);

    expect(await stored).toBe('stored');
    expect(decoder.decode(await rooted.readFile(object))).toBe('solid a');
    expect(await rooted.readdir('.git/lfs/objects/ab/cd')).toStrictEqual(['abcd']);
    expect(await rooted.storePrivateObject!(object, content)).toBe('present');
    expect(events).toStrictEqual([]);
    expect(depths).toStrictEqual([0]);
  });

  it('should refuse a path outside a Git store, which belongs to the mutation pipeline', async () => {
    const { service } = await createWorkspaceFileService();
    const rooted = service.createRootedFileSystem('/');

    await expect(rooted.storePrivateObject!('models/a.step', encoder.encode('solid a'))).rejects.toThrow(TypeError);
    await expect(rooted.storePrivateObject!('.git', encoder.encode('x'))).rejects.toThrow(TypeError);
    expect(await rooted.exists('models/a.step')).toBe(false);
  });
});
