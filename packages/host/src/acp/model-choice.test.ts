/**
 * The model list a picker renders must let the user tell every row apart (F4):
 * Claude Code's adapter can list two models under one display name.
 */

import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';

import { modelChoice } from '#acp/session.js';

/** One `category: 'model'` select, as both pinned adapters spell it. */
const modelSelect = (
  options: ReadonlyArray<{ readonly value: string; readonly name: string }>,
  currentValue = options[0]?.value ?? '',
): SessionConfigOption[] => [
  { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue, options: [...options] },
];

describe('modelChoice', () => {
  it('should keep distinct model names as the agent listed them', () => {
    const choice = modelChoice(
      modelSelect([
        { value: 'default', name: 'Default (recommended)' },
        { value: 'opus', name: 'Opus' },
      ]),
    );

    expect(choice).toEqual({
      configId: 'model',
      currentValue: 'default',
      models: [
        { id: 'default', name: 'Default (recommended)' },
        { id: 'opus', name: 'Opus' },
      ],
      values: ['default', 'opus'],
    });
  });

  it('should append the model id to every model that shares a display name', () => {
    const choice = modelChoice(
      modelSelect([
        { value: 'default', name: 'Default (recommended)' },
        { value: 'fable', name: 'Fable' },
        { value: 'fable[1m]', name: 'Fable' },
      ]),
    );

    expect(choice?.models).toEqual([
      { id: 'default', name: 'Default (recommended)' },
      { id: 'fable', name: 'Fable (fable)' },
      { id: 'fable[1m]', name: 'Fable (fable[1m])' },
    ]);
    expect(choice?.values).toEqual(['default', 'fable', 'fable[1m]']);
  });

  it('should disambiguate duplicates across the groups of a grouped select', () => {
    const choice = modelChoice([
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: 'a',
        options: [
          { group: 'one', name: 'One', options: [{ value: 'a', name: 'Same' }] },
          { group: 'two', name: 'Two', options: [{ value: 'b', name: 'Same' }] },
        ],
      },
    ]);

    expect(choice?.models).toEqual([
      { id: 'a', name: 'Same (a)' },
      { id: 'b', name: 'Same (b)' },
    ]);
  });

  it('should keep a disambiguated name within the 128-character descriptor bound', () => {
    const name = 'N'.repeat(126);

    const choice = modelChoice(
      modelSelect([
        { value: 'model-a', name },
        { value: 'model-b', name },
      ]),
    );

    expect(choice?.models.map((model) => model.name)).toEqual([
      `${'N'.repeat(118)} (model-a)`,
      `${'N'.repeat(118)} (model-b)`,
    ]);
  });

  it('should return undefined when the agent offers no model select', () => {
    expect(modelChoice([])).toBeUndefined();
    expect(modelChoice(undefined)).toBeUndefined();
  });
});
