/**
 * Post-publish acceptance for the npm release train (`publish.yml`): the released `@taucad/cli` and
 * `@taucad/agent-plugin` install from the registry into clean global prefixes and start on the npm users have.
 *
 * - npm 11, the one Node.js 24 bundles, with install scripts blocked (`--ignore-scripts`, the state npm 12 leaves
 *   unreviewed packages in): `tau --version`, the plugin's three manifests and the server's `serverInfo` carry
 *   the released version, and the plugin's launcher, started as Claude Code starts it, runs the installed `tau`
 *   (an `npx` that always fails is first on `PATH`) and evaluates a replicad block.
 * - npm 12 with its default script policy: the install succeeds, `install-scripts` appears only in warnings,
 *   and the same session passes.
 * - Node.js 22: the launcher, with no `tau` of its version on `PATH`, exits 2 with its one `tau:` line.
 *
 * A dependency that needs its install script, a CLI that cannot start under the plugin, or a version skew
 * between the two fails the run. It installs from the registry only and publishes nothing.
 *
 * Usage: node scripts/src/verify-published-packages.ts --node22 <Node.js 22 binary> [--version <version>]
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { mcpSession } from '#check-pack-install-cli.js';

const cliName = '@taucad/cli';
const pluginName = '@taucad/agent-plugin';

/**
 * How long the registry may take to serve every package `nx release publish` just published: one version has
 * been seen to answer `npm view` about 12 minutes after its publish.
 */
const registryWait = 25 * 60_000;
const registryPoll = 20_000;

/** The exit line the launcher writes on Node.js 22 before it would fetch the CLI with `npx`. */
const oldNodeLine = /^tau: Node\.js 22\.\d+\.\d+ started this plugin; install Node\.js 24 or later\n$/u;

type Outcome = { readonly status: number | undefined; readonly stdout: string; readonly stderr: string };

/**
 * The released packages a CLI install resolves at pinned versions: its `@taucad/*` and `geospec` dependencies.
 * @param dependencies - What `npm view @taucad/cli@<version> dependencies --json` printed.
 * @returns Each such dependency and the version it pins.
 */
export const releasedPins = (dependencies: Readonly<Record<string, string>>): Array<readonly [string, string]> =>
  Object.entries(dependencies).filter(([name]) => name.startsWith('@taucad/') || name === 'geospec');

/**
 * Name the first line that mentions npm's install-script policy without being a warning.
 * @param log - npm's combined output for one install.
 * @returns The offending line, or `undefined` when every mention is an `npm warn` line.
 */
export const installScriptsNotWarned = (log: string): string | undefined =>
  log.split('\n').find((line) => line.includes('install-scripts') && !line.startsWith('npm warn'));

/**
 * The major version in a semver string such as `11.19.0`.
 * @param version - What `npm --version` printed.
 * @returns The major version, or `NaN` when the text is not a version.
 */
export const majorOf = (version: string): number => Number(/^(\d+)\./u.exec(version.trim())?.[1] ?? Number.NaN);

const run = (
  command: string,
  args: readonly string[],
  options: {
    readonly env: NodeJS.ProcessEnv;
    readonly cwd?: string;
    /** Milliseconds. */ readonly runTimeout?: number;
  },
): Outcome => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.runTimeout ?? 15 * 60_000,
  });
  return {
    status: result.status ?? undefined,
    stdout: result.stdout,
    stderr: `${result.error?.message ?? ''}${result.stderr}`,
  };
};

const required = (label: string, outcome: Outcome): string => {
  if (outcome.status !== 0) {
    throw new Error(`${label} exited ${String(outcome.status)}:\n${`${outcome.stdout}${outcome.stderr}`.slice(-4000)}`);
  }
  return outcome.stdout.trim();
};

const readVersion = (path: string): unknown =>
  (JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }).version;

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { version: { type: 'string' }, node22: { type: 'string' } } });
  const repository = resolve(import.meta.dirname, '../..');
  const version = values.version ?? String(readVersion(join(repository, 'packages/cli/package.json')));
  const { node22 } = values;
  if (node22 === undefined) {
    throw new Error('Pass --node22 <path to a Node.js 22 node binary> for the launcher exit check.');
  }
  const nodeBin = dirname(process.execPath);
  const root = mkdtempSync(join(tmpdir(), 'tau-published-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const failingNpx = join(root, 'failing-npx');
  for (const directory of [home, project, failingNpx]) {
    mkdirSync(directory);
  }
  // An installed `tau` of the plugin's version must serve the plugin; reaching `npx` fails the session.
  writeFileSync(join(failingNpx, 'npx'), '#!/bin/sh\necho "tau check: the launcher ran npx" >&2\nexit 97\n');
  chmodSync(join(failingNpx, 'npx'), 0o755);
  writeFileSync(
    join(project, 'main.ts'),
    "import { makeBaseBox } from 'replicad';\nexport default () => makeBaseBox(10, 20, 30);\n",
  );
  const environment = (path: readonly string[]): NodeJS.ProcessEnv => ({
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('TAU_'))),
    /* eslint-disable @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE. */
    PATH: [...path, '/usr/bin', '/bin'].join(delimiter),
    HOME: home,
    TAU_CONFIG_DIR: join(home, '.tau'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_DATA_HOME: join(home, '.local/share'),
    npm_config_cache: join(root, 'npm-cache'),
    npm_config_update_notifier: 'false',
    /* eslint-enable @typescript-eslint/naming-convention -- End of the environment names. */
  });
  let passed = false;
  try {
    const npm11 = environment([nodeBin]);
    const npm11Version = required('npm --version', run('npm', ['--version'], { env: npm11 }));
    if (majorOf(npm11Version) !== 11) {
      throw new Error(`Node.js ${process.version} bundles npm ${npm11Version}, not npm 11.`);
    }
    const deadline = Date.now() + registryWait;
    /** Poll `npm view <spec> <field>` until it prints `expected`, within the one registry deadline. */
    const served = async (spec: string, field: string, expected: string): Promise<void> => {
      const view = (): string => run('npm', ['view', '--prefer-online', spec, field], { env: npm11 }).stdout.trim();
      while (view() !== expected) {
        if (Date.now() > deadline) {
          throw new Error(
            `The registry did not serve ${spec} ${field} ${expected} within ${String(registryWait / 60_000)} min.`,
          );
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- Waiting is the point of the loop.
        await delay(registryPoll);
      }
    };
    await served(`${cliName}@${version}`, 'version', version);
    const dependencies = JSON.parse(
      required(
        `npm view ${cliName}@${version} dependencies`,
        run('npm', ['view', '--prefer-online', `${cliName}@${version}`, 'dependencies', '--json'], { env: npm11 }),
      ),
    ) as Record<string, string>;
    const pins = [...releasedPins(dependencies), [pluginName, version] as const];
    for (const [name, pinned] of pins) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- One registry poll at a time.
      await served(`${name}@${pinned}`, 'version', pinned);
    }
    await served(cliName, 'dist-tags.beta', version);
    await served(pluginName, 'dist-tags.beta', version);
    console.log(
      `Registry serves ${cliName}@${version}, its ${String(pins.length - 1)} released dependencies at their pins and ${pluginName}@${version}; beta points at ${version} for both.`,
    );

    /** Install both packages into a fresh prefix, then start the plugin as a host does and evaluate a block. */
    const installAndStart = async ({
      label,
      prefix,
      npm,
      npmBin,
      scripts,
    }: {
      readonly label: string;
      readonly prefix: string;
      readonly npm: string;
      readonly npmBin: readonly string[];
      readonly scripts: readonly string[];
    }) => {
      const installEnvironment = environment([...npmBin, nodeBin]);
      const started = Date.now();
      const installed = run(
        npm,
        ['install', '--global', `--prefix=${prefix}`, '--no-audit', '--no-fund', ...scripts, `${cliName}@${version}`],
        { env: installEnvironment },
      );
      const log = `${installed.stdout}${installed.stderr}`;
      required(`${label}: npm install -g ${cliName}@${version}`, installed);
      required(
        `${label}: npm install -g ${pluginName}@${version}`,
        run(npm, ['install', '--global', `--prefix=${prefix}`, '--no-audit', '--no-fund', `${pluginName}@${version}`], {
          env: installEnvironment,
        }),
      );
      console.log(`${label}: installed both packages in ${String(Math.round((Date.now() - started) / 1000))} s.`);
      const bin = join(prefix, 'bin');
      const tauVersion = required(`${label}: tau --version`, run(join(bin, 'tau'), ['--version'], { env: npm11 }));
      const pluginRoot = join(prefix, 'lib/node_modules', pluginName);
      const versions = {
        'tau --version': tauVersion,
        [`${pluginName} package.json`]: readVersion(join(pluginRoot, 'package.json')),
        '.claude-plugin/plugin.json': readVersion(join(pluginRoot, '.claude-plugin/plugin.json')),
        '.codex-plugin/plugin.json': readVersion(join(pluginRoot, '.codex-plugin/plugin.json')),
      };
      const skewed = Object.entries(versions).filter(([, found]) => found !== version);
      if (skewed.length > 0) {
        throw new Error(
          `${label}: not ${version}: ${skewed.map(([what, found]) => `${what} ${String(found)}`).join(', ')}`,
        );
      }
      const sessionStarted = Date.now();
      const session = await mcpSession({
        command: process.execPath,
        args: [join(pluginRoot, 'dist/launch.mjs')],
        project,
        environment: environment([failingNpx, bin, nodeBin]),
        call: { name: 'evaluate_model', arguments: { targetFile: 'main.ts' } },
      });
      const server = session.initialized.serverInfo;
      if (server?.name !== '@taucad/mcp' || server.version !== version) {
        throw new Error(`${label}: the launcher's server is ${server?.name ?? '?'} ${server?.version ?? '?'}.`);
      }
      const evaluated = session.called;
      if (evaluated === undefined) {
        throw new Error(`${label}: the server listed no evaluate_model; it listed ${session.tools.join(', ')}.`);
      }
      if (evaluated.isError === true || evaluated.structuredContent?.status !== 'ready') {
        const text = (evaluated.content ?? []).map((block) => block.text ?? '').join('\n');
        throw new Error(`${label}: evaluate_model main.ts did not report ready:\n${text.slice(-4000)}`);
      }
      console.log(
        `${label}: the launcher ran the installed tau ${version}; @taucad/mcp listed ${String(session.tools.length)} tools and evaluated main.ts in ${String(Math.round((Date.now() - sessionStarted) / 1000))} s.`,
      );
      return log;
    };

    const blockedPrefix = join(root, 'prefix-npm11');
    await installAndStart({
      label: 'npm 11, scripts blocked',
      prefix: blockedPrefix,
      npm: 'npm',
      npmBin: [],
      scripts: ['--ignore-scripts'],
    });
    const pluginRoot = join(blockedPrefix, 'lib/node_modules', pluginName);
    // Node.js 22 with no `tau` of the plugin's version reachable: the launcher stops before `npx`.
    const old = run(node22, [join(pluginRoot, 'dist/launch.mjs')], {
      cwd: project,
      env: environment([dirname(node22)]),
      runTimeout: 60_000,
    });
    if (old.status !== 2 || !oldNodeLine.test(old.stderr)) {
      throw new Error(
        `Node.js 22: the launcher exited ${String(old.status)}, not 2 with its tau: line:\n${old.stderr}`,
      );
    }
    console.log(`Node.js 22: the launcher exits 2 with ${JSON.stringify(old.stderr.trim())}.`);
    rmSync(blockedPrefix, { recursive: true, force: true });

    const npm12Prefix = join(root, 'npm12');
    required(
      'npm install -g npm@12',
      run('npm', ['install', '--global', `--prefix=${npm12Prefix}`, '--no-audit', '--no-fund', 'npm@12'], {
        env: npm11,
      }),
    );
    const npm12Bin = join(npm12Prefix, 'bin');
    const npm12 = join(npm12Bin, 'npm');
    const npm12Version = required(
      'npm 12 --version',
      run(npm12, ['--version'], { env: environment([npm12Bin, nodeBin]) }),
    );
    if (majorOf(npm12Version) !== 12) {
      throw new Error(`npm@12 installed npm ${npm12Version}.`);
    }
    const policyLog = await installAndStart({
      label: `npm ${npm12Version}, default script policy`,
      prefix: join(root, 'prefix-npm12'),
      npm: npm12,
      npmBin: [npm12Bin],
      scripts: [],
    });
    const notWarned = installScriptsNotWarned(policyLog);
    if (notWarned !== undefined) {
      throw new Error(`npm ${npm12Version} reported install-scripts outside a warning: ${notWarned}`);
    }
    console.log(
      `npm ${npm12Version}: ${policyLog.includes('install-scripts') ? 'install-scripts appeared only in warnings' : 'no install-scripts lines'}.`,
    );
    console.log(`Published ${cliName}@${version} and ${pluginName}@${version} passed.`);
    passed = true;
  } finally {
    if (passed) {
      rmSync(root, { recursive: true, force: true });
    } else {
      console.error(`Temporary prefixes retained for diagnosis: ${root}`);
    }
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error('Published install check failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
