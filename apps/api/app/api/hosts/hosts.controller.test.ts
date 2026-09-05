import { createHash } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { HostsController } from '#api/hosts/hosts.controller.js';
import type { HostsService } from '#api/hosts/hosts.service.js';

const expectedOwnerAffinity = (ownerId: string): string =>
  `sha256:${createHash('sha256').update(`tau-owner-affinity-v1\0${ownerId}`).digest('hex')}`;

describe('HostsController worker affinity', () => {
  it('authenticates the paired device and returns an opaque owner-bound label', async () => {
    const authenticateDevice = vi.fn(async () => ({ ownerId: 'owner-a' }));
    const controller = new HostsController({ authenticateDevice } as unknown as HostsService);

    await expect(controller.getWorkerAffinity('Bearer paired-credential')).resolves.toEqual({
      runtimeAffinity: { kind: 'owner', value: expectedOwnerAffinity('owner-a') },
    });
    expect(authenticateDevice).toHaveBeenCalledWith('Bearer paired-credential');
    const ownerB = await new HostsController({
      authenticateDevice: vi.fn(async () => ({ ownerId: 'owner-b' })),
    } as unknown as HostsService).getWorkerAffinity('Bearer another-credential');
    expect(ownerB.runtimeAffinity.value).not.toBe(expectedOwnerAffinity('owner-a'));
    expect(ownerB.runtimeAffinity.value).not.toContain('owner-b');
  });

  it('rejects an invalid or revoked paired-device credential', async () => {
    const controller = new HostsController({
      authenticateDevice: vi.fn(async () => undefined),
    } as unknown as HostsService);

    await expect(controller.getWorkerAffinity('Bearer revoked')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('HostsController cloud placement', () => {
  it('provisions this project cloud host for the caller and never returns a credential', async () => {
    const provisionCloudHost = vi.fn(
      async (): Promise<{ deviceId: string; label: string; state: 'existing' | 'provisioned' }> => ({
        deviceId: 'agent_cloud',
        label: 'Tau Cloud',
        state: 'provisioned',
      }),
    );
    const controller = new HostsController({ provisionCloudHost } as unknown as HostsService);

    const response = await controller.provisionCloudHost({ projectId: 'project-a' }, 'owner-1');

    expect(provisionCloudHost).toHaveBeenCalledWith({ userId: 'owner-1', projectId: 'project-a' });
    expect(response).toEqual({ deviceId: 'agent_cloud', label: 'Tau Cloud', state: 'provisioned' });
    expect(Object.keys(response)).not.toContain('credential');
  });

  it('lists one host run directory rows for its owner', async () => {
    const listRuns = vi.fn(async () => [
      { runId: 'run-1', chatId: 'chat-1', state: 'running', placement: 'agent_cloud' },
    ]);
    const controller = new HostsController({ listRuns } as unknown as HostsService);

    await expect(controller.listRuns('agent_cloud', 'owner-1')).resolves.toMatchObject([{ runId: 'run-1' }]);
    expect(listRuns).toHaveBeenCalledWith('agent_cloud', 'owner-1');
  });
});
