/* eslint-disable @typescript-eslint/naming-convention -- form field keys are the ACP adapters' wire names */
import { describe, expect, it } from 'vitest';
import { agent, client } from '@agentclientprotocol/sdk';
import type { CreateElicitationRequest, CreateElicitationResponse } from '@agentclientprotocol/sdk';

import { askOfElicitation, elicitationResponseOf } from '#acp/elicitation-questions.js';

const now = Date.parse('2026-10-03T00:00:00.000Z');
const at = new Date(now).toISOString();
const context = { agentId: 'claude', askId: 'ask_1', now };

/* The shape claude-agent-acp 0.70 sends for a one-question AskUserQuestion. */
const claudeRequest: CreateElicitationRequest = {
  mode: 'form',
  sessionId: 's1',
  toolCallId: 'toolu_1',
  message: 'Restore the evidence rows, or drop the seeds?',
  requestedSchema: {
    type: 'object',
    properties: {
      question_0: {
        type: 'string',
        title: 'Seeds',
        oneOf: [
          { const: 'Paste rows', title: 'Paste rows', description: 'The test stays.' },
          { const: 'Drop seeds (Recommended)', title: 'Drop seeds (Recommended)', description: 'Remove them.' },
        ],
      },
      question_0_custom: {
        type: 'string',
        title: 'Other',
        _meta: { _askUserQuestionCustomAnswer: { questionId: 'question_0', isCustomAnswer: true } },
      },
    },
  },
};

/* The shape codex-acp 1.7.0 sends for request_user_input (`buildUserInputRequest`). */
const codexRequest = {
  mode: 'form',
  sessionId: 's1',
  toolCallId: 'item_1',
  message: 'How should the fork publish?',
  requestedSchema: {
    type: 'object',
    required: [],
    properties: {
      publish: {
        type: 'string',
        title: 'Publish',
        description: 'How should the fork publish?',
        oneOf: [
          { const: 'npm token (Recommended)', title: 'npm token (Recommended)', description: 'CI publishes.' },
          { const: 'From your Mac', title: 'From your Mac' },
        ],
        _meta: { codex: { isOther: true, isSecret: false } },
      },
      publish_other: {
        type: 'string',
        title: 'Other',
        description: 'Type your own answer instead of choosing an option above.',
        _meta: { codex: { questionId: 'publish', isOtherAnswer: true, isSecret: false } },
      },
    },
  },
  // oxlint-disable-next-line tau-lint/no-time-unit-suffix -- codex-acp's wire field name.
  _meta: { codex: { autoResolutionMs: 30_000 } },
} satisfies CreateElicitationRequest;

describe('askOfElicitation', () => {
  it('reads a Claude AskUserQuestion form with its recommended option and own-words field', () => {
    const read = askOfElicitation(claudeRequest, context);

    expect(read?.dialect).toBe('claude');
    expect(read?.ask).toEqual({
      id: 'ask_1',
      callId: 'toolu_1',
      askedAt: at,
      deadline: new Date(now + 120_000).toISOString(),
      source: 'acp',
      agentId: 'claude',
      questions: [
        {
          id: 'question_0',
          header: 'Seeds',
          question: 'Restore the evidence rows, or drop the seeds?',
          field: { type: 'string', required: true },
          options: [
            { value: 'Paste rows', label: 'Paste rows', description: 'The test stays.' },
            { value: 'Drop seeds (Recommended)', label: 'Drop seeds', description: 'Remove them.' },
          ],
          recommended: 1,
          allowsText: true,
        },
      ],
    });
  });

  it('reads a Codex form with its Other field as own words and honours autoResolutionMs', () => {
    const read = askOfElicitation(codexRequest, { ...context, agentId: 'codex' });

    expect(read?.dialect).toBe('codex');
    expect(read?.ask.deadline).toBe(new Date(now + 30_000).toISOString());
    expect(read?.ask.message).toBeUndefined();
    expect(read?.ask.questions).toEqual([
      {
        id: 'publish',
        header: 'Publish',
        question: 'How should the fork publish?',
        field: { type: 'string', required: true },
        options: [
          { value: 'npm token (Recommended)', label: 'npm token', description: 'CI publishes.' },
          { value: 'From your Mac', label: 'From your Mac' },
        ],
        recommended: 0,
        allowsText: true,
      },
    ]);
  });

  it('gives any other form no deadline and no default', () => {
    const read = askOfElicitation(
      {
        mode: 'form',
        sessionId: 's1',
        message: 'Retry with the fallback model?',
        requestedSchema: {
          type: 'object',
          properties: {
            choice: {
              type: 'string',
              oneOf: [
                { const: 'retry_fallback', title: 'Retry' },
                { const: 'cancelled', title: 'Keep the refusal' },
              ],
            },
          },
        },
      },
      context,
    );

    expect(read?.dialect).toBe('form');
    expect(read?.ask.deadline).toBeNull();
    expect(read?.ask.questions[0]?.recommended).toBeUndefined();
    expect(read?.ask.message).toBe('Retry with the fallback model?');
  });
});

describe('elicitationResponseOf', () => {
  it('answers Claude with the chosen value, or the person’s words in the custom field', () => {
    const read = askOfElicitation(claudeRequest, context)!;

    expect(elicitationResponseOf(read, { questions: { question_0: { choice: 'Paste rows', at } } })).toEqual({
      action: 'accept',
      content: { question_0: 'Paste rows' },
    });
    expect(elicitationResponseOf(read, { questions: { question_0: { text: 'Both, in that order', at } } })).toEqual({
      action: 'accept',
      content: { question_0_custom: 'Both, in that order' },
    });
  });

  it('answers a defaulted Claude question with the recommended value and says why', () => {
    const response = elicitationResponseOf(askOfElicitation(claudeRequest, context)!, undefined);

    expect(response).toMatchObject({ action: 'accept', content: { question_0: 'Drop seeds (Recommended)' } });
    expect(JSON.stringify(response)).toContain('no reply from the person in time');
  });

  it('answers Codex own words in its Other field and a default with the answer itself', () => {
    const read = askOfElicitation(codexRequest, { ...context, agentId: 'codex' })!;

    expect(elicitationResponseOf(read, { questions: { publish: { text: 'Trusted publishing', at } } })).toEqual({
      action: 'accept',
      content: { publish_other: 'Trusted publishing' },
    });
    /* The adapter reads Other before the choice, so the defaulted answer must lead it. */
    expect(elicitationResponseOf(read, undefined)).toEqual({
      action: 'accept',
      content: {
        publish: 'npm token (Recommended)',
        publish_other: 'npm token (no reply from the person in time; Tau adopted the recommended option)',
      },
    });
  });

  it('declines when the person declines, and cancels an unanswered form with no default', () => {
    const generic = askOfElicitation(
      {
        mode: 'form',
        sessionId: 's1',
        message: 'API key name?',
        requestedSchema: { type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
      },
      context,
    )!;

    expect(elicitationResponseOf(generic, { declined: true, questions: {} })).toEqual({ action: 'decline' });
    expect(elicitationResponseOf(generic, undefined)).toEqual({ action: 'cancel' });
    expect(elicitationResponseOf(generic, { questions: { name: { text: 'tau-ci', at } } })).toEqual({
      action: 'accept',
      content: { name: 'tau-ci' },
    });
  });
});

describe('typed form fidelity', () => {
  it('should refuse an unsupported required object field instead of asking for text', () => {
    expect(
      askOfElicitation(
        {
          mode: 'form',
          sessionId: 's1',
          message: 'Structured input',
          requestedSchema: {
            type: 'object',
            required: ['shape'],
            properties: { shape: { type: 'object' } },
          },
        },
        context,
      ),
    ).toBeUndefined();
  });

  it('should reject a fractional integer and refuse partial required content', () => {
    const form = askOfElicitation(
      {
        mode: 'form',
        sessionId: 's1',
        message: 'Copies',
        requestedSchema: {
          type: 'object',
          required: ['count'],
          properties: { count: { type: 'integer', minimum: 1, maximum: 5 } },
        },
      },
      context,
    )!;
    expect(elicitationResponseOf(form, { questions: { count: { text: '1.5', at } } })).toEqual({ action: 'cancel' });
    expect(elicitationResponseOf(form, { questions: { count: { text: '6', at } } })).toEqual({ action: 'cancel' });
  });
});

it('should preserve exact values with duplicate labels, arrays, numbers, false, and optional omission', () => {
  const form = askOfElicitation(
    {
      mode: 'form',
      sessionId: 's1',
      message: 'Typed values',
      requestedSchema: {
        type: 'object',
        required: ['pick', 'tags', 'count', 'enabled'],
        properties: {
          pick: {
            type: 'string',
            oneOf: [
              { const: 'a', title: 'Same' },
              { const: 'b', title: 'Same' },
            ],
          },
          tags: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', enum: ['red', 'blue', 'green'] } },
          count: { type: 'integer', minimum: 1, maximum: 5 },
          enabled: { type: 'boolean' },
          note: { type: 'string' },
        },
      },
    },
    context,
  )!;
  expect(
    elicitationResponseOf(form, {
      questions: {
        pick: { value: 'b', at },
        tags: { value: ['red', 'blue'], at },
        count: { value: 3, at },
        enabled: { value: false, at },
        note: { skipped: true, at },
      },
    }),
  ).toEqual({ action: 'accept', content: { pick: 'b', tags: ['red', 'blue'], count: 3, enabled: false } });
  for (const value of [['red'], ['red', 'red'], ['red', 'blue', 'green'], ['red', 'unknown']]) {
    expect(
      elicitationResponseOf(form, {
        questions: {
          pick: { value: 'b', at },
          tags: { value, at },
          count: { value: 3, at },
          enabled: { value: false, at },
        },
      }),
    ).toEqual({ action: 'cancel' });
  }
});

it('should refuse secret-bearing fields before writing a project record', () => {
  expect(
    askOfElicitation(
      {
        mode: 'form',
        sessionId: 's1',
        message: 'Secret',
        requestedSchema: {
          type: 'object',
          properties: { secret: { type: 'string', _meta: { codex: { isSecret: true } } } },
        },
      },
      context,
    ),
  ).toBeUndefined();
});

it('should refuse a secret companion field even when its choice field is ordinary', () => {
  const { properties } = codexRequest.requestedSchema;
  expect(
    askOfElicitation(
      {
        ...codexRequest,
        requestedSchema: {
          ...codexRequest.requestedSchema,
          properties: {
            ...properties,
            publish_other: {
              type: 'string',
              _meta: { codex: { questionId: 'publish', isOtherAnswer: true, isSecret: true } },
            },
          },
        },
      },
      context,
    ),
  ).toBeUndefined();
});

it('should answer titled arrays after real SDK request parsing without an items type', async () => {
  const receiver = client().onRequest('elicitation/create', ({ params }): CreateElicitationResponse => {
    const form = askOfElicitation(params, context);
    return form === undefined
      ? { action: 'decline' }
      : elicitationResponseOf(form, { questions: { colors: { value: ['red', 'blue'], at } } });
  });
  const response = await agent().connectWith(receiver, async (remote) =>
    remote.request('elicitation/create', {
      mode: 'form',
      sessionId: 's1',
      message: 'Colors',
      requestedSchema: {
        type: 'object',
        required: ['colors'],
        properties: {
          colors: {
            type: 'array',
            items: {
              anyOf: [
                { const: 'red', title: 'Red' },
                { const: 'blue', title: 'Blue' },
              ],
            },
          },
        },
      },
    }),
  );
  expect(response).toEqual({ action: 'accept', content: { colors: ['red', 'blue'] } });
});

it.each([
  { type: 'object', allOf: [{ required: ['other'] }], properties: { name: { type: 'string' } } },
  { type: 'object', properties: { amount: { type: 'number', const: 5 } } },
  { type: 'object', properties: { name: { type: 'string', oneOf: [{ const: 'a', title: 'A' }], enum: ['b'] } } },
  { type: 'object', properties: { colors: { type: 'array', items: { type: 'string', enum: ['a'], pattern: '^b$' } } } },
])('should refuse unsupported validation rather than discard it: %j', (requestedSchema) => {
  expect(
    askOfElicitation({ mode: 'form', sessionId: 's1', message: 'Form', requestedSchema }, context),
  ).toBeUndefined();
});
