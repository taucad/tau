import { describe, expect, it, vi } from 'vitest';
import { loadCloudHostObserver } from '#cloud-host-observer.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names */
const cloud = { TAU_CLOUD_HOST: '1', TAU_HOST_OBSERVER_MODULE: '/app/observer/cloud-host-observer.mjs' };
/* eslint-enable @typescript-eslint/naming-convention -- end of the environment table */

const noRows = vi.fn(async ({ cursor }: { cursor: number }) => ({
  cursor,
  nextCursor: cursor,
  endCursor: 0,
  events: [],
}));

describe('loadCloudHostObserver', () => {
  it.each([
    { TAU_HOST_OBSERVER_MODULE: cloud.TAU_HOST_OBSERVER_MODULE },
    { TAU_CLOUD_HOST: '1' },
    { ...cloud, TAU_HOST_OBSERVER_MODULE: 'observer.mjs' },
  ])('should load nothing outside a provisioned cloud host or for a relative module: %o', async (environment) => {
    const load = vi.fn();

    expect(await loadCloudHostObserver(environment, load)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('should load nothing when the module is missing or exports no factory', async () => {
    expect(
      await loadCloudHostObserver(cloud, async () => {
        throw new Error('Cannot find module');
      }),
    ).toBeUndefined();
    expect(await loadCloudHostObserver(cloud, async () => ({ default: 'not a factory' }))).toBeUndefined();
  });

  it('should hand the module its project and own-turn observation, and contain what it throws', async () => {
    const onChatQuiescent = vi.fn(() => {
      throw new Error('observer failed');
    });
    const factory = vi.fn((input: { projectId: string }) =>
      input.projectId === 'project-1' ? { onChatQuiescent, close: vi.fn() } : undefined,
    );
    const load = vi.fn(async () => ({ default: factory }));

    const observeChats = (await loadCloudHostObserver(cloud, load))!;
    const observer = observeChats('project-1', noRows);
    const other = observeChats('project-2', noRows);

    expect(load).toHaveBeenCalledExactlyOnceWith('file:///app/observer/cloud-host-observer.mjs');
    expect(() => {
      observer.onChatQuiescent('chat-1', true);
    }).not.toThrow();
    expect(onChatQuiescent).toHaveBeenCalledExactlyOnceWith('chat-1', true);
    expect(() => {
      other.onChatQuiescent('chat-1', true);
      other.close();
    }).not.toThrow();
    const { observe } = factory.mock.calls[0]![0] as unknown as { observe: (chatId: string) => Promise<unknown> };
    await expect(observe('chat-1')).resolves.toBeDefined();
    expect(noRows).toHaveBeenCalled();
  });

  it('should answer an inert observer when the factory throws', async () => {
    const observeChats = (await loadCloudHostObserver(cloud, async () => ({
      default: () => {
        throw new Error('bad environment');
      },
    })))!;

    expect(() => {
      observeChats('project-1', noRows).close();
    }).not.toThrow();
  });
});
