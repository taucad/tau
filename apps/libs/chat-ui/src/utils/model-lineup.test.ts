// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isDefaultChoice,
  latestInFamily,
  lineupOf,
  recommendedChoice,
  resolveDefaultChoice,
  withoutRecommended,
} from '#utils/model-lineup.js';

/* Model lists as the pinned adapters sent them (blueprint appendix, 2026-11-27). */
const claude = [
  { id: 'default', name: 'Default (recommended)', description: 'Opus 5.5' },
  { id: 'opus', name: 'Opus 5.5', description: 'For complex work and everyday tasks' },
  { id: 'fable[1m]', name: 'Fable 5.2' },
  { id: 'sonnet', name: 'Sonnet 5.5' },
  { id: 'haiku', name: 'Haiku 5.5' },
  { id: 'claude-fable-5-1', name: 'Fable 5.1' },
  { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5' },
  { id: 'claude-sonnet-5', name: 'Sonnet 5' },
  { id: 'claude-opus-5', name: 'Opus 5' },
  { id: 'claude-fable-5', name: 'Fable 5' },
  { id: 'claude-opus-4-8', name: 'Opus 4.8' },
];
const codex = [
  'GPT-6.2-Sol',
  'GPT-6.2-Astra',
  'GPT-6.1 Terra',
  'GPT-6.1-Sol',
  'GPT-6-Astra',
  'GPT-6-Sol',
  'GPT-6-Luna',
  'GPT-5.6-Sol',
  'GPT-5.6-Terra',
  'GPT-5.6-Luna',
];
const grok = ['Grok 4.7', 'Grok 4.7 Fast', 'Grok 4.6', 'Grok 4.5'];
const names = <T extends { readonly name: string }>(items: readonly T[]): string[] => items.map((item) => item.name);

describe('withoutRecommended', () => {
  it.each([
    ['Default (recommended)', 'Default'],
    ['Thorough reasoning and quality. Recommended.', 'Thorough reasoning and quality.'],
    ['Recommended', ''],
    ['High, recommended', 'High'],
  ])('should strip the word from %j and report it', (text, expected) => {
    expect(withoutRecommended(text)).toEqual({ text: expected, isRecommended: true });
  });

  it('should leave other text, and other uses of the word, alone', () => {
    expect(withoutRecommended('Not recommended for long tasks')).toEqual({
      text: 'Not recommended for long tasks',
      isRecommended: false,
    });
    expect(withoutRecommended('Fast variant. 2x the price.').isRecommended).toBe(false);
  });
});

describe('resolveDefaultChoice', () => {
  it('should follow a default alias to the model its description names', () => {
    expect(resolveDefaultChoice(claude, 'default')).toBe('opus');
  });

  it('should keep a concrete current value, and an unknown one', () => {
    expect(resolveDefaultChoice(claude, 'fable[1m]')).toBe('fable[1m]');
    expect(resolveDefaultChoice(claude, undefined)).toBeUndefined();
  });

  it('should fall back to the first concrete model when the alias names none', () => {
    expect(resolveDefaultChoice([{ id: 'default', name: 'Default' }, ...claude.slice(3)], 'default')).toBe('sonnet');
  });

  it('should match a concrete name the agent marks "(recommended)"', () => {
    const choices = [
      { id: 'default', name: 'Default', description: 'Opus 5.5' },
      { id: 'sonnet', name: 'Sonnet 5.5' },
      { id: 'opus', name: 'Opus 5.5 (recommended)' },
    ];
    expect(resolveDefaultChoice(choices, 'default')).toBe('opus');
  });
});

describe('latestInFamily', () => {
  it('should put the newest model of each Claude family at the top', () => {
    const { top, more } = latestInFamily(claude.slice(1), (model) => model.name);

    expect(names(top)).toEqual(['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5']);
    expect(names(more)).toEqual(['Fable 5.1', 'Haiku 4.5', 'Sonnet 5', 'Opus 5', 'Fable 5', 'Opus 4.8']);
  });

  it('should treat each variant as a family of its own', () => {
    expect(latestInFamily(codex, (name) => name)).toEqual({
      top: ['GPT-6.2-Sol', 'GPT-6.2-Astra', 'GPT-6.1 Terra', 'GPT-6-Luna'],
      more: ['GPT-6.1-Sol', 'GPT-6-Astra', 'GPT-6-Sol', 'GPT-5.6-Sol', 'GPT-5.6-Terra', 'GPT-5.6-Luna'],
    });
    expect(latestInFamily(grok, (name) => name)).toEqual({ top: grok.slice(0, 2), more: grok.slice(2) });
  });

  it('should keep unversioned names and the requested rows at the top', () => {
    expect(
      latestInFamily(
        ['Auto', 'Grok 4.7', 'Grok 4.6'],
        (name) => name,
        (name) => name === 'Grok 4.6',
      ),
    ).toEqual({
      top: ['Auto', 'Grok 4.7', 'Grok 4.6'],
      more: [],
    });
  });
});

describe('lineupOf', () => {
  it('should cut each headed group, dropping groups left empty', () => {
    const lineup = lineupOf(
      [
        { name: 'Pinned', items: ['Opus 4.8'] },
        { name: 'Anthropic', items: ['Opus 5.5', 'Opus 5'] },
        { name: 'xAI', items: ['Grok 4.7'] },
      ],
      (name) => name,
      (name) => name === 'Opus 4.8',
    );

    expect(lineup.top).toEqual([
      { name: 'Pinned', items: ['Opus 4.8'] },
      { name: 'Anthropic', items: ['Opus 5.5'] },
      { name: 'xAI', items: ['Grok 4.7'] },
    ]);
    expect(lineup.more).toEqual([{ name: 'Anthropic', items: ['Opus 5'] }]);
  });
});

describe('recommendedChoice', () => {
  const levels = ['low', 'medium', 'high'].map((id) => ({ id, name: id }));

  it('should badge the level the agent itself recommends first', () => {
    expect(recommendedChoice([...levels, { id: 'xhigh', name: 'Extra', description: 'Recommended.' }], 'high')).toBe(
      'xhigh',
    );
  });

  it('should badge the level a fresh session starts on', () => {
    expect(recommendedChoice(levels, 'high')).toBe('high');
  });

  it('should read an agent-decides default as medium when offered', () => {
    expect(recommendedChoice([{ id: 'default', name: 'Default' }, ...levels], 'default')).toBe('medium');
    expect(recommendedChoice([{ id: 'default', name: 'Default' }, levels[2]!], 'default')).toBeUndefined();
  });

  it('should recommend nothing when no level is marked, none is in force and there is no Default', () => {
    expect(recommendedChoice(levels, undefined)).toBeUndefined();
  });

  it('should treat only default ids and names as the sentinel', () => {
    expect(isDefaultChoice({ id: 'default', name: 'Default' })).toBe(true);
    expect(isDefaultChoice({ id: 'x', name: 'Default (recommended)' })).toBe(true);
    expect(isDefaultChoice({ id: 'medium', name: 'Medium' })).toBe(false);
  });
});
