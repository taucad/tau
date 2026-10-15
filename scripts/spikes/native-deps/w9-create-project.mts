#!/usr/bin/env node

/**
 * Purpose: Lane W9 oracle (native dependency charter, D34, D35, I14): write the project Tau creates for a kernel into
 *   a bare directory, exactly as the UI's `createInitialProject` makes it, so the ecosystem's own tools can run it.
 * Why: The ownership promise is that a created project runs outside Tau from its own files. The W9 workflow runs
 *   `uv sync --locked` + `uv run main.py` (build123d) and `dotnet restore --locked-mode` + `dotnet run` (PicoGK) on
 *   this output; W23 replaces it with the standalone-project check.
 * Environment: Node 24+, run from the repository root.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/w9-create-project.mts --kernel <id> --name <name> --out <dir>
 * Exit codes: 0 when the project was written; 1 on an unknown kernel or a write failure.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

/* oxlint-disable no-restricted-imports -- spike-only: the UI's project factory and the kernel catalog by relative path; deleted with W23. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- spike-only: the UI factory is not a package export.
import { createInitialProject } from '../../../apps/ui/app/constants/project.constants.ts';
// eslint-disable-next-line @nx/enforce-module-boundaries -- spike-only: the catalog's source module.
import { kernelConfigurations } from '../../../libs/types/src/constants/kernel.constants.ts';
import { parseFlags, requiredFlag } from './spike-common.mts';
/* oxlint-enable no-restricted-imports */

const flags = parseFlags(['kernel', 'name', 'out']);
const kernelId = requiredFlag(flags, 'kernel');
const out = resolve(requiredFlag(flags, 'out'));
const configuration = kernelConfigurations.find(({ id }) => id === kernelId);
if (configuration === undefined) {
  console.error(`Unknown kernel ${kernelId}.`);
  process.exit(1);
}

/** The template files `getKernelProjectTemplate` imports in the UI, read from the plugin package here. */
const templates: Readonly<Record<string, readonly string[]>> = {
  build123d: ['pyproject.toml', 'pylock.toml', 'uv.lock'],
  picogk: ['project.csproj', 'packages.lock.json'],
};
const templateFiles = templates[kernelId];
const template =
  templateFiles === undefined
    ? undefined
    : Object.fromEntries(
        templateFiles.map((file) => [file, readFileSync(join('packages/plugins', kernelId, 'project', file), 'utf8')]),
      );

const { files } = createInitialProject({
  projectName: requiredFlag(flags, 'name'),
  mainFileName: configuration.mainFile,
  emptyCodeContent: new TextEncoder().encode(configuration.emptyCode),
  ecosystem: configuration.ecosystem,
  template,
});
for (const [path, { content }] of Object.entries(files)) {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), content);
}
console.log(`${configuration.name} project written to ${out}: ${Object.keys(files).sort().join(', ')}`);
