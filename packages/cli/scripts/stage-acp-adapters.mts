/**
 * Purpose: Stage the pinned ACP adapters, with their runtime dependency closure, into `dist-acp`.
 * Why: `tau serve` spawns each adapter as `node <modulePath>`. Staging copies them the way the
 * desktop app does: optional dependencies are not followed, so the vendor `claude` and `codex`
 * binaries the adapters would otherwise install (about 640 MB) stay out of the package, and each
 * adapter runs the user's own CLI instead (`executableEnv` in `@taucad/host`).
 * Environment: Node with the workspace install; run from anywhere.
 * Usage: node --import @oxc-node/core/register packages/cli/scripts/stage-acp-adapters.mts
 * Exit codes: 0 staged; 1 an adapter is missing or not at its pin.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';

import { acpAgentProfiles } from '@taucad/host';
import { copyRuntimeClosure } from '@taucad/nx/runtime-closure';

type StagedManifest = {
  readonly name: string;
  readonly version: string;
  readonly license?: string;
  readonly homepage?: string;
};

const cliRoot = resolve(import.meta.dirname, '..');
const stageRoot = resolve(cliRoot, 'dist-acp');
const modulesRoot = resolve(stageRoot, 'node_modules');
const require = createRequire(resolve(cliRoot, 'package.json'));
const patchesRoot = resolve(cliRoot, '../../tools/pnpm/patches');

/** Whether the workspace install patched this exact package, which the staged copy then carries. */
const isPatched = (manifest: StagedManifest): boolean =>
  existsSync(resolve(patchesRoot, `${manifest.name.replace('/', '__')}@${manifest.version}.patch`));

/* Bundler and declaration source maps are build diagnostics nothing loads at run time. */
const excludesSourceMaps = (path: string): boolean => !/\.(?:[cm]?[jt]s|css)\.map$/u.test(basename(path));

/** Every staged package root, nested ones included, in a stable order. */
const stagedPackages = (directory: string): readonly StagedManifest[] => {
  const found: StagedManifest[] = [];
  const visit = (modules: string): void => {
    const entries = existsSync(modules) ? readdirSync(modules, { withFileTypes: true }) : [];
    for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
      const roots = entry.name.startsWith('@')
        ? readdirSync(join(modules, entry.name), { withFileTypes: true })
            .filter((candidate) => candidate.isDirectory())
            .map((candidate) => join(modules, entry.name, candidate.name))
        : [join(modules, entry.name)];
      for (const root of roots) {
        found.push(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as StagedManifest);
        visit(join(root, 'node_modules'));
      }
    }
  };
  visit(directory);
  return found;
};

const adapters = acpAgentProfiles.flatMap((profile) =>
  profile.package === undefined ? [] : [{ name: profile.package, version: profile.version }],
);

await rm(stageRoot, { recursive: true, force: true });
await mkdir(modulesRoot, { recursive: true });
for (const { name, version } of adapters) {
  // oxlint-disable-next-line no-await-in-loop -- Each adapter is checked against its pin before it is staged.
  const source = await realpath(dirname(require.resolve(`${name}/package.json`)));
  // oxlint-disable-next-line no-await-in-loop -- see above.
  const installed = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')) as StagedManifest;
  if (installed.version !== version) {
    console.error(`${name} is installed at ${installed.version}; @taucad/host pins ${version}.`);
    process.exit(1);
  }
  /* Serial: the closure nests one package inside another, so two adapters
   * racing on the same staged directories would make the layout undecidable. */
  // oxlint-disable-next-line no-await-in-loop -- see above.
  await copyRuntimeClosure({ name, source, modulesRoot, filter: excludesSourceMaps });
}

const staged = stagedPackages(modulesRoot);
const unique = [...new Map(staged.map((manifest) => [`${manifest.name}@${manifest.version}`, manifest])).values()].sort(
  (a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
);
await writeFile(
  resolve(stageRoot, 'package.json'),
  `${JSON.stringify(
    {
      name: '@taucad/cli-acp-adapters',
      private: true,
      type: 'module',
      description: 'The ACP adapters `tau serve` starts, staged without their vendor binaries.',
      dependencies: Object.fromEntries(adapters.map(({ name, version }) => [name, version])),
    },
    undefined,
    2,
  )}\n`,
);
await writeFile(
  resolve(stageRoot, 'THIRD_PARTY_NOTICES.md'),
  [
    '# Third-party notices: ACP adapters',
    '',
    'These packages are redistributed so `tau serve` can start Claude Code and Codex. Each keeps its own',
    'license file in its directory under `node_modules`; the license named here is the one its manifest',
    'declares. A patched package carries the patch published at',
    '<https://github.com/taucad/tau/tree/main/tools/pnpm/patches>.',
    '',
    '| Package | Version | License | Modified |',
    '| --- | --- | --- | --- |',
    ...unique.map(
      (manifest) =>
        `| ${manifest.name} | ${manifest.version} | ${(manifest.license ?? 'UNLICENSED').replaceAll('|', String.raw`\|`)} | ${isPatched(manifest) ? 'patched' : 'no'} |`,
    ),
    '',
  ].join('\n'),
);
console.log(`Staged ${String(adapters.length)} ACP adapters (${String(unique.length)} packages) into ${stageRoot}.`);
