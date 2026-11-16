/**
 * NX Plugin for formal verification targets.
 *
 * Infers a project's `formal:tla` and `formal:lean` targets from the spec directories
 * under `{projectRoot}/specs/`, the directories `node tools/formal/src/cli.ts check`
 * reads (`findExpectedFiles` in tools/formal/src/expected.ts). A directory counts
 * only when its `expected.json` sits beside the marker of the language it checks:
 *
 * - a `lean-toolchain` file and an `expected.json` with a `lean` section is a Lean
 *   directory, checked by `check --tier lean` → `formal:lean`;
 * - at least one `*.tla` file and an `expected.json` without a `lean` section is a
 *   TLA+ directory, checked by `check --tier pr` → `formal:tla`.
 *
 * When every TLA+ directory of a project is a family below `specs/` (`specs/record-sync/`), each
 * family gets its own `formal:tla:<family>` (`check --tier pr --family <family>`), and `formal:tla`
 * becomes an `nx:noop` that depends on every family: CI deals the family targets to parallel runners,
 * and each family is held to the Java tier's budget per target (formal verification policy § 6).
 *
 * Any other `expected.json` is ignored. `expected.json` is a generic name that
 * other tools use too (packages/plugins/openrscad/src/fixtures/edge-topology/
 * holds one), so the name alone must never give a project a formal target.
 * `scripts/src/formal-plugin-target.test.ts` fails when a tracked spec directory
 * has a marker without an `expected.json`, or an `expected.json` whose `lean`
 * section disagrees with its markers, so an ignored file cannot go unnoticed.
 *
 * The glob matches the markers as well as `expected.json`, so every file the rule
 * reads is a matched file: Nx re-runs inference when one is added or removed, and
 * the plugin reads sibling markers from the matched list instead of the disk.
 *
 * For `formal:tla` and `formal:lean` the plugin decides only which projects carry a
 * target. Their command, inputs, outputs and cache settings stay in `nx.json`
 * `targetDefaults`, beside `formal:nightly` and `formal:logs`, and an explicit
 * project.json target still overrides the inferred one. A family target carries its
 * own configuration, because its command, inputs and outputs name the family.
 *
 * `formal:nightly` and `formal:logs` are not inferred: which projects run them is
 * an owner's choice the files do not record (a project with an exported graph or
 * Lean proofs may still be left out of the nightly run), so they stay explicit in
 * project.json.
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readJsonFile } from '@nx/devkit';
import type { CreateNodesResult, CreateNodesV2, TargetConfiguration } from '@nx/devkit';

/** The part of an `expected.json` this plugin reads: whether it describes Lean proofs. */
type ExpectedFile = { lean?: unknown };

/** The files of one spec directory that the rule reads. */
export type SpecDirectory = {
  /** Workspace-relative path of the directory's `expected.json`, when it has one. */
  expected?: string;
  /** Whether the directory holds a `lean-toolchain` file. */
  leanToolchain: boolean;
  /** Whether the directory holds at least one `*.tla` file. */
  tla: boolean;
};

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

/** Groups matched files by directory, recording the markers each directory holds. */
export const specDirectories = (files: readonly string[]): Map<string, SpecDirectory> => {
  const directories = new Map<string, SpecDirectory>();
  for (const file of files) {
    const separator = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
    const directory = file.slice(0, separator);
    const name = file.slice(separator + 1);
    const entry = directories.get(directory) ?? {
      leanToolchain: false,
      tla: false,
    };
    if (name === 'expected.json') {
      entry.expected = file;
    } else if (name === 'lean-toolchain') {
      entry.leanToolchain = true;
    } else if (name.endsWith('.tla')) {
      entry.tla = true;
    }
    directories.set(directory, entry);
  }
  return directories;
};

/** The target a spec directory gives its project, or undefined when its markers do not match. */
export const formalTargetName = (
  directory: SpecDirectory,
  expected: ExpectedFile,
): 'formal:tla' | 'formal:lean' | undefined => {
  if (expected.lean !== undefined) {
    return directory.leanToolchain ? 'formal:lean' : undefined;
  }
  return directory.tla ? 'formal:tla' : undefined;
};

/** The workspace-relative `specs/` directory of a project root. */
const specsOf = (projectRoot: string): string => `${projectRoot}/specs`;

/**
 * The family a TLA+ spec directory names: its path below `specs/` (`record-sync`), or undefined for
 * a directory that is `specs/` itself.
 */
export const formalFamily = (directory: string, projectRoot: string): string | undefined => {
  const relative = directory.replaceAll('\\', '/').slice(specsOf(projectRoot).length + 1);
  return relative === '' ? undefined : relative;
};

/** The Java-tier target of one family: `formal check --tier pr --family <family>`, its inputs narrowed to the family. */
export const familyTarget = (family: string): TargetConfiguration => ({
  executor: 'nx:run-commands',
  options: { command: `node tools/formal/src/cli.ts check --tier pr --family ${family} {projectRoot}` },
  cache: true,
  // FM-R15 allows two JVMs at once and the runner caps them per process: Nx runs one family at a time.
  parallelism: false,
  inputs: [
    `{projectRoot}/specs/${family}/**/*`,
    '{projectRoot}/src/**/*.legality.json',
    '{workspaceRoot}/tools/formal/src/**/*',
    '{workspaceRoot}/tools/formal/toolchain.lock',
    { runtime: 'node tools/formal/src/cli.ts toolchain-id' },
  ],
  outputs: [`{workspaceRoot}/out/reports/formal/{projectRoot}/pr/${family}`],
  metadata: {
    description: `The pull-request tier of the ${family} TLA+ family: SANY, its pr configs and log cases, graph and suite staleness (formal verification policy § 6).`,
  },
});

/** One spec directory that gives its project a target. */
type FormalDirectory = {
  /** Workspace-relative path of the directory's `expected.json`, the key of its result. */
  readonly expected: string;
  /** Workspace-relative path of the directory. */
  readonly directory: string;
  readonly projectRoot: string;
  readonly targetName: 'formal:tla' | 'formal:lean';
};

/** The spec directories that give a project a target, in file order. */
const formalDirectories = (directories: Map<string, SpecDirectory>, workspaceRoot: string): FormalDirectory[] => {
  const result: FormalDirectory[] = [];
  for (const [directory, entry] of directories) {
    if (entry.expected === undefined || (!entry.leanToolchain && !entry.tla)) {
      continue;
    }
    const projectRoot = formalProjectRoot(entry.expected, workspaceRoot);
    if (projectRoot === undefined) {
      continue;
    }
    const targetName = formalTargetName(entry, readJsonFile<ExpectedFile>(join(workspaceRoot, entry.expected)));
    if (targetName !== undefined) {
      result.push({ expected: entry.expected, directory, projectRoot, targetName });
    }
  }
  return result;
};

/**
 * The families of a project's TLA+ directories, sorted, when every one is a family below `specs/`;
 * undefined when one is `specs/` itself, so the project keeps one `formal:tla`.
 */
export const projectFamilies = (tlaDirectories: readonly string[], projectRoot: string): string[] | undefined => {
  const families = tlaDirectories.map((directory) => formalFamily(directory, projectRoot));
  return families.includes(undefined) ? undefined : (families as string[]).toSorted();
};

/** `formal:tla` of a project with families: an `nx:noop` that runs every family's target. */
export const familiesTarget = (families: readonly string[]): TargetConfiguration => ({
  executor: 'nx:noop',
  dependsOn: families.map((family) => ({ target: `formal:tla:${family}` })),
  cache: false,
  metadata: { description: `Every TLA+ family of the project: ${families.join(', ')}.` },
});

/**
 * The targets each spec directory gives its project, keyed by its `expected.json`. A Lean directory
 * gives `formal:lean`. When every TLA+ directory of a project is a family below `specs/`, each gives
 * its own `formal:tla:<family>` and `formal:tla` runs them all, so CI deals the families to parallel
 * runners and each stays within the Java tier's budget per target (formal verification policy § 6).
 * A project with a TLA+ spec at `specs/` itself keeps one `formal:tla`. An empty target is configured
 * by `nx.json` `targetDefaults`; a family target carries its own configuration, because its command,
 * inputs and outputs name the family.
 */
export const formalResults = (directories: readonly FormalDirectory[]): Array<[string, CreateNodesResult]> => {
  const tlaByProject = new Map<string, string[]>();
  for (const { directory, projectRoot, targetName } of directories) {
    if (targetName === 'formal:tla') {
      tlaByProject.set(projectRoot, [...(tlaByProject.get(projectRoot) ?? []), directory]);
    }
  }
  return directories.map(({ expected, directory, projectRoot, targetName }) => {
    const families =
      targetName === 'formal:tla' ? projectFamilies(tlaByProject.get(projectRoot) ?? [], projectRoot) : undefined;
    const family = formalFamily(directory, projectRoot);
    const targets: Record<string, TargetConfiguration> =
      families === undefined || family === undefined
        ? { [targetName]: {} }
        : { [`formal:tla:${family}`]: familyTarget(family), 'formal:tla': familiesTarget(families) };
    return [expected, { projects: { [projectRoot]: { targets } } }];
  });
};

export const createNodesV2: CreateNodesV2 = [
  '**/specs/**/{expected.json,lean-toolchain,*.tla}',
  // oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- not necessary as already has an explicit return type
  (files, _options, context) => {
    return formalResults(formalDirectories(specDirectories(files), context.workspaceRoot));
  },
];
