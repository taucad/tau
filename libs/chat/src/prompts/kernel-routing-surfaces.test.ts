import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kernelConfigurations } from '@taucad/types/constants';
import { describe, expect, it } from 'vitest';
import {
  kernelRoutingRegions,
  normalizeMarkdownTables,
  pluginKernelProfile,
  readGeneratedRegion,
  tauMcpKernelDigest,
  tauMcpKernelProfile,
  writeGeneratedRegion,
} from '#prompts/kernel-routing-surfaces.js';

const root = resolve(import.meta.dirname, '../../../..');

describe('the kernel routing surfaces', () => {
  it.each(kernelRoutingRegions)('should hold the current $region rendering in $path', ({ path, region, render }) => {
    const text = readFileSync(resolve(root, path), 'utf8');
    const stored = readGeneratedRegion(text, region);

    expect(stored, `${path} has no ${region} region`).toBeDefined();
    expect(
      normalizeMarkdownTables(stored ?? ''),
      `${path} is stale: run pnpm nx run chat:generate-kernel-routing`,
    ).toBe(normalizeMarkdownTables(render()));
  });

  it('should name no default kernel in a generated region', () => {
    for (const { render } of kernelRoutingRegions) {
      expect(render()).not.toMatch(/\bdefault\b/iu);
    }
    expect(tauMcpKernelDigest).not.toMatch(/\bdefault\b/iu);
  });

  it('should leave only Zoo out of the plugin and tau mcp profiles, in catalog order', () => {
    const catalog = kernelConfigurations.map(({ id }) => id);

    expect(pluginKernelProfile.available).toEqual(catalog.filter((id) => id !== 'zoo'));
    expect(tauMcpKernelProfile.available).toEqual(pluginKernelProfile.available);
    expect(pluginKernelProfile.withoutSkill).toEqual(['opencascadejs']);
  });

  it('should say the plugin ships no OpenCascade skill and the tau mcp digest does', () => {
    const plugin = kernelRoutingRegions[0].render();

    expect(plugin).toContain('`cad-replicad`');
    expect(plugin).not.toContain('`cad-opencascadejs`');
    expect(tauMcpKernelDigest).toContain('`cad-opencascadejs`');
    expect(tauMcpKernelDigest).not.toContain('Zoo');
  });

  it('should replace only the text between the markers', () => {
    const text = [
      'before',
      '<!-- generated:sample:start (pnpm nx run chat:generate-kernel-routing) -->',
      'old',
      '<!-- generated:sample:end -->',
      'after',
    ].join('\n');
    const written = writeGeneratedRegion(text, 'sample', 'new');

    expect(readGeneratedRegion(written, 'sample')).toBe('new');
    expect(written.startsWith('before\n')).toBe(true);
    expect(written.endsWith('\nafter')).toBe(true);
    expect(() => writeGeneratedRegion('no markers', 'sample', 'new')).toThrow('no generated sample region');
  });

  it('should compare tables without the padding a formatter adds', () => {
    expect(normalizeMarkdownTables('| a   | b |\n| --- | ------ |\n| `x\\|y` | z |')).toBe(
      normalizeMarkdownTables('| a | b |\n| --- | --- |\n| `x\\|y` | z |'),
    );
  });
});
