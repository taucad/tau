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
      ]),
    );
    expect(run?.arguments_.join(' ')).not.toContain('secret');
  });
});
