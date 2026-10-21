import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const configuration = vi.hoisted(() => ({ directory: '' }));
vi.mock('@taucad/host', () => ({ defaultConfigDirectory: () => configuration.directory }));
const { withAuthLock } = await import('#auth-lock.js');
beforeEach(async () => {
  configuration.directory = await mkdtemp(join(tmpdir(), 'tau-auth-lock-'));
});
afterEach(async () => {
  await rm(configuration.directory, { recursive: true, force: true });
});

it('refuses overlapping mutations for one origin, permits another, and releases after failure', async () => {
  await withAuthLock('https://api.example.test', async () => {
    await expect(withAuthLock('https://api.example.test', async () => undefined)).rejects.toMatchObject({
      code: 'AUTH_BUSY',
    });
    expect(await withAuthLock('https://staging.example.test', async () => 'independent')).toBe('independent');
  });
  await expect(
    withAuthLock('https://api.example.test', async () => {
      throw new Error('operation failed');
    }),
  ).rejects.toThrow('operation failed');
  expect(await withAuthLock('https://api.example.test', async () => 'released')).toBe('released');
});
