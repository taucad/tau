import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/*
 * `docker/setup-buildx-action` removes its builder in a post step by default. GitHub-hosted
 * runners are discarded after the job, so that step only spent 1.5 to 2 minutes per Docker job
 * (CI audit 2026-11-12, F5). Every use turns it off.
 */

const root = resolve(import.meta.dirname, '../..');
const workflowsDirectory = resolve(root, '.github/workflows');

type Step = { readonly name?: string; readonly uses?: string; readonly with?: Record<string, unknown> };
type Workflow = { readonly jobs?: Record<string, { readonly steps?: readonly Step[] }> };

const buildxSteps = (): Array<{ readonly where: string; readonly step: Step }> =>
  readdirSync(workflowsDirectory)
    .filter((file) => /\.ya?ml$/u.test(file))
    .flatMap((file) => {
      const workflow = load(readFileSync(resolve(workflowsDirectory, file), 'utf8')) as Workflow;
      return Object.entries(workflow.jobs ?? {}).flatMap(([job, { steps }]) =>
        (steps ?? [])
          .filter((step) => step.uses?.startsWith('docker/setup-buildx-action@'))
          .map((step) => ({ where: `${file} ${job}`, step })),
      );
    });

describe('docker buildx setup', () => {
  it('should find the Buildx steps, so the check below is not vacuous', () => {
    expect(buildxSteps().map(({ where }) => where)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^ci\.yml /u), expect.stringMatching(/^deploy\.yml /u)]),
    );
  });

  it('should skip removing the builder on discarded hosted runners', () => {
    const removing = buildxSteps()
      .filter(({ step }) => step.with?.['cleanup'] !== false)
      .map(({ where }) => where);
    expect(removing).toEqual([]);
  });
});
