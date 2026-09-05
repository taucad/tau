import { afterEach, describe, expect, it } from 'vitest';

import type { HostJobWorkerHandle } from '#job-worker.js';
import { createSolverHatchetJobWorkerFactory } from '#solver-job-worker.js';

const integrationTest = process.env['TAU_HATCHET_INTEGRATION'] === '1' ? it : it.skip;
let worker: HostJobWorkerHandle | undefined;

afterEach(async () => {
  await worker?.close();
  worker = undefined;
});

describe('local Hatchet solver worker integration', () => {
  integrationTest(
    'registers the pinned OpenFOAM profile and drains against a local Hatchet engine',
    async () => {
      const token = process.env['HATCHET_CLIENT_TOKEN'];
      if (!token) {
        throw new TypeError('TAU_HATCHET_INTEGRATION requires HATCHET_CLIENT_TOKEN.');
      }
      const credential = process.env['TAU_HOST_CREDENTIAL'];
      if (!credential) {
        throw new TypeError('TAU_HATCHET_INTEGRATION requires TAU_HOST_CREDENTIAL.');
      }
      const factory = createSolverHatchetJobWorkerFactory({
        hatchetToken: token,
        hatchetNamespace: process.env['HATCHET_CLIENT_NAMESPACE'] ?? 'tau-local',
        slots: 1,
        openFoamSolverVersion: '2506',
        inputMaterializer: {
          async materialize(input) {
            input.signal.throwIfAborted();
          },
        },
      });
      worker = await factory.start({
        apiUrl: new URL(process.env['TAU_API_URL'] ?? 'http://127.0.0.1:3000'),
        credential: {
          v: 1,
          deviceId: 'local-integration-worker',
          credential,
        },
      });

      await worker.ready;
      expect(worker.registration.capabilities).toMatchObject({
        'container.engine': 'docker',
        'solver.openfoam.version': '2506',
      });
      await worker.close();
      await expect(worker.closed).resolves.toEqual({ cause: 'requested' });
    },
    30_000,
  );
});
