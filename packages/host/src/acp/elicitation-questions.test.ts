/* eslint-disable @typescript-eslint/naming-convention -- form field keys are the ACP adapters' wire names */
import { describe, expect, it } from 'vitest';
import type { CreateElicitationRequest } from '@agentclientprotocol/sdk';

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

/* The shape codex-acp sends for request_user_input. */
const codexRequest: CreateElicitationRequest = {
  mode: 'form',
  sessionId: 's1',
  toolCallId: 'item_1',
  message: 'Codex needs your input to continue.',
  requestedSchema: {
    type: 'object',
    required: ['publish'],
    properties: {
      publish: {
        type: 'string',
        title: 'How should the fork publish?',
        description: 'Publish',
        oneOf: [
          { const: 'npm token (Recommended)', title: 'npm token (Recommended)', description: 'CI publishes.' },
          { const: 'From your Mac', title: 'From your Mac' },
          { const: 'None of the above', title: 'None of the above' },
        ],
        _meta: { codex: { isOther: true, isSecret: false } },
      },
      publish_note: {
        type: 'string',
        title: 'Additional answer or note',
        _meta: { codex: { questionId: 'publish', role: 'user_note', isSecret: false } },
      },
    },
  },
  _meta: { codex: { autoResolutionMs: 30_000 } },
};

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
          options: [
            { label: 'Paste rows', description: 'The test stays.' },
            { label: 'Drop seeds', description: 'Remove them.' },
          ],
          recommended: 1,
          allowsText: true,
        },
      ],
    });
  });

  it('reads a Codex form, hides its "None of the above" choice and honours autoResolutionMs', () => {
    const read = askOfElicitation(codexRequest, { ...context, agentId: 'codex' });

    expect(read?.dialect).toBe('codex');
    expect(read?.ask.deadline).toBe(new Date(now + 30_000).toISOString());
    expect(read?.ask.questions).toEqual([
      {
        id: 'publish',
        header: 'Publish',
        question: 'How should the fork publish?',
        options: [{ label: 'npm token', description: 'CI publishes.' }, { label: 'From your Mac' }],
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

  it('answers Codex own words through "None of the above" and its note field', () => {
    const read = askOfElicitation(codexRequest, { ...context, agentId: 'codex' })!;

    expect(elicitationResponseOf(read, { questions: { publish: { text: 'Trusted publishing', at } } })).toEqual({
      action: 'accept',
      content: { publish: 'None of the above', publish_note: 'Trusted publishing' },
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
