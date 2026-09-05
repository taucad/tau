import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { FileChange, Tree } from '@nx/devkit';
import { describe, expect, it } from 'vitest';

import { coreGenerator } from '#generators/core/generator.js';
import { packageGenerator } from '#generators/package/generator.js';
import { pluginGenerator } from '#generators/plugin/generator.js';

type ProjectNode = {
  data: {
    root: string;
    targets: Record<string, unknown>;
  };
};

type ProjectExpectation = {
  root: string;
  targets: string[];
  absentTargets: string[];
  ancestorLinks: string[];
};

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const nxTreeModule = join(repositoryRoot, 'node_modules/nx/dist/src/generators/tree.js');

const copy = (source: string, target: string): void => {
  const destination = resolve(target);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(resolve(repositoryRoot, source), destination);
};

const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-generator-inference-'));
  for (const file of [
    'nx.json',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'eslint.config.mjs',
    '.oxlintrc.json',
    'AGENTS.md',
    'packages/AGENTS.md',
    'packages/plugins/AGENTS.md',
    'libs/AGENTS.md',
    'apps/AGENTS.md',
    'apps/libs/AGENTS.md',
    'tools/AGENTS.md',
  ]) {
    copy(file, join(root, file));
  }
  symlinkSync(join(repositoryRoot, 'node_modules'), join(root, 'node_modules'));
  for (const file of ['tsdown.plugin.ts', 'pkgcheck.plugin.ts', 'tsgo.plugin.ts', 'copy-files-from-to.plugin.ts']) {
    copy(`tools/${file}`, join(root, 'tools', file));
  }
  return root;
};

const commandTargets = (instructions: string, projectName: string): string[] =>
  [...instructions.matchAll(/^pnpm nx (?<target>\S+) (?<project>\S+)/gmu)].map(({ groups }) => {
    expect(groups?.['project']).toBe(projectName);
    return groups?.['target'] ?? '';
  });

describe('workspace generator Nx inference', () => {
  it('matches every rendered command to installed Nx inference for each supported placement and creator', async () => {
    const root = fixture();
    const treeModule = (await import(nxTreeModule)) as {
      FsTree: new (root: string, verbose: boolean) => Tree;
      flushChanges: (root: string, changes: FileChange[]) => void;
    };
    const tree = new treeModule.FsTree(root, false);

    try {
      const unchanged = tree.listChanges();
      await Promise.all(
        [
          { name: 'invalid-app-build', scope: 'apps/libs', layer: 'util', build: true } as const,
          { name: 'invalid-public-build', scope: 'packages', build: false } as const,
          { name: 'invalid-public-react', scope: 'packages', react: true } as const,
          { name: 'invalid-public-scope', scope: 'packages', scopeTag: 'ui' } as const,
        ].map(async (invalid) => expect(packageGenerator(tree, invalid)).rejects.toThrow()),
      );
      expect(tree.listChanges()).toEqual(unchanged);

      await packageGenerator(tree, { name: 'inference-published', scope: 'packages', build: true });
      await packageGenerator(tree, { name: 'inference-lib', scope: 'libs', build: true });
      await packageGenerator(tree, {
        name: 'inference-app-lib',
        scope: 'apps/libs',
        scopeTag: 'ui',
        layer: 'data-access',
        react: true,
        build: false,
      });
      await packageGenerator(tree, { name: 'inference-tool', scope: 'tools', build: true });
      await coreGenerator(tree, { name: 'geometry', packageName: '@taucad/geometry-core' });
      await pluginGenerator(tree, {
        name: 'inference-plugin',
        capabilities: ['kernel', 'transcoder'],
        hostTarget: 'browser',
      });
      treeModule.flushChanges(root, tree.listChanges());

      const environment: NodeJS.ProcessEnv = { ...process.env };
      environment['FORCE_COLOR'] = '0';
      environment['NX_DAEMON'] = 'false';
      delete environment['NO_COLOR'];
      const output = execFileSync(join(repositoryRoot, 'node_modules/.bin/nx'), ['graph', '--print'], {
        cwd: root,
        encoding: 'utf8',
        env: environment,
        maxBuffer: 32 * 1024 * 1024,
      });
      const graph = JSON.parse(output) as { graph: { nodes: Record<string, ProjectNode> } };
      const expected: Record<string, ProjectExpectation> = {
        'inference-published': {
          root: 'packages/inference-published',
          targets: ['build', 'lint', 'pkgcheck', 'size', 'test', 'typecheck'],
          absentTargets: [],
          ancestorLinks: ['../../AGENTS.md', '../AGENTS.md'],
        },
        'inference-lib': {
          root: 'libs/inference-lib',
          targets: ['build', 'lint', 'size', 'test', 'typecheck'],
          absentTargets: ['pkgcheck'],
          ancestorLinks: ['../../AGENTS.md', '../AGENTS.md'],
        },
        'inference-app-lib': {
          root: 'apps/libs/inference-app-lib',
          targets: ['lint', 'test', 'typecheck'],
          absentTargets: ['build', 'pkgcheck', 'size'],
          ancestorLinks: ['../../../AGENTS.md', '../../AGENTS.md', '../AGENTS.md'],
        },
        'inference-tool': {
          root: 'tools/inference-tool',
          targets: ['build', 'lint', 'size', 'test', 'typecheck'],
          absentTargets: ['pkgcheck'],
          ancestorLinks: ['../../AGENTS.md', '../AGENTS.md'],
        },
        'geometry-core': {
          root: 'packages/core/geometry',
          targets: ['build', 'lint', 'pkgcheck', 'size', 'test', 'typecheck'],
          absentTargets: [],
          ancestorLinks: ['../../../AGENTS.md', '../../AGENTS.md'],
        },
        'inference-plugin': {
          root: 'packages/plugins/inference-plugin',
          targets: ['build', 'lint', 'pkgcheck', 'size', 'test', 'typecheck'],
          absentTargets: [],
          ancestorLinks: ['../../../AGENTS.md', '../../AGENTS.md', '../AGENTS.md'],
        },
      };

      for (const [projectName, contract] of Object.entries(expected)) {
        const project = graph.graph.nodes[projectName];
        expect(project?.data.root).toBe(contract.root);
        const inferred = Object.keys(project?.data.targets ?? {});
        expect(inferred).toEqual(expect.arrayContaining(contract.targets));
        for (const absent of contract.absentTargets) {
          expect(inferred).not.toContain(absent);
        }

        const instructions = readFileSync(join(root, contract.root, 'AGENTS.md'), 'utf8');
        for (const target of commandTargets(instructions, projectName)) {
          expect(inferred, `${projectName}:${target}`).toContain(target);
        }
        const ancestorSection = instructions
          .split('Read every applicable ancestor before editing this project:\n')[1]
          ?.split('\nThen follow')[0];
        const renderedLinks = [...(ancestorSection ?? '').matchAll(/\]\((?<link>[^)]+AGENTS\.md)\)/gu)].map(
          ({ groups }) => groups?.['link'] ?? '',
        );
        expect(renderedLinks).toEqual(contract.ancestorLinks);
        for (const link of renderedLinks) {
          expect(readFileSync(resolve(root, contract.root, link), 'utf8')).toContain('#');
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});
