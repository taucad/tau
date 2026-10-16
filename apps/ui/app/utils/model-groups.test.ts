// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ModelFamily } from '@taucad/chat';
import { groupModels } from '#utils/model-groups.js';

const model = (
  id: string,
  family: ModelFamily,
  providerKind: 'tau-hosted' | 'local' | 'in-browser' = 'tau-hosted',
) => ({
  id,
  providerKind,
  details: { family },
});

const catalog = [
  model('opus', 'claude'),
  model('sonnet', 'claude'),
  model('sol', 'gpt'),
  model('qwen-local', 'qwen', 'local'),
  model('flash', 'gemini'),
  model('kimi', 'kimi'),
];

const shape = (groups: ReturnType<typeof groupModels>) =>
  groups.map((group) => [group.name, group.items.map((item) => item.id)]);

describe('groupModels', () => {
  it('groups by maker in catalog order and puts local models last', () => {
    expect(shape(groupModels(catalog, []))).toEqual([
      ['Anthropic', ['opus', 'sonnet']],
      ['OpenAI', ['sol']],
      ['Google', ['flash']],
      ['Moonshot AI', ['kimi']],
      ['On this computer', ['qwen-local']],
    ]);
  });

  it('puts pinned models first in pin order, out of their own groups', () => {
    expect(shape(groupModels(catalog, ['sol', 'qwen-local', 'opus']))).toEqual([
      ['Pinned', ['sol', 'qwen-local', 'opus']],
      ['Anthropic', ['sonnet']],
      ['Google', ['flash']],
      ['Moonshot AI', ['kimi']],
    ]);
  });

  it('ignores pinned ids the list does not offer', () => {
    expect(shape(groupModels([model('opus', 'claude')], ['gone']))).toEqual([['Anthropic', ['opus']]]);
  });

  it('gives no groups for an empty list', () => {
    expect(groupModels([], ['opus'])).toEqual([]);
  });
});
