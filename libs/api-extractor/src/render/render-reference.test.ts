import { describe, expect, it } from 'vitest';

import type { ApiEntryDraft } from '#model/api-corpus.js';
import { createApiCorpus, flattenEntries } from '#model/api-corpus.js';
import { renderIndex, renderReferenceMap, renderShard } from '#render/render-reference.js';
import { renderSkill } from '#render/render-skill.js';
import { planShards, shardIndexById } from '#render/shard-plan.js';

const drafts: readonly ApiEntryDraft[] = [
  {
    name: 'drawCircle',
    kind: 'function',
    category: 'sketching',
    docs: { summary: 'Draw a circle of the given radius on the current plane. Ignored otherwise.' },
    signatures: [{ parameters: [{ name: 'radius', optional: false }], text: 'drawCircle(radius: number): Drawing' }],
  },
  {
    name: 'makePlane',
    kind: 'function',
    category: 'sketching',
    signatures: [
      { parameters: [], text: 'makePlane(): Plane' },
      { parameters: [{ name: 'origin', optional: false }], text: 'makePlane(origin: Point): Plane' },
    ],
  },
  {
    name: 'Solid',
    kind: 'class',
    category: 'shapes',
    docs: { summary: 'A closed volume.' },
    members: [
      { name: 'fillet', kind: 'method', signatures: [{ parameters: [], text: 'fillet(radius: number): Solid' }] },
      { name: 'shell', kind: 'method', signatures: [{ parameters: [], text: 'shell(thickness: number): Solid' }] },
    ],
  },
  { name: 'deprecatedThing', kind: 'function', category: 'shapes', deprecated: 'Use Solid.fillet.' },
];

const corpus = createApiCorpus(
  {
    language: 'typescript',
    packageName: 'replicad',
    packageVersion: '0.19.2',
    extractor: 'TypeScript 5.9.3',
    extractionDate: '2026-09-10T00:00:00.000Z',
  },
  drafts,
);

const groupBy = (entry: { readonly category?: string }): string => entry.category ?? 'other';

describe('planShards', () => {
  it('groups on the supplied axis rather than guessing a field', () => {
    const shards = planShards(corpus, { groupBy });

    expect(shards.map((shard) => shard.slug)).toStrictEqual(['api-sketching', 'api-shapes']);
  });

  it('splits a group that exceeds the token ceiling, keeping every pointer valid', () => {
    const many: readonly ApiEntryDraft[] = Array.from({ length: 60 }, (_value, index) => ({
      name: `symbol${index}`,
      kind: 'function',
      category: 'bulk',
      signatures: [{ parameters: [], text: `symbol${index}(${'argument: number, '.repeat(20)}): void` }],
    }));
    const bulky = createApiCorpus(corpus.metadata, many);
    const shards = planShards(bulky, { groupBy, maxShardTokens: 500 });

    expect(shards.length).toBeGreaterThan(1);
    expect(shards.every((shard) => shard.entries.length > 0)).toBe(true);
    expect(shards.map((shard) => shard.slug)).toStrictEqual([...new Set(shards.map((shard) => shard.slug))]);
  });

  it('marks groups outside the eager set as fetched on demand', () => {
    const shards = planShards(corpus, { groupBy, eagerGroups: ['sketching'] });

    expect(shards.find((shard) => shard.title === 'sketching')?.tier).toBe('eager');
    expect(shards.find((shard) => shard.title === 'shapes')?.tier).toBe('cold');
  });
});

describe('renderIndex', () => {
  const shards = planShards(corpus, { groupBy });
  const index = renderIndex(corpus, shards, { title: 'Replicad API index' });

  it('lists every addressable symbol exactly once', () => {
    for (const entry of flattenEntries(corpus)) {
      const occurrences = index.split('\n').filter((line) => line.trim().startsWith(`${entry.name} (`)).length;
      const nested = index.split('\n').filter((line) => line.trim().endsWith(`${entry.name} (${entry.kind})`)).length;
      expect(occurrences + nested).toBeGreaterThanOrEqual(1);
    }

    const symbolLines = index.split('\n').filter((line) => /\(\w+\)/u.test(line));
    expect(symbolLines).toHaveLength([...flattenEntries(corpus)].length);
  });

  it('names the shard that holds each group, so a pointer always resolves', () => {
    for (const shard of shards) {
      expect(index).toContain(`\`${shard.slug}.md\``);
    }
  });

  it('caps an index summary at ten words', () => {
    const line = index.split('\n').find((entry) => entry.startsWith('drawCircle ('));

    expect(line).toBe('drawCircle (function) — Draw a circle of the given radius on the current…');
  });

  it('is deterministic', () => {
    expect(renderIndex(corpus, planShards(corpus, { groupBy }), { title: 'Replicad API index' })).toBe(index);
  });
});

describe('renderShard', () => {
  const shards = planShards(corpus, { groupBy });

  it('emits every overload as its own signature line', () => {
    const sketching = shards.find((shard) => shard.title === 'sketching');
    const markdown = renderShard(sketching!, corpus);

    expect(markdown).toContain('makePlane(): Plane');
    expect(markdown).toContain('makePlane(origin: Point): Plane');
  });

  it('normalizes multiline declaration whitespace without flattening it', () => {
    const multiline = createApiCorpus(corpus.metadata, [
      {
        name: 'make',
        kind: 'function',
        signatures: [{ parameters: [], text: 'make(\r\n  size: number, \r\n): Shape; ' }],
      },
    ]);
    const [shard] = planShards(multiline, { groupBy: () => 'Functions' });
    if (shard === undefined) {
      throw new Error('Expected one shard');
    }

    const rendered = renderShard(shard, multiline);
    expect(rendered).toContain('make(\n  size: number,\n): Shape;');
    expect(rendered).not.toMatch(/\r| +$/mu);
  });

  it('renders members inside their container', () => {
    const shapes = shards.find((shard) => shard.title === 'shapes');
    const markdown = renderShard(shapes!, corpus);

    expect(markdown).toContain('fillet(radius: number): Solid');
    expect(markdown).toContain('shell(thickness: number): Solid');
  });

  it('surfaces deprecation, which the previous model had nowhere to put', () => {
    const shapes = shards.find((shard) => shard.title === 'shapes');

    expect(renderShard(shapes!, corpus)).toContain('// DEPRECATED: Use Solid.fillet.');
  });

  it('places every entry in exactly one shard', () => {
    const byId = shardIndexById(shards);
    const all = [...flattenEntries(corpus)];

    expect(byId.size).toBe(all.length);
    for (const entry of all) {
      expect(byId.get(entry.id)).toBeDefined();
    }
  });
});

describe('renderSkill', () => {
  it('composes authored doctrine with the generated reference map', () => {
    const shards = planShards(corpus, { groupBy });
    const { markdown, bodyTokens } = renderSkill({
      slug: 'cad-replicad',
      title: 'Replicad authoring',
      description: 'Guides precise Replicad BRep authoring in main.ts.',
      doctrine: '## Workflow\n\n1. Author `main.ts` with ES module imports.',
      referenceMap: renderReferenceMap(shards, {
        indexFile: 'api-index.md',
        totalSymbols: corpus.metadata.totalEntries,
      }),
    });

    expect(markdown.startsWith('---\nname: cad-replicad\n')).toBe(true);
    expect(markdown).toContain('1. Author `main.ts` with ES module imports.');
    expect(markdown).toContain('Grep it for a name');
    expect(bodyTokens).toBeLessThanOrEqual(800);
  });

  it('refuses an over-budget body instead of silently reintroducing the mega-prompt', () => {
    expect(() =>
      renderSkill({
        slug: 'cad-huge',
        title: 'Huge',
        description: 'Too much.',
        doctrine: 'x'.repeat(800 * 4 + 1),
      }),
    ).toThrow(/over the 800 ceiling/u);
  });

  it('refuses an over-budget description', () => {
    expect(() =>
      renderSkill({ slug: 'cad-wordy', title: 'Wordy', description: 'y'.repeat(161), doctrine: 'ok' }),
    ).toThrow(/over the 160 ceiling/u);
  });
});
