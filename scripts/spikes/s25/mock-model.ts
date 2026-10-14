/**
 * Spike S25: a loopback stand-in for a model API so an agent client can be driven through one MCP
 * tool call with no credential. It answers OpenAI Responses (`POST …/responses`, Codex) and
 * Anthropic Messages (`POST …/messages`, Claude Code) as server-sent events: the first turn that
 * offers the target tool gets a call to it, any later turn gets a short final text.
 *
 * Spike code only. Usage:
 *   node scripts/spikes/s25/mock-model.ts <port-file> <log.jsonl> <tool-suffix> [<arguments-json>]
 * Writes the bound loopback port to <port-file>. Logs request shapes (paths, tool names, whether a
 * tool result came back); never a header value. Runs until killed.
 */

/* eslint-disable @typescript-eslint/naming-convention -- model wire names are the subject of this spike. */

import { appendFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import process from 'node:process';

type JsonObject = Record<string, unknown>;

const [portFile, logPath, toolSuffix, argumentsJson = '{}'] = process.argv.slice(2);
if (!portFile || !logPath || !toolSuffix) {
  process.stderr.write('usage: mock-model.ts <port-file> <log.jsonl> <tool-suffix> [<arguments-json>]\n');
  process.exit(2);
}

const log = (event: JsonObject): void => {
  appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
};

/**
 * Names of the tools a request offers, flattening namespaced tool groups.
 *
 * @param tools - The request's `tools` array.
 * @returns Every offered tool name.
 */
const toolNames = (tools: unknown): string[] => {
  if (!Array.isArray(tools)) {
    return [];
  }

  const names: string[] = [];
  for (const tool of tools as JsonObject[]) {
    if (typeof tool['name'] === 'string') {
      names.push(tool['name']);
    }

    const functionDefinition = tool['function'] as JsonObject | undefined;
    if (functionDefinition && typeof functionDefinition['name'] === 'string') {
      names.push(functionDefinition['name']);
    }

    if (Array.isArray(tool['tools'])) {
      const prefix = typeof tool['name'] === 'string' ? tool['name'] : '';
      for (const inner of toolNames(tool['tools'])) {
        names.push(`${prefix}\u0000${inner}`);
      }
    }
  }

  return names;
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  request.setEncoding('utf8');
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
  }

  return body;
};

const sse = (response: ServerResponse, events: Array<[string, JsonObject]>): void => {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const [event, data] of events) {
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  response.end();
};

let sequence = 0;

const responses = (response: ServerResponse, body: JsonObject): void => {
  sequence += 1;
  const id = `resp_${sequence}`;
  const input = Array.isArray(body['input']) ? (body['input'] as JsonObject[]) : [];
  const toolResults = input.filter((item) => item['type'] === 'function_call_output').length;
  const toolResultSeen = toolResults > 0;
  const names = toolNames(body['tools']);
  /* After a `hang` result, one follow-up `env_names` call keeps the session open so a late cancellation can land. */
  const wanted = toolSuffix === 'hang' && toolResults === 1 ? 'env_names' : toolSuffix;
  const target = names.find((name) => name.endsWith(wanted));
  log({
    api: 'responses',
    id,
    toolCount: names.length,
    mcpLikeTools: names.filter((n) => /probe/u.test(n)),
    target: target ?? null,
    toolResultSeen,
  });
  const usage = {
    input_tokens: 1,
    input_tokens_details: null,
    output_tokens: 1,
    output_tokens_details: null,
    total_tokens: 2,
  };
  const item: JsonObject =
    target && (toolResults === 0 || wanted !== toolSuffix)
      ? (() => {
          const [namespace, inner] = target.includes('\u0000') ? target.split('\u0000') : [undefined, target];
          return {
            type: 'function_call',
            id: `fc_${sequence}`,
            call_id: `call_${sequence}`,
            name: inner,
            ...(namespace ? { namespace } : {}),
            arguments: wanted === toolSuffix ? argumentsJson : '{}',
          };
        })()
      : { type: 'message', role: 'assistant', id: `msg_${sequence}`, content: [{ type: 'output_text', text: 'done' }] };
  sse(response, [
    ['response.created', { type: 'response.created', response: { id } }],
    ['response.output_item.done', { type: 'response.output_item.done', output_index: 0, item }],
    ['response.completed', { type: 'response.completed', response: { id, usage } }],
  ]);
};

const messages = (response: ServerResponse, body: JsonObject): void => {
  sequence += 1;
  const id = `msg_${sequence}`;
  const turns = Array.isArray(body['messages']) ? (body['messages'] as JsonObject[]) : [];
  const toolResults = turns.filter(
    (turn) =>
      Array.isArray(turn['content']) &&
      (turn['content'] as JsonObject[]).some((block) => block['type'] === 'tool_result'),
  ).length;
  const toolResultSeen = toolResults > 0;
  const names = toolNames(body['tools']);
  const wanted = toolSuffix === 'hang' && toolResults === 1 ? 'env_names' : toolSuffix;
  const target = names.find((name) => name.endsWith(wanted));
  log({
    api: 'messages',
    id,
    toolCount: names.length,
    mcpLikeTools: names.filter((n) => /probe/u.test(n)),
    target: target ?? null,
    toolResultSeen,
  });
  const model = typeof body['model'] === 'string' ? body['model'] : 'mock';
  const usage = { input_tokens: 1, output_tokens: 1 };
  const events: Array<[string, JsonObject]> = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id,
          type: 'message',
          role: 'assistant',
          model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage,
        },
      },
    ],
  ];
  if (target && (toolResults === 0 || wanted !== toolSuffix)) {
    events.push(
      [
        'content_block_start',
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: `toolu_${sequence}`, name: target, input: {} },
        },
      ],
      [
        'content_block_delta',
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: wanted === toolSuffix ? argumentsJson : '{}' },
        },
      ],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      [
        'message_delta',
        { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } },
      ],
    );
  } else {
    events.push(
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'done' } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      [
        'message_delta',
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
      ],
    );
  }

  events.push(['message_stop', { type: 'message_stop' }]);
  sse(response, events);
};

/**
 * Answers one request.
 *
 * @param request - The request.
 * @param response - The response.
 */
const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const raw = await readBody(request);
  const path = (request.url ?? '').split('?')[0] ?? '';
  let body: JsonObject = {};
  try {
    body = raw ? (JSON.parse(raw) as JsonObject) : {};
  } catch {
    body = {};
  }

  if (request.method === 'POST' && path.endsWith('/responses')) {
    responses(response, body);
    return;
  }

  if (request.method === 'POST' && path.endsWith('/messages')) {
    messages(response, body);
    return;
  }

  log({ api: 'other', method: request.method ?? 'unknown', path });
  response.writeHead(path.endsWith('/models') ? 200 : 404, { 'content-type': 'application/json' });
  response.end(path.endsWith('/models') ? JSON.stringify({ data: [], models: [] }) : '{}');
};

/**
 * Answers one request, turning a failure into a logged 500.
 *
 * @param request - The request.
 * @param response - The response.
 */
const respond = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  try {
    await handle(request, response);
  } catch (error) {
    log({ api: 'error', message: error instanceof Error ? error.message : String(error) });
    response.writeHead(500);
    response.end();
  }
};

const server = createServer((request, response) => {
  void respond(request, response);
});

server.listen(0, '127.0.0.1', () => {
  writeFileSync(portFile, String((server.address() as AddressInfo).port));
});
