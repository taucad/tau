#!/usr/bin/env node
// A credential-free Codex app-server protocol peer; the ACP adapter itself is real.
import { createInterface } from 'node:readline';
const send = (message: Record<string, unknown>) =>
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
const turn = { id: 'turn', items: [], status: 'inProgress', error: null };
const notify = (method: string, params: Record<string, unknown>) =>
  send({ method, params: { threadId: 'thread', turnId: 'turn', ...params } });
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line) as { id?: number; method: string; params?: { cwd?: string } };
  if (request.id === undefined) {
    continue;
  }
  let result: unknown;
  switch (request.method) {
    case 'initialize': {
      result = { userAgent: 'fixture', codexHome: process.env['CODEX_HOME'] };
      break;
    }
    case 'account/read': {
      result = { account: { type: 'apiKey' }, requiresOpenaiAuth: false };
      break;
    }
    case 'account/rateLimits/read': {
      result = { rateLimits: {} };
      break;
    }
    case 'config/read': {
      result = { config: {}, layers: [] };
      break;
    }
    case 'configRequirements/read': {
      result = { requirements: null };
      break;
    }
    case 'skills/list': {
      result = { data: [] };
      break;
    }
    case 'mcpServerStatus/list': {
      result = { data: [], nextCursor: null };
      break;
    }
    case 'model/list': {
      result = {
        data: [
          {
            id: 'fixture',
            model: 'fixture',
            displayName: 'Fixture',
            description: '',
            hidden: false,
            isDefault: true,
            supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: '' }],
            defaultReasoningEffort: 'medium',
          },
        ],
        nextCursor: null,
      };
      break;
    }
    case 'thread/start': {
      result = {
        thread: { id: 'thread', turns: [] },
        model: 'fixture',
        modelProvider: 'openai',
        reasoningEffort: 'medium',
        cwd: request.params?.cwd,
      };
      break;
    }
    case 'turn/start': {
      result = { turn };
      break;
    }
    default: {
      send({ id: request.id, error: { code: -32_601, message: `Unhandled fixture method: ${request.method}` } });
      continue;
    }
  }
  send({ id: request.id, result });
  if (request.method === 'turn/start') {
    notify('turn/started', { turn });
    notify('item/reasoning/summaryTextDelta', {
      itemId: 'streamed',
      summaryIndex: 0,
      delta: '**Preparing a status comment**',
    });
    notify('item/reasoning/summaryPartAdded', { itemId: 'streamed', summaryIndex: 1 });
    notify('item/reasoning/summaryTextDelta', { itemId: 'streamed', summaryIndex: 1, delta: '**Checking ' });
    notify('item/reasoning/summaryTextDelta', { itemId: 'streamed', summaryIndex: 1, delta: 'plot quality**' });
    notify('item/reasoning/textDelta', { itemId: 'streamed', contentIndex: 0, delta: 'Raw detail' });
    notify('item/completed', {
      item: {
        type: 'reasoning',
        id: 'streamed',
        summary: ['**Preparing a status comment**', '**Checking plot quality**'],
        content: [],
      },
    });
    notify('item/completed', {
      item: {
        type: 'reasoning',
        id: 'completed',
        summary: ['**Preparing supplemental CAD details**', '**Checking plot quality**'],
        content: [],
      },
    });
    notify('item/completed', {
      item: { type: 'reasoning', id: 'raw', summary: [], content: ['**Raw formatting is not a summary**'] },
    });
    notify('turn/completed', { turn: { ...turn, status: 'completed' } });
  }
}
