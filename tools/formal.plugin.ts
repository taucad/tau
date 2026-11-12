/**
 * NX Plugin for formal verification targets.
 *
 * Infers a project's `formal` and `formal:lean` targets from the `expected.json`
 * files under `{projectRoot}/specs/`, the files `node tools/formal/src/cli.ts check`
 * reads (`findExpectedFiles` in tools/formal/src/expected.ts):
 *
 * - an `expected.json` without a `lean` section is a TLA+ directory, checked by
 *   `check --tier pr` → `formal`;
 * - an `expected.json` with a `lean` section is a Lean directory, checked by
 *   `check --tier lean` → `formal:lean`.
 *
 * The plugin decides only which projects carry a target. The command, inputs,
 * outputs and cache settings stay in `nx.json` `targetDefaults`, beside
 * `formal:nightly` and `formal:logs`, so every formal tier is configured in one
 * place and an explicit project.json target still overrides the inferred one.
 *
 * `formal:nightly` and `formal:logs` are not inferred: which projects run them is
 * an owner's choice the files do not record (a project with an exported graph or
 * Lean proofs may still be left out of the nightly run), so they stay explicit in
 * project.json.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesResult, CreateNodesV2 } from '@nx/devkit';

/** The part of an `expected.json` this plugin reads: whether it describes Lean proofs. */
type ExpectedFile = { lean?: unknown };

/** Directory segments that hold test fixtures, never a project's own specs. */
const fixtureSegments = new Set(['fixtures', '__fixtures__']);

/**
 * The project root that owns an `expected.json`: the directory above its first
 * `specs` segment, as long as it is a project and no segment is a fixture
 * directory. `formal check <projectRoot>` reads every `expected.json` under
 * `<projectRoot>/specs`, nested or not.
 */
export const formalProjectRoot = (expectedFile: string, workspaceRoot: string): string | undefined => {
  const segments = expectedFile.split(/[/\\]/);
  const specs = segments.indexOf('specs');
  if (specs <= 0 || segments.slice(0, -1).some((segment) => fixtureSegments.has(segment))) {
    return undefined;
  }
  const projectRoot = segments.slice(0, specs).join('/');
  return existsSync(join(workspaceRoot, projectRoot, 'project.json')) ? projectRoot : undefined;
};

const createFormalTarget = (expectedFile: string, workspaceRoot: string): CreateNodesResult | undefined => {
  const projectRoot = formalProjectRoot(expectedFile, workspaceRoot);
  if (projectRoot === undefined) {
    return undefined;
  }
  const expected = readJsonFile<ExpectedFile>(join(workspaceRoot, expectedFile));
  const targetName = expected.lean === undefined ? 'formal' : 'formal:lean';
  return { projects: { [projectRoot]: { targets: { [targetName]: {} } } } };
};

export const createNodesV2: CreateNodesV2 = [
  '**/specs/**/expected.json',
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (expectedFiles, _options, context) => {
    const results: Array<[string, CreateNodesResult]> = [];
    for (const expectedFile of expectedFiles) {
      const target = createFormalTarget(expectedFile, context.workspaceRoot);
      if (target) {
        results.push([expectedFile, target]);
      }
    }
    return results;
  },
];
