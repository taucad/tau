import { describe, expect, it, vi } from 'vitest';
import { loadCloudHostObserver } from '#cloud-host-observer.js';

/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names */
const cloud = { TAU_CLOUD_HOST: '1', TAU_HOST_OBSERVER_MODULE: '/app/observer/cloud-host-observer.mjs' };
/* eslint-enable @typescript-eslint/naming-convention -- end of the environment table */

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
    expect(await loadCloudHostObserver(cloud, async () => undefined)).toBeUndefined();
  });

  it('should answer the module’s default export as the daemon’s hook', async () => {
    const observeChats = vi.fn();
    const load = vi.fn(async () => ({ default: observeChats }));

    expect(await loadCloudHostObserver(cloud, load)).toBe(observeChats);
    expect(load).toHaveBeenCalledExactlyOnceWith('file:///app/observer/cloud-host-observer.mjs');
  });
});
