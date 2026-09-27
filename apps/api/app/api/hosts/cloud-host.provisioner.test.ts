import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { createDockerCloudHostProvisioner } from '#api/hosts/cloud-host.provisioner.js';

describe('createDockerCloudHostProvisioner', () => {
  it('should hand the container its project and both credentials in the env file, never on argv', async () => {
    const runs: Array<{ readonly arguments_: readonly string[]; readonly environment: string }> = [];
    const provisioner = createDockerCloudHostProvisioner({
      image: 'tau-host:test',
      exec: async (_file, arguments_) => {
        const environmentFile = arguments_[arguments_.indexOf('--env-file') + 1] ?? '';
        /* Read while `docker run` would: the file is removed as soon as it returns. */
        runs.push({ arguments_, environment: await readFile(environmentFile, 'utf8') });
      },
    });

    await provisioner.start({
      deviceId: 'agent_1',
      credential: 'device-secret',
      gitCredential: 'taugit_push-secret',
      ownerId: 'owner-1',
      ownerName: 'Ada Owner',
      projectId: 'proj-1',
      apiUrl: 'https://api.tau.test',
    });

    const [run] = runs;
    expect(run?.environment.split('\n')).toEqual(
      expect.arrayContaining([
        'TAU_HOST_DEVICE_ID=agent_1',
        'TAU_HOST_CREDENTIAL=device-secret',
        'TAU_HOST_GIT_CREDENTIAL=taugit_push-secret',
        'TAU_HOST_PROJECT_ID=proj-1',
        'TAU_API_URL=https://api.tau.test',
        /* Rule 15: who the host's revisions are by (FX7 D2). */
        'TAU_HOST_OWNER_ID=owner-1',
        'TAU_HOST_OWNER_NAME=Ada Owner',
      ]),
    );
    expect(run?.arguments_.join(' ')).not.toContain('secret');
  });

  it('should keep an owner name on its own line, so it can never set another variable', async () => {
    const environments: string[] = [];
    const provisioner = createDockerCloudHostProvisioner({
      image: 'tau-host:test',
      exec: async (_file, arguments_) => {
        environments.push(await readFile(arguments_[arguments_.indexOf('--env-file') + 1] ?? '', 'utf8'));
      },
    });

    await provisioner.start({
      deviceId: 'agent_1',
      credential: 'device-secret',
      gitCredential: 'taugit_push-secret',
      ownerId: 'owner-1',
      ownerName: 'Ada\nTAU_API_URL=https://evil.test\r',
      projectId: 'proj-1',
      apiUrl: 'https://api.tau.test',
    });

    const lines = environments[0]?.split('\n') ?? [];
    expect(lines).toContain('TAU_HOST_OWNER_NAME=Ada TAU_API_URL=https://evil.test');
    expect(lines.filter((line) => line.startsWith('TAU_API_URL='))).toEqual(['TAU_API_URL=https://api.tau.test']);
  });
});
