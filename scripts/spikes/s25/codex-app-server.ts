/**
 * Spike S25: drives one turn through `codex app-server` (the JSON-RPC surface Codex's own UIs consume)
 * and records which notifications reach the UI layer, in particular `item/mcpToolCall/progress`.
 *
 * Spike code only. Usage (environment prepared by run.ts, CODEX_HOME pointing at the mock provider):
 *   node scripts/spikes/s25/codex-app-server.ts <codex-bin> <cwd> <deadline-ms>
 * Prints one JSON line on stdout: notification method counts and the progress messages. Exit 0.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';
import { createInterface } from 'node:readline';

type JsonObject = Record<string, unknown>;

const [codexBin, cwd, deadline = '60000'] = process.argv.slice(2);
if (!codexBin || !cwd) {
  process.stderr.write('usage: codex-app-server.ts <codex-bin> <cwd> <deadline-ms>\n');
  process.exit(2);
}

const child = spawn(codexBin, ['app-server'], { cwd, env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });
const pending = new Map<number, (result: JsonObject) => void>();
const counts: Record<string, number> = {};
const progressMessages: string[] = [];
const errors: unknown[] = [];
let nextId = 1;
let finish: () => void = () => undefined;
const finished = new Promise<void>((resolve) => {
  finish = resolve;
});

const request = async (method: string, params: JsonObject): Promise<JsonObject> =>
  new Promise((resolve) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });

createInterface({ input: child.stdout }).on('line', (line) => {
  let message: JsonObject;
  try {
    message = JSON.parse(line) as JsonObject;
  } catch {
    return;
  }

  if (typeof message['id'] === 'number' && message['method'] === undefined) {
    if (message['error'] !== undefined) {
      errors.push(message['error']);
    }

    pending.get(message['id'])?.((message['result'] ?? {}) as JsonObject);
    pending.delete(message['id']);
    return;
  }

  const method = String(message['method']);
  if (typeof message['id'] === 'number') {
    /* A server request (an approval): decline so the turn continues. */
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: message['id'], result: { decision: 'decline' } })}\n`);
  }

  counts[method] = (counts[method] ?? 0) + 1;
  const params = (message['params'] ?? {}) as JsonObject;
  if (method === 'item/mcpToolCall/progress') {
    progressMessages.push(String(params['message']));
  }

  if (method === 'turn/completed') {
    finish();
  }
});

const timer = setTimeout(() => {
  errors.push('deadline');
  finish();
}, Number(deadline));

await request('initialize', { clientInfo: { name: 's25-probe-client', title: 'S25', version: '0.0.0' } });
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`);
const thread = await request('thread/start', { cwd });
const threadId = String(((thread['thread'] ?? {}) as JsonObject)['id']);
await request('turn/start', { threadId, input: [{ type: 'text', text: 'Call the tool.' }] });
await finished;
clearTimeout(timer);
child.kill('SIGTERM');
process.stdout.write(`${JSON.stringify({ counts, progressMessages, errors })}\n`);
