import { describe, expect, it, vi } from 'vitest';
import { ToolCallError } from '#app/host-bridge.js';
import type { HostBridge } from '#app/host-bridge.js';
import { createPartThumbnails, partThumbnailsToolName } from '#app/part-previews.jsx';

const primitives = [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }];
const part = (id: string) => ({ id, primitives });

/** A bridge whose `callTool` the test scripts. */
const bridgeOf = (callTool: HostBridge['callTool']): HostBridge => {
  const partial: Pick<HostBridge, 'callTool'> = { callTool };
  return partial as unknown as HostBridge;
};

/** Wait until the snapshot settles: no part pending. */
const settled = async (thumbnails: ReturnType<typeof createPartThumbnails>) => {
  await vi.waitFor(() => {
    expect([...thumbnails.snapshot().values()].some((state) => state.status === 'pending')).toBe(false);
  });
  return thumbnails.snapshot();
};

describe('createPartThumbnails', () => {
  it('renders parts four per call, newest request first, and decodes each preview', async () => {
    const callTool = vi.fn(async (_name: string, args: Readonly<Record<string, unknown>>) => ({
      thumbnails: (args['parts'] as Array<{ id: string }>).map(({ id }) => ({
        id,
        mimeType: 'image/webp',
        data: 'AQID',
      })),
    }));
    const thumbnails = createPartThumbnails(bridgeOf(callTool), 'm1');

    thumbnails.request(['a', 'b', 'c', 'd', 'e'].map((id) => part(id)));
    expect(thumbnails.snapshot().get('a')).toEqual({ status: 'pending' });
    const states = await settled(thumbnails);

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool.mock.calls[0]).toEqual([
      partThumbnailsToolName,
      { modelId: 'm1', parts: ['a', 'b', 'c', 'd'].map((id) => part(id)) },
    ]);
    expect(states.get('e')).toEqual({ status: 'ready', bytes: new Uint8Array([1, 2, 3]) });
  });

  it('asks once per part until a retry', async () => {
    const callTool = vi.fn(async () => ({ thumbnails: [] }));
    const thumbnails = createPartThumbnails(bridgeOf(callTool), 'm1');

    thumbnails.request([part('a')]);
    await settled(thumbnails);
    thumbnails.request([part('a')]);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(thumbnails.snapshot().get('a')?.status).toBe('failed');
    thumbnails.retry(part('a'));
    await settled(thumbnails);

    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('marks every part unavailable and stops asking when the server has no thumbnail tool', async () => {
    const callTool = vi.fn(async () => {
      throw new ToolCallError('UNKNOWN_TOOL', 'Tool app_part_thumbnails not found');
    });
    const thumbnails = createPartThumbnails(bridgeOf(callTool), 'm1');

    thumbnails.request([part('a'), part('b')]);
    await settled(thumbnails);
    thumbnails.request([part('c')]);

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(thumbnails.snapshot().get('c')?.status).toBe('failed');
  });

  it('keeps the last good preview when a retry fails', async () => {
    const callTool = vi
      .fn<HostBridge['callTool']>()
      .mockResolvedValueOnce({ thumbnails: [{ id: 'a', mimeType: 'image/webp', data: 'AQID' }] })
      .mockRejectedValueOnce(new Error('busy'));
    const thumbnails = createPartThumbnails(bridgeOf(callTool), 'm1');

    thumbnails.request([part('a')]);
    await settled(thumbnails);
    thumbnails.retry(part('a'));
    const states = await settled(thumbnails);

    expect(states.get('a')).toMatchObject({ status: 'failed', bytes: new Uint8Array([1, 2, 3]) });
  });
});
