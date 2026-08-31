/**
 * Assert that no workflow driving the package surface names a project.
 *
 * A workflow may reference a target name, a `tag:` selector, `nx affected` or
 * `nx release`; everything project-specific belongs in `project.json` /
 * `package.json` where the graph can see it. A hand-written project list in a
 * workflow drifts the moment a package is added, renamed, or retired — and Nx
 * selectors fail open, so the drift is silent.
 *
 * Two exemptions, both structural rather than convenient:
 * - `nx run <project>:<target>` is allowed when the project carries
 *   `type:tool`. The gate umbrellas (`scripts:validate`, `scripts:release-gate`)
 *   are tools, not package surface: nothing about them changes when a package
 *   is added.
 * - Deployment workflows (`deploy.yml`, `review.yml`, …) are topology, not
 *   package surface, and are out of scope — see {@link WORKFLOW_PATHS}.
 *
 * Every target a workflow names must exist on at least one project, because a
 * misspelt `-t` runs nothing and exits 0.
 *
 * @see docs/research/github-workflows-autopilot-blueprint.md (Finding 8)
 *
 * Usage: node scripts/src/validate-workflows.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { projects, workspace } from '@taucad/nx';
import type { Workspace } from '@taucad/nx';

/** The workflows that drive the package surface. */
export const WORKFLOW_PATHS = ['.github/workflows/ci.yml', '.github/workflows/publish.yml'] as const;

export type WorkflowFile = { readonly path: string; readonly text: string };

/** One `nx …` command found in a workflow's `run:` script, minus the `nx`. */
export type NxInvocation = { readonly file: string; readonly job: string; readonly args: readonly string[] };

/** Flags whose values are project names. */
const PROJECT_FLAGS = new Set(['-p', '--projects', '--exclude']);

/** Flags whose values are target names. */
const TARGET_FLAGS = new Set(['-t', '--targets', '--target', '--with-target']);

/** Subcommands, so `nx <target> <project>` is not read out of `nx show projects`. */
const SUBCOMMANDS = new Set([
  'run',
  'run-many',
  'affected',
  'release',
  'show',
  'exec',
  'graph',
  'reset',
  'sync',
  'watch',
  'daemon',
  'report',
  'connect',
  'format',
  'generate',
  'migrate',
  'repair',
  'list',
]);

/** A value that resolves through the graph rather than naming a project. */
const isSelector = (value: string): boolean => value.startsWith('tag:') || value.includes('*');

/**
 * Split a `run:` script into the shell commands it runs.
 *
 * ponytail: whitespace tokenising, not a shell parser. An argument quoted
 * because it contains a space would be split; neither workflow has one. If one
 * ever does, swap this for `shell-quote`.
 */
const shellCommands = (script: string): string[][] =>
  script
    .replaceAll('\\\n', ' ')
    .split(/[\n;|&]+/u)
    .map((line) => line.trim().split(/\s+/u));

/** Every `nx …` invocation in a workflow's `jobs.*.steps[*].run` scripts. */
export const nxInvocations = ({ path, text }: WorkflowFile): NxInvocation[] => {
  const document = load(text) as { jobs?: Record<string, { steps?: ReadonlyArray<{ run?: unknown }> }> };

  return Object.entries(document.jobs ?? {}).flatMap(([job, { steps }]) =>
    (steps ?? []).flatMap(({ run }) =>
      shellCommands(typeof run === 'string' ? run : '').flatMap((tokens) => {
        const nx = tokens.indexOf('nx');
        // Everything after a bare `--` is the target's own argv, not Nx's.
        const args = tokens.slice(nx + 1);
        const passthrough = args.indexOf('--');
        return nx === -1 ? [] : [{ file: path, job, args: passthrough === -1 ? args : args.slice(0, passthrough) }];
      }),
    ),
  );
};

/** The values of `flags` in `args`, whether written `--flag=a,b`, `-f a,b`, or `-f a b`. */
const flagValues = (args: readonly string[], flags: ReadonlySet<string>): string[] =>
  args.flatMap((token, index) => {
    const equals = token.indexOf('=');
    if (!flags.has(equals === -1 ? token : token.slice(0, equals))) {
      return [];
    }

    const rest = args.slice(index + 1);
    const next = rest.findIndex((value) => value.startsWith('-'));
    const values = equals === -1 ? rest.slice(0, next === -1 ? rest.length : next) : [token.slice(equals + 1)];
    return values.flatMap((value) => value.split(','));
  });

/**
 * The violations in `files`, plus how many `nx` invocations were read (a gate
 * that silently parsed nothing is a gate that passes everything).
 */
export const validateWorkflows = (
  workspaceValue: Workspace,
  files: readonly WorkflowFile[],
): { readonly violations: string[]; readonly invocations: number } => {
  const invocations = files.flatMap((file) => nxInvocations(file));
  const known = new Set(workspaceValue.projects.flatMap((project) => project.targets));
  const tools = new Set(projects(workspaceValue, 'tag:type:tool').map((project) => project.name));
  const violations: string[] = [];

  for (const { file, job, args } of invocations) {
    const named = flagValues(args, PROJECT_FLAGS);
    const referenced = flagValues(args, TARGET_FLAGS);
    const [command, second] = [args.slice(0, 1).join(''), args.slice(1, 2).join('')];

    if (command === 'run') {
      // `nx run <project>:<target>`, the one place a project name may stand —
      // and only when it is a tool.
      const project = second.replace(/:.*/su, '');
      referenced.push(second.split(':').slice(1).join(':'));
      if (!tools.has(project)) {
        named.push(project);
      }
    } else if (command !== '' && !command.startsWith('-') && !SUBCOMMANDS.has(command)) {
      // `nx <target> <project>`, e.g. `nx test api`.
      referenced.push(command);
      named.push(...(second.startsWith('-') ? [] : [second]));
    }

    for (const value of named) {
      if (!isSelector(value) && value !== '') {
        violations.push(
          `${file} (job ${job}): \`${value}\` is a project name — use a target, a tag: selector, or nx affected`,
        );
      }
    }

    for (const value of referenced) {
      if (!known.has(value)) {
        violations.push(`${file} (job ${job}): target \`${value}\` exists on no project`);
      }
    }
  }

  return { violations, invocations: invocations.length };
};

/** The in-scope workflows, read from the repository root. */
export const readWorkflows = (): WorkflowFile[] =>
  WORKFLOW_PATHS.map((path) => ({
    path,
    text: readFileSync(resolve(import.meta.dirname, '../..', path), 'utf8'),
  }));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = readWorkflows();
  const { violations, invocations } = validateWorkflows(await workspace({ fresh: true }), files);

  if (violations.length > 0) {
    console.error(`Workflows name projects (${violations.length}):`);
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }

    process.exit(1);
  }

  console.log(`✓ ${files.length} workflow(s), ${invocations} nx invocation(s), no project names`);
}
