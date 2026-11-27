#!/usr/bin/env node
// `formal` command line: node tools/formal/src/cli.ts <command> [...]. See tools/formal/README.md.
import { parseArgs } from 'node:util';
import path from 'node:path';
import { checkProject, mutantsProject, nightlyProject, updateProject } from '#check.js';
import type { Tier } from '#expected.js';
import { describeOutcome, findExpectedFiles, knownFailures, specProjectRoots } from '#expected.js';
import type { SetupTool } from '#setup.js';
import { validateCapturedLogs } from '#logs.js';
import type { MutantShard } from '#mutant-shard.js';
import { parseMutantShard } from '#mutant-shard.js';
import { setup } from '#setup.js';
import { parseShard } from '#shard.js';
import type { FormalContext } from '#toolchain.js';
import { defaultContext, locateTools, toolchainId } from '#toolchain.js';

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

/** `nightly`'s parts (`--without-check`, `--without-mutants`, `--mutants-only`) and a mutant shard (`--shard k/N`). */
type NightlyFlags = {
  readonly check: boolean;
  readonly lean: boolean;
  readonly mutants: boolean;
  readonly shard?: MutantShard;
};

/** The commands that take one project root. */
const projectCommands: Readonly<
  Record<string, (context: FormalContext, projectRoot: string, options: NightlyFlags) => number | Promise<number>>
> = {
  update: async (context, projectRoot) => updateProject(context, projectRoot),
  mutants: async (context, projectRoot, { shard }) => mutantsProject(context, projectRoot, shard ? { shard } : {}),
  nightly: async (context, projectRoot, flags) => nightlyProject(context, projectRoot, flags),
};

const main = async (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: [...rest],
    allowPositionals: true,
    options: {
      tools: { type: 'string' },
      from: { type: 'string' },
      tier: { type: 'string' },
      family: { type: 'string' },
      shard: { type: 'string' },
      'without-check': { type: 'boolean' },
      'without-mutants': { type: 'boolean' },
      'mutants-only': { type: 'boolean' },
    },
  });
  const context = defaultContext();
  const projectCommand = command === undefined ? undefined : projectCommands[command];
  if (projectCommand) {
    const [projectRoot] = positionals;
    const only = values['mutants-only'] === true;
    const shard = values.shard === undefined ? undefined : parseMutantShard(values.shard);
    // A shard deals mutants: `mutants`, or `nightly --mutants-only`, whose other parts run in another job.
    const shardable = command === 'mutants' || (command === 'nightly' && only);
    if (!projectRoot || (values.shard !== undefined && (shard === undefined || !shardable))) {
      out(
        `usage: formal ${command} ${command === 'nightly' ? '[--without-check] [--without-mutants] [--mutants-only [--shard <k>/<n>]] ' : ''}<projectRoot>`,
      );
      return 2;
    }
    return projectCommand(context, path.resolve(context.root, projectRoot), {
      check: values['without-check'] !== true && !only,
      lean: !only,
      mutants: values['without-mutants'] !== true,
      ...(shard === undefined ? {} : { shard }),
    });
  }
  switch (command) {
    case 'setup': {
      const tools = (values.tools ?? 'tlc,lean').split(',').filter(Boolean) as SetupTool[];
      await setup(context, { tools, ...(values.from ? { from: values.from } : {}) });
      return 0;
    }
    case 'check': {
      const [projectRoot] = positionals;
      const shard = values.shard === undefined ? undefined : parseShard(values.shard);
      if (!projectRoot || (values.shard !== undefined && shard === undefined)) {
        out('usage: formal check --tier pr|nightly|lean [--family <family>] [--shard <k>/<n>] <projectRoot>');
        return 2;
      }
      return checkProject(context, {
        tier: (values.tier ?? 'pr') as Tier | 'lean',
        projectRoot: path.resolve(context.root, projectRoot),
        ...(values.family === undefined ? {} : { family: values.family }),
        ...(shard === undefined ? {} : { shard }),
      });
    }
    case 'known': {
      const roots =
        positionals.length > 0
          ? positionals.map((root) => path.resolve(context.root, root))
          : specProjectRoots(context.root);
      for (const row of knownFailures(
        roots.flatMap((root) => findExpectedFiles(root)),
        context.root,
      )) {
        const { expectation } = row;
        out(
          `${row.where}\t${row.name}\t${expectation.tier}\t${expectation.kind ?? '-'}\t${describeOutcome(expectation.expect)}\t${expectation.ref ?? ''}\t${expectation.fixedBy ?? ''}`,
        );
      }
      return 0;
    }
    case 'logs': {
      const [project] = positionals;
      if (!project) {
        out('usage: formal logs <project>');
        return 2;
      }
      return validateCapturedLogs(context, { project });
    }
    case 'toolchain-id': {
      out(toolchainId(locateTools(context)));
      return 0;
    }
    default: {
      out(
        `usage: formal <setup|check|logs|update|mutants|nightly|known|toolchain-id> …; got ${String(command)} ${positionals.join(' ')}`,
      );
      return 2;
    }
  }
};

process.exitCode = await main(process.argv.slice(2));
