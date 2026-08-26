// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const pluginsRoot = join(repositoryRoot, 'packages/plugins');

it('lists every first-party kernel package by its manifest name', () => {
  const documentedPackageNames = readFileSync(
    new URL('../../content/docs/runtime/api/kernels.mdx', import.meta.url),
    'utf8',
  )
    .split('\n')
    .flatMap((line) => {
      const packageCell = line.split('|')[1]?.trim();
      return packageCell?.startsWith('`@taucad/') && packageCell.endsWith('`') ? [packageCell.slice(1, -1)] : [];
    })
    .sort();
  const kernelPackageNames = readdirSync(pluginsRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        readdirSync(join(pluginsRoot, entry.name, 'src')).some((name) => name.endsWith('.kernel.ts')),
    )
    .map((entry) => {
      const manifest = JSON.parse(readFileSync(join(pluginsRoot, entry.name, 'package.json'), 'utf8')) as {
        name: string;
      };
      return manifest.name;
    })
    .sort();

  expect(documentedPackageNames).toEqual(kernelPackageNames);
});
