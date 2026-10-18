#!/usr/bin/env node

/**
 * Purpose: The `tau-python-kernel` command @taucad/python-kernel-core publishes: one entry to a Python kernel
 * package's generators and its Python test run, for a package outside the Tau repository as for one inside it.
 * Why: A Python kernel's `tau-plugin.json`, pinned `tau_kernel` copy, SBOM, project template and golden receipts come
 * from these generators; publishing them lets a third-party author keep a kernel current without a Tau checkout.
 * Environment: Node 24+. The package's `/native` entry is imported, so a TypeScript entry needs a TypeScript loader
 * (`node --import @oxc-node/core/register`); a built `dist/native.mjs` needs none.
 * Usage:
 *   tau-python-kernel generate --package <dir> [--seed <dir>]     write tau-plugin.json, pylocks, SBOM, tau_kernel copy
 *   tau-python-kernel check --package <dir> [--seed <dir>]        fail when any generated file differs
 *   tau-python-kernel seed --package <dir> [--target <key>]       fill the payload seed
 *   tau-python-kernel golden --package <dir> [--store <dir>]      record this host's golden receipt
 *   tau-python-kernel template --package <dir> [--check]          write (or check) the project template
 *   tau-python-kernel test [--package <dir>] [--python <exe>]     the Python unit tests under the coverage gate
 *   Relative paths, and the default seed and store under out/cache/, resolve against the working directory.
 * Exit codes: 0 on success; 1 on a failed check, download, digest, lock or test; 2 on an unknown command.
 */

// oxlint-disable-next-line no-restricted-imports -- The bin's sibling commands; scripts have no `#` alias.
import { runGenerateProjectTemplate } from './generate-project-template.mjs';
// oxlint-disable-next-line no-restricted-imports -- The bin's sibling commands; scripts have no `#` alias.
import { runGenerateTauPlugin } from './generate-tau-plugin.mjs';
// oxlint-disable-next-line no-restricted-imports -- The bin's sibling commands; scripts have no `#` alias.
import { runTestPython } from './test-python.mjs';

const usage = 'Usage: tau-python-kernel <generate|check|seed|golden|template|test> [--package <dir>] [options]';

const commands: Readonly<Record<string, (argv: readonly string[]) => Promise<void>>> = {
  generate: async (argv) => runGenerateTauPlugin(argv),
  check: async (argv) => runGenerateTauPlugin([...argv, '--check']),
  seed: async (argv) => runGenerateTauPlugin(['seed', ...argv]),
  golden: async (argv) => runGenerateTauPlugin(['golden', ...argv]),
  template: async (argv) => runGenerateProjectTemplate(argv),
  test: async (argv) => runTestPython(argv),
};

const [command, ...argv] = process.argv.slice(2);
const run = command === undefined ? undefined : commands[command];
if (run === undefined) {
  console.error(usage);
  process.exitCode = 2;
} else {
  await run(argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
