import { describe, expect, it } from 'vitest';
import type { KernelId } from '@taucad/types/constants';
import type { ChatExample } from '#constants/chat-prompt-examples.js';
import { pickSuggestions } from '#lib/pick-suggestions.js';

const example = (id: string, goals: ChatExample['goals'], needs?: ChatExample['needs']): ChatExample => ({
  id,
  title: id,
  prompt: `Make ${id}`,
  goals,
  ...(needs === undefined ? {} : { needs }),
});

const examples: readonly ChatExample[] = [
  example('print-1', ['printing']),
  example('print-2', ['printing']),
  example('print-3', ['printing', 'general']),
  example('mech-1', ['mechanical']),
  example('mech-2', ['mechanical']),
  example('board-1', ['electronics'], 'electronics'),
  example('board-2', ['electronics', 'product'], 'electronics'),
  example('voxel-1', ['art'], 'implicit'),
  example('general-1', ['general']),
  example('general-2', ['general']),
  example('general-3', ['general']),
  example('general-4', ['general']),
  example('general-5', ['general']),
];
const browser: readonly KernelId[] = ['openscad', 'replicad', 'tscircuit', 'picovoxel'];
const ids = (picked: readonly ChatExample[]): string[] => picked.map(({ id }) => id);

describe('pickSuggestions', () => {
  it('should give each goal one before any goal gets a second, in the order of the goals', () => {
    const picked = pickSuggestions(examples, ['printing', 'mechanical', 'electronics'], 'auto', browser, 'seed');

    expect(picked).toHaveLength(4);
    expect(picked[0]?.goals).toContain('printing');
    expect(picked[1]?.goals).toContain('mechanical');
    expect(picked[2]?.goals).toContain('electronics');
    for (const suggestion of picked) {
      expect(suggestion.goals.some((goal) => ['printing', 'mechanical', 'electronics'].includes(goal))).toBe(true);
    }
  });

  it('should repeat a goal only after every goal has one', () => {
    const picked = pickSuggestions(examples, ['printing', 'mechanical'], 'auto', browser, 'seed');

    expect(picked.map(({ goals }) => goals.includes('printing'))).toEqual([true, false, true, false]);
  });

  it('should never show the same example twice when it suits two goals', () => {
    const picked = pickSuggestions(examples, ['electronics', 'product'], 'auto', browser, 'seed');

    expect(new Set(ids(picked)).size).toBe(picked.length);
  });

  it.each([
    ['no goals', []],
    ['only "Just exploring"', ['exploring']],
  ] as const)('should fall back to general examples with %s', (_name, goals) => {
    const picked = pickSuggestions(examples, goals, 'auto', browser, 'seed');

    expect(picked).toHaveLength(4);
    expect(picked.every(({ goals: tags }) => tags.includes('general'))).toBe(true);
  });

  it('should treat "Just exploring" beside another goal as that goal alone', () => {
    const picked = pickSuggestions(examples, ['exploring', 'mechanical'], 'auto', browser, 'seed');

    expect(ids(picked).toSorted()).toEqual(['mech-1', 'mech-2']);
  });

  it('should keep every example eligible under Auto when the host provides its needs', () => {
    const picked = pickSuggestions(examples, ['electronics', 'art'], 'auto', browser, 'seed');

    expect(ids(picked).toSorted()).toEqual(['board-1', 'board-2', 'voxel-1']);
  });

  it('should show an example with needs under a manual pick only when that kernel provides them', () => {
    expect(ids(pickSuggestions(examples, ['electronics'], 'openscad', browser, 'seed'))).toEqual([]);
    expect(ids(pickSuggestions(examples, ['electronics'], 'tscircuit', browser, 'seed')).toSorted()).toEqual([
      'board-1',
      'board-2',
    ]);
    expect(ids(pickSuggestions(examples, ['printing'], 'openscad', browser, 'seed'))).toHaveLength(3);
  });

  it('should never show an example whose needs no entitled kernel provides', () => {
    const noVoxel: readonly KernelId[] = ['openscad', 'replicad', 'tscircuit'];

    expect(ids(pickSuggestions(examples, ['art'], 'auto', noVoxel, 'seed'))).toEqual([]);
  });

  it('should keep the same order for the same seed and may change it for another', () => {
    const first = ids(pickSuggestions(examples, [], 'auto', browser, 'load-1'));

    expect(ids(pickSuggestions(examples, [], 'auto', browser, 'load-1'))).toEqual(first);
    const others = ['load-2', 'load-3', 'load-4', 'load-5'].map((seed) =>
      ids(pickSuggestions(examples, [], 'auto', browser, seed)).join(','),
    );
    expect(others.some((order) => order !== first.join(','))).toBe(true);
  });

  it('should return at most the count asked for', () => {
    expect(pickSuggestions(examples, [], 'auto', browser, 'seed', 3)).toHaveLength(3);
  });
});
