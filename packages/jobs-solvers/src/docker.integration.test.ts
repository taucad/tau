import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { openFoamContainerImages } from '#openfoam-definition.js';
import { createNodeSolverProcessExecutor } from '#solver-host.js';

const integrationEnabled = process.env['TAU_SOLVER_DOCKER_INTEGRATION'] === '1';
const calculixImage = process.env['TAU_CALCULIX_IMAGE'];

const runContainerProbe = async (input: {
  readonly image: string;
  readonly command: readonly string[];
}): Promise<string> => {
  const executor = createNodeSolverProcessExecutor();
  const cwd = await mkdtemp(join(tmpdir(), 'tau-solver-integration-'));
  let output = '';
  const result = await executor.execute({
    executable: 'docker',
    arguments: ['run', '--rm', input.image, ...input.command],
    cwd,
    environment: {},
    signal: new AbortController().signal,
    terminationGrace: 10_000,
    outputLimit: 1024 * 1024,
    async onOutput(chunk) {
      output += chunk.text;
    },
  });
  expect(result).toMatchObject({ status: 'exited', exitCode: 0 });
  return output;
};

describe.skipIf(!integrationEnabled)('solver Docker images', () => {
  it('runs the pinned OpenFOAM v2506 environment entry point', async () => {
    const image = openFoamContainerImages['2506'];
    expect(image).toBeDefined();
    if (image === undefined) {
      return;
    }
    const output = await runContainerProbe({
      image,
      command: ['foamVersion'],
    });
    expect(output).toContain('2506');
  }, 300_000);

  it.skipIf(calculixImage === undefined)(
    'runs a deployment-supplied CalculiX 2.23 image',
    async () => {
      if (calculixImage === undefined) {
        return;
      }
      const output = await runContainerProbe({ image: calculixImage, command: ['ccx', '-v'] });
      expect(output).toContain('2.23');
    },
    300_000,
  );
});
