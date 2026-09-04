import { describe, expect, it } from 'vitest';
import { summarizeUsage } from '#usage.js';

describe('summarizeUsage', () => {
  it('extracts, enriches, and newest-first sorts usage parts', () => {
    const usage = (id: string, model: string) => ({
      type: 'data-usage',
      data: {
        id,
        model,
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
        inputTokensCost: 5,
        outputTokensCost: 6,
        cacheReadTokensCost: 7,
        cacheWriteTokensCost: 8,
        totalCost: 26,
      },
    });
    const sources = [
      {
        project: { manifest: { id: 'project', name: 'Project' } },
        chats: [
          { id: 'older', createdAt: 1, messages: [{ metadata: { createdAt: 10 }, parts: [usage('a', 'model-a')] }] },
          {
            id: 'newer',
            createdAt: 2,
            messages: [{ metadata: { createdAt: 20 }, parts: [usage('b', 'model-b'), { type: 'text' }] }],
          },
        ],
      },
    ];

    const records = summarizeUsage(sources, (id) => ({ name: id.toUpperCase(), provider: { name: 'Provider' } }));

    expect(records.map(({ id }) => id)).toEqual(['b', 'a']);
    expect(records[0]).toMatchObject({ totalTokens: 10, modelName: 'MODEL-B', provider: 'Provider' });
  });

  it('dates each usage part from its owning message and uses stable chat creation for legacy messages', () => {
    const usage = {
      type: 'data-usage',
      data: {
        id: 'usage',
        model: 'model',
        inputTokens: 1,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokensCost: 0,
        outputTokensCost: 0,
        cacheReadTokensCost: 0,
        cacheWriteTokensCost: 0,
        totalCost: 0,
      },
    };
    const records = summarizeUsage(
      [
        {
          project: { manifest: { id: 'project', name: 'Project' } },
          chats: [
            {
              id: 'chat',
              createdAt: 5,
              messages: [
                { metadata: { createdAt: 20 }, parts: [{ ...usage, data: { ...usage.data, id: 'stamped' } }] },
                { parts: [{ ...usage, data: { ...usage.data, id: 'legacy' } }] },
              ],
            },
          ],
        },
      ],
      () => ({ name: 'Model', provider: { name: 'Provider' } }),
    );

    expect(records.map(({ id, date }) => [id, date.getTime()])).toEqual([
      ['stamped', 20],
      ['legacy', 5],
    ]);
  });

  it.each([
    null,
    'not usage',
    { id: 1, model: 'model', totalCost: 1 },
    { id: 'id', model: 1, totalCost: 1 },
    { id: 'id', model: 'model', totalCost: 1 },
    {
      id: 'id',
      model: 'model',
      inputTokens: Number.NaN,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      inputTokensCost: 0,
      outputTokensCost: 0,
      cacheReadTokensCost: 0,
      cacheWriteTokensCost: 0,
      totalCost: 0,
    },
  ])('ignores malformed persisted usage %#', (data) => {
    const records = summarizeUsage(
      [
        {
          project: { manifest: { id: 'project', name: 'Project' } },
          chats: [{ id: 'chat', createdAt: 1, messages: [{ parts: [{ type: 'data-usage', data }] }] }],
        },
      ],
      () => ({ name: 'Model', provider: { name: 'Provider' } }),
    );
    expect(records).toEqual([]);
  });
});
