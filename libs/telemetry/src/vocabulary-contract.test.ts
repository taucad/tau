import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtInSkillSlugs, kernelIds, tauToolNames } from '#ingest.js';

/**
 * The ingest vocabularies are copied so this library never depends on the agent host, the kernel catalogue or the
 * skill bundles. This reads each owner's source, as `grafana-contract.test.ts` does, so a new tool, kernel or skill
 * fails here until the copy follows.
 */
const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
const source = (file: string): string => readFileSync(path.join(workspaceRoot, file), 'utf8');

/**
 * The text between `start` and the first `end` after it.
 *
 * @param text - The source text.
 * @param start - The opening marker.
 * @param end - The closing marker.
 * @returns The enclosed block.
 */
const block = (text: string, start: string, end: string): string => {
  const from = text.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  return text.slice(from, text.indexOf(end, from));
};

describe('ingest vocabularies', () => {
  it('should list every tauToolKinds key in @taucad/agent-host', () => {
    const map = block(source('packages/agent-host/src/harness/tools.ts'), 'export const tauToolKinds = new Map', ']);');
    const names = [...map.matchAll(/\['(?<name>\w+)', '\w+'\]/gu)].map(({ groups }) => groups!['name']);

    expect(names).toEqual([...tauToolNames]);
  });

  it('should list every kernelConfigurations id in @taucad/types', () => {
    const list = block(
      source('libs/types/src/constants/kernel.constants.ts'),
      'export const kernelConfigurations = [',
      '] as const',
    );
    const ids = [...list.matchAll(/^ {4}id: '(?<id>[\w-]+)'/gmu)].map(({ groups }) => groups!['id']);

    expect(ids).toEqual([...kernelIds]);
  });

  it('should list every built-in skill bundle slug shipped through @taucad/skills', () => {
    const manifests = globSync(['packages/*/agent/skills.json', 'packages/plugins/*/agent/skills.json'], {
      cwd: workspaceRoot,
    });
    const slugs = manifests.flatMap((file) =>
      (JSON.parse(source(file)) as { bundles: Array<{ slug: string }> }).bundles.map(({ slug }) => slug),
    );

    expect(slugs.toSorted()).toEqual([...builtInSkillSlugs].toSorted());
  });
});
