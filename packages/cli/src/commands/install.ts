import { createHash } from 'node:crypto';
import { mkdir, realpath, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { createPackageManifestCommit, installPackages, materializePackages } from '@taucad/bundler-core';
import type { BundlerFileSystem, PackageIssue } from '@taucad/bundler-core';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, NodeFsProvider, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { defaultConfigDirectory } from '@taucad/host';
import { defineCommand } from 'citty';

import { cliError, createOutput, exitCodes, sanitize, writeStdout } from '#output.js';

// Issues that leave a usable tree: Tau never runs scripts and never materialises native builds.
const warningCodes = new Set<PackageIssue['code']>(['install-script-skipped', 'package-unavailable-in-host']);

// Citty keeps only the last value of a repeated flag, so every occurrence is read from argv.
const repeated = (rawArgs: readonly string[], flag: string): string[] =>
  rawArgs.flatMap((argument, index) => {
    const value =
      argument === `--${flag}`
        ? rawArgs[index + 1]
        : argument.startsWith(`--${flag}=`)
          ? argument.slice(flag.length + 3)
          : undefined;
    return value === undefined ? [] : [value];
  });

// `name@range`; the first `@` after a scope marker splits, so `x@npm:@scope/y@1` keeps its alias spec.
const parseAdd = (spec: string): readonly [string, string] => {
  const at = spec.indexOf('@', 1);
  if (at === -1 || at === spec.length - 1) {
    throw cliError('ARG_ADD_INVALID', `--add ${spec}: pass name@range, for example is-number@^7.`, exitCodes.usage);
  }
  return [spec.slice(0, at), spec.slice(at + 1)];
};

const refuse = (issues: readonly PackageIssue[]): Error =>
  cliError(
    issues[0]?.code ?? 'INSTALL_FAILED',
    `Install failed:\n  ${issues.map((issue) => sanitize(`${issue.code}: ${issue.message}`)).join('\n  ')}`,
    { exit: exitCodes.refused, details: issues },
  );

/**
 * `tau install` command.
 *
 * Resolves package.json into package-lock.json (lockfileVersion 3) and installs the locked registry tarballs into
 * node_modules, verified against the lock's integrity. The same installer the app and the `install_packages` agent
 * tool run; lifecycle scripts never run and no host package manager is spawned.
 *
 * @example <caption>Install, add, remove and upgrade</caption>
 * ```bash
 * tau install
 * tau install ./my-project --add simplex-noise@^4 --add d3-shape@^3
 * tau install --remove alea
 * tau install --upgrade d3-shape
 * ```
 */
export const installCommand = defineCommand({
  meta: {
    name: 'install',
    description: 'Lock and install a project’s npm packages (package-lock.json + node_modules)',
  },
  args: {
    dir: {
      type: 'positional',
      description: 'Project directory containing package.json (defaults to the current directory)',
      required: false,
    },
    add: {
      type: 'string',
      description: 'Add or change a dependency as name@range (repeatable)',
      required: false,
    },
    remove: {
      type: 'string',
      description: 'Remove a dependency by name (repeatable)',
      required: false,
    },
    upgrade: {
      type: 'string',
      description: 'Resolve this package afresh instead of keeping its locked version (repeatable)',
      required: false,
    },
  },
  async run({ args, rawArgs }) {
    const output = await createOutput();
    const add = Object.fromEntries(repeated(rawArgs, 'add').map((spec) => parseAdd(spec)));
    const remove = repeated(rawArgs, 'remove');
    const upgrade = repeated(rawArgs, 'upgrade');
    let root: string;
    try {
      root = await realpath(resolve(args.dir ?? process.cwd()));
    } catch {
      throw cliError('NO_PROJECT', `${resolve(args.dir ?? process.cwd())} does not exist.`, exitCodes.refused);
    }

    // The same per-project authority directory `tau serve` uses, so the two never write package files at once.
    const authorityRoot = join(
      defaultConfigDirectory(),
      'filesystem-authority',
      createHash('sha256').update(root).digest('hex'),
    );
    await mkdir(authorityRoot, { recursive: true, mode: 0o700 });
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const ports = new MessageChannel();
    const stop = serveNodeFsProvider(ports.port2, {
      authority,
      policy: tauPathPolicy,
      allowRoot: (candidate) => candidate === root,
    });
    const channel = new NodeFsChannel(ports.port1);
    const files = new NodeFsProvider(root);
    const nodeModules = join(root, 'node_modules') + sep;
    const filesystem: BundlerFileSystem = {
      exists: async (path) => files.exists(path),
      readFile: files.readFile.bind(files),
      writeFile: async (path, content) => files.writeFile(path, content),
      ensureDir: async (path) => files.mkdir(path, { recursive: true }),
      async remove(path) {
        const target = join(root, path);
        if (!target.startsWith(nodeModules)) {
          throw new Error(`Refusing to remove '${path}': only node_modules entries are removed.`);
        }
        await rm(target, { recursive: true, force: true });
      },
    };
    const { signal } = new AbortController();
    try {
      const installed = await installPackages({
        filesystem,
        commit: createPackageManifestCommit({ authority: new NodeFsProviderClient(channel, root), signal }),
        mode: upgrade.length > 0 ? 'upgrade' : 'install',
        add,
        remove,
        ...(upgrade.length > 0 ? { upgrade } : {}),
        signal,
      });
      if (installed.lock === undefined) {
        throw refuse(installed.issues);
      }
      const tree = await materializePackages({ filesystem, lock: installed.lock, signal });
      const failures = tree.issues.filter((issue) => !warningCodes.has(issue.code));
      if (failures.length > 0) {
        throw refuse(failures);
      }
      for (const issue of tree.issues) {
        output.warn(sanitize(`${issue.code}: ${issue.message}`));
      }
      const locked = Object.keys(installed.lock.packages).length - 1;
      await writeStdout(
        `${String(locked)} packages locked${installed.lockChanged ? ' (package-lock.json updated)' : ''}; ${String(tree.installed.length)} installed, ${String(tree.skipped.length)} already present.\n`,
      );
    } finally {
      channel.close();
      await stop();
      ports.port2.close();
    }
  },
});
