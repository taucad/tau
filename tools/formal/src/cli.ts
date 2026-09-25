#!/usr/bin/env node
// `formal` command line: node tools/formal/src/cli.ts <command> [...]. See tools/formal/README.md.
import { parseArgs } from 'node:util';
import path from 'node:path';
import { checkProject, mutantsProject, nightlyProject, updateProject } from '#check.js';
import type { Tier } from '#expected.js';
import { describeOutcome, findExpectedFiles, knownFailures, specProjectRoots } from '#expected.js';
import type { SetupTool } from '#setup.js';
import { validateCapturedLogs } from '#logs.js';
import { setup } from '#setup.js';
import { defaultContext, locateTools, toolchainId } from '#toolchain.js';

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
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
    },
  });
  const context = defaultContext();
  switch (command) {
    case 'setup': {
      const tools = (values.tools ?? 'tlc,lean').split(',').filter(Boolean) as SetupTool[];
      await setup(context, { tools, ...(values.from ? { from: values.from } : {}) });
      return 0;
    }
    case 'check': {
      const [projectRoot] = positionals;
      if (!projectRoot) {
        out('usage: formal check --tier pr|nightly|lean <projectRoot>');
        return 2;
      }
      return checkProject(context, {
        tier: (values.tier ?? 'pr') as Tier | 'lean',
        projectRoot: path.resolve(context.root, projectRoot),
      });
    }
    case 'update': {
      const [projectRoot] = positionals;
      if (!projectRoot) {
        out('usage: formal update <projectRoot>');
        return 2;
      }
      return updateProject(context, path.resolve(context.root, projectRoot));
    }
    case 'mutants': {
      const [projectRoot] = positionals;
      if (!projectRoot) {
        out('usage: formal mutants <projectRoot>');
        return 2;
      }
      return mutantsProject(context, path.resolve(context.root, projectRoot));
    }
    case 'nightly': {
      const [projectRoot] = positionals;
      if (!projectRoot) {
        out('usage: formal nightly <projectRoot>');
        return 2;
      }
      return nightlyProject(context, path.resolve(context.root, projectRoot));
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
