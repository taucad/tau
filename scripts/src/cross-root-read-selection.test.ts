import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseProjectList } from '#check-release-projects.js';

/**
 * Seeded paths: a change to a file that a project reads across its root must select that project in
 * the plan's own selector, `nx show projects --affected`, so its tests run on a pull request that
 * changes only that file. `validate-cross-root-reads` requires a graph edge or a declared input for
 * every such read; these cases prove the rule holds end to end in Nx's affected locators, one path per
 * kind of fix: a policy file outside every project, a workflow, a fixture, a static asset, a corpus
 * file, a stylesheet and a plugin manifest a directory listing reads.
 */
const seeded: ReadonlyArray<{ readonly path: string; readonly readers: readonly string[] }> = [
  // Five api and api-billing tests read the checked-in billing policy; infra/ is not a project.
  { path: 'infra/billing/development.commercial.json', readers: ['api', 'api-billing'] },
  // `scripts:check-release-projects` checks the publish workflow's project selectors.
  { path: '.github/workflows/publish.yml', readers: ['scripts'] },
  // `host`'s agent-tools integration test copies this example as its fixture.
  { path: 'libs/tau-examples/src/kernels/replicad/bench-vise/main.ts', readers: ['host'] },
  // The gearbox manifest test checks its frozen assets against this example's source hash.
  { path: 'libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts', readers: ['planetary-gearbox'] },
  // `types` validates its schema against the copy the UI serves.
  { path: 'apps/ui/public/schemas/tau-v1.json', readers: ['types'] },
  // `revisions` replays agent-host's Lean corpus.
  { path: 'packages/agent-host/specs/lean/corpus/pull-records.trace', readers: ['revisions'] },
  // The email palette is generated from the design-system tokens.
  { path: 'packages/ui/src/styles/tokens.css', readers: ['api-email'] },
  // Tests that list packages/plugins read each plugin's manifest; `ui`, `runtime` and `skills` do not depend on rolldown.
  { path: 'packages/plugins/rolldown/package.json', readers: ['ui', 'runtime', 'skills'] },
];

const root = resolve(import.meta.dirname, '../..');
const run = promisify(execFile);

/** The projects `nx show projects --affected --files=<path>` selects, as the CI plan computes them. */
const affectedBy = async (path: string): Promise<string[]> => {
  const environment = { ...process.env };
  environment['NX_CLOUD'] = 'false';
  environment['NX_DAEMON'] = 'false';
  const { stdout } = await run(
    join(root, 'node_modules/.bin/nx'),
    ['show', 'projects', '--affected', `--files=${path}`, '--json'],
    { cwd: root, encoding: 'utf8', env: environment, maxBuffer: 16 * 1024 * 1024 },
  );
  return parseProjectList(stdout);
};

const selected = new Map<string, readonly string[]>();

/**
 * Runs the seeded paths one Nx process at a time, so the suite does not starve the tests that run
 * beside it; each run loads the cached graph.
 */
const runInTurn = async (pending: ReadonlyArray<(typeof seeded)[number]>): Promise<void> => {
  const [next, ...rest] = pending;
  if (next === undefined) {
    return;
  }
  selected.set(next.path, await affectedBy(next.path));
  await runInTurn(rest);
};

beforeAll(async () => {
  await runInTurn(seeded);
}, 300_000);

describe('cross-root read selection', () => {
  it.each(seeded)('a change to $path selects $readers', ({ path, readers }) => {
    expect(selected.get(path)).toEqual(expect.arrayContaining([...readers]));
  });
});
