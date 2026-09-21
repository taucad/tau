/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire is snake_case. */
import { createServer } from 'node:http';
import type { Page } from 'playwright';
import { desktopE2EProviderStubUrl } from '#support/config.js';

/**
 * The deterministic chat tier's stubbed **provider upstream** (D16/D19).
 *
 * It used to be a mocked *gateway*: a page route redirected the renderer's
 * `POST <api>/v1/llm/anthropic/v1/messages` to this server and the API was
 * bypassed entirely. Two things retired that shape. D18 removed the desktop's
 * browser placement row, so every desktop turn now runs in the services utility
 * and calls the API with Node `fetch` that no page route can touch; and D19 asks
 * for launcher 2 verified against the *real* Tau gateway.
 *
 * So this server moved one hop further out. `global-setup.ts` names it to the API
 * as `TAU_LLM_PROVIDER_UPSTREAM_URL`, and every funded call arrives here as
 * `POST /v1/messages` having already passed admission, qualification and the
 * catalog→supplier rewrite. That makes the whole chain assertable without a
 * provider key: what this server sees is the *supplier* model id, which is the
 * forwarded half of D16's one vocabulary.
 *
 * Two things it deliberately does not do:
 *
 * - `GET /v1/models` is **not** stubbed. This suite boots a real API on its own
 *   port, and that API already serves the same rows out of `model.constants.ts`.
 * - No CORS. The only client is the API's own Node `fetch`; the renderer talks to
 *   the API origin it is allowed to connect to and never to 127.0.0.1.
 *
 * The scripted turn is the simplest one that proves the whole desktop chain:
 * one `create_file` writing a real OpenSCAD model to `main.scad` (so the native
 * kernel renders it and the viewport frames it), then a closing `end_turn`.
 * There is no holdable gate — no desktop spec asserts a partial stream.
 */

/** The catalog row the deterministic specs drive, and the wire it speaks. */
export const gatewayFixtureModelName = 'Haiku 4.5';
/** The same row's catalog id — what a client sends, and all the gateway accepts. */
export const gatewayFixtureModelId = 'anthropic-claude-haiku-4.5';
/** The supplier id the gateway rewrites that row to; what this stub must receive. */
export const gatewayFixtureSupplierModelId = 'claude-haiku-4-5-20251001';

/** The assistant's opening line, before the tool call. */
export const gatewayFixtureOpeningText = 'Browser host started the workspace change.';
/** The assistant's closing line — the transcript's last message. */
export const gatewayFixtureFinalText = 'Browser host completed the workspace change.';

/** The model the scripted `create_file` writes. Renders to a cube with a bore. */
export const gatewayFixtureScadSource = `// Cube with cylinder cutout
$fa = 2;
$fs = 0.4;

cube_size = 20;
cylinder_radius = 5;

difference() {
    cube(cube_size, center = true);
    cylinder(h = cube_size + 2, r = cylinder_radius, center = true);
}
`;

/** File written by one deterministic gateway turn. */
export type GatewayFixtureFile = {
  readonly targetFile: string;
  readonly content: string;
};

/** One deterministic tool call emitted by the gateway on its own model round. */
export type GatewayFixtureToolCall = {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
};

/** Optional multi-round tool script; the existing single-file input remains the default. */
export type GatewayFixtureScript = {
  /**
   * The tool calls one turn emits, in order.
   *
   * A function is handed the zero-based turn index, so a second turn in the same
   * chat can write *different* bytes. Replaying the same arguments is not
   * neutral: a byte-identical rewrite settles as `turn.finalized` with no
   * changed paths (nothing to save, so no revision marker), and two turns of
   * identical `create_file`/`get_kernel_result` pairs are exactly the four-event
   * alternation the host's `ping_pong` safeguard nudges on
   * (`packages/agent-host/src/harness/safeguards.ts:397-416`).
   */
  readonly toolCalls: readonly GatewayFixtureToolCall[] | ((turn: number) => readonly GatewayFixtureToolCall[]);
};

const defaultGatewayFixtureFile: GatewayFixtureFile = {
  targetFile: 'main.scad',
  content: gatewayFixtureScadSource,
};

/** The path the API's anthropic adapter targets, origin-swapped to this stub. */
const upstreamPath = '/v1/messages';

/** One installed fixture: what it saw, and how to take it down. */
export type GatewayFixture = {
  /** Every forwarded provider request body, in order, as the supplier saw it. */
  readonly gatewayRequests: readonly unknown[];
  /** Each forwarded request's `model`, in order — the supplier ids the gateway rewrote to. */
  readonly supplierModels: readonly string[];
  /** The `anthropic-beta` header value of every forwarded request, `undefined` when absent. */
  readonly supplierBetas: ReadonlyArray<string | undefined>;
  /** Every `\/v1\/chat\/` path the renderer called, in order. */
  readonly apiChatRequests: readonly string[];
  /** Record one renderer's API chat calls. Nothing is redirected any more. */
  readonly routeThrough: (page: Page) => Promise<void>;
  /**
   * Answer every later provider request with a coded refusal, or restore the
   * script with `undefined` — the desktop twin of ui-e2e's
   * `uiSetAgentHostGatewayFailure`, one hop further out.
   */
  readonly setFailure: (failure: GatewayFixtureFailure | undefined) => void;
  readonly close: () => Promise<void>;
};

/** A provider refusal, in Anthropic's own error shape. */
export type GatewayFixtureFailure = Readonly<{ status: number; message: string }>;

type WireMessage = { readonly content?: unknown; readonly role?: unknown };

/**
 * Whether the tool this request is answering has just run.
 *
 * Parity on a request counter is what the web fixture uses, and it breaks here:
 * the desktop scenario cancels a seeding turn, so the counter can enter the
 * turn that matters on either phase. Reading the conversation instead makes
 * each request self-describing.
 *
 * The **last** message, never the whole history: a second turn in the same chat
 * carries the first turn's `tool_result` in its history, so a `some()` over
 * every message would answer that turn's opening request with the closing
 * message and never write the file. After a `tool_use` the client appends one
 * user message holding the results; a fresh prompt ends on the user's text.
 *
 * @param body - The decoded Anthropic request body.
 * @returns True when the final message holds a `tool_result` block.
 */
export const endsWithToolResult = (body: { readonly messages?: readonly WireMessage[] }): boolean => {
  const last = (body.messages ?? []).at(-1)?.content;
  return Array.isArray(last) && last.some((block) => (block as { readonly type?: string }).type === 'tool_result');
};

const holdsToolResult = (message: WireMessage): boolean =>
  Array.isArray(message.content) &&
  message.content.some((block) => (block as { readonly type?: string }).type === 'tool_result');

/**
 * Which turn this request belongs to, zero-based.
 *
 * A turn is one *prompt*: every other user message in the history carries the
 * previous round's `tool_result` blocks.
 *
 * @param body - The decoded Anthropic request body.
 * @returns The zero-based turn index.
 */
const turnIndex = (body: { readonly messages?: readonly WireMessage[] }): number =>
  (body.messages ?? []).filter((message) => message.role === 'user' && !holdsToolResult(message)).length - 1;

const completedToolCallCount = (body: { readonly messages?: readonly WireMessage[] }): number => {
  let count = 0;
  const { messages = [] } = body;
  for (const message of messages.toReversed()) {
    if (message.role !== 'user') {
      continue;
    }
    const { content } = message;
    let messageResults = 0;
    if (Array.isArray(content)) {
      messageResults = content.filter((block) => (block as { readonly type?: string }).type === 'tool_result').length;
    }
    if (messageResults === 0) {
      break;
    }
    count += messageResults;
  }
  return count;
};

/**
 * Serve the provider upstream locally, without binding it to a renderer yet.
 *
 * Started per test and torn down in `afterEach`, on the fixed port the API was
 * told about once at boot ({@link desktopE2EProviderStubUrl}).
 *
 * @returns The live fixture; close it in `afterEach`.
 */
export const startGatewayFixture = async (
  input: GatewayFixtureFile | GatewayFixtureScript = defaultGatewayFixtureFile,
): Promise<GatewayFixture> => {
  const script: GatewayFixtureScript['toolCalls'] =
    'toolCalls' in input ? input.toolCalls : [{ name: 'create_file', input }];
  const gatewayRequests: unknown[] = [];
  const supplierModels: string[] = [];
  const supplierBetas: Array<string | undefined> = [];
  const apiChatRequests: string[] = [];
  let requestIndex = 0;
  let failure: GatewayFixtureFailure | undefined;

  const server = createServer((request, response) => {
    // async-iife: bootstrap
    // Node owns request-listener settlement; failures become connection errors.
    void (async () => {
      try {
        const requestPath = new URL(request.url ?? '/', 'http://desktop-provider-stub.invalid').pathname;
        if (request.method === 'GET' && requestPath === '/health/live') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end('{"status":"ok"}');
          return;
        }
        if (request.method !== 'POST' || requestPath !== upstreamPath) {
          throw new Error(`Unexpected provider upstream request: ${request.method ?? 'unknown'} ${requestPath}`);
        }
        /* The gateway forwards exactly the Anthropic headers the funded request
         * contract admits (`billable-model-qualification.ts`), so a missing
         * version means the request did not come through the gateway. */
        if (request.headers['anthropic-version'] !== '2023-06-01') {
          throw new Error('Forwarded Anthropic request omitted anthropic-version: 2023-06-01.');
        }

        const chunks: string[] = [];
        request.setEncoding('utf8');
        for await (const chunk of request) {
          chunks.push(String(chunk));
        }
        const body = JSON.parse(chunks.join('')) as {
          readonly messages?: readonly WireMessage[];
          readonly model?: unknown;
        };
        gatewayRequests.push(body);
        /* D16's forwarded half, asserted where it is actually observable: the
         * client sent the catalog route id and the gateway rewrote it. Refused
         * rather than recorded — a catalog id arriving here would mean the
         * gateway relayed the request untranslated. */
        if (body.model !== gatewayFixtureSupplierModelId) {
          throw new Error(
            `Forwarded provider request carried model ${JSON.stringify(body.model)}; expected the supplier id ${gatewayFixtureSupplierModelId}.`,
          );
        }
        supplierModels.push(body.model);
        const beta = request.headers['anthropic-beta'];
        supplierBetas.push(Array.isArray(beta) ? beta.join(',') : beta);
        if (failure !== undefined) {
          response.writeHead(failure.status, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: failure.message } }));
          return;
        }

        const index = requestIndex++;
        const completedCalls = completedToolCallCount(body);
        const toolCall = (typeof script === 'function' ? script(turnIndex(body)) : script)[completedCalls];
        const closing = toolCall === undefined;
        const writeEvent = (event: string, data: unknown): void => {
          response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        response.writeHead(200, {
          'cache-control': 'no-cache',
          'content-type': 'text/event-stream',
          'x-tau-operation-id': `desktop-e2e-operation-${String(index)}`,
        });
        response.flushHeaders();
        writeEvent('message_start', {
          type: 'message_start',
          message: {
            id: `desktop-e2e-message-${String(index)}`,
            type: 'message',
            role: 'assistant',
            content: [],
            model: gatewayFixtureModelId,
            stop_reason: null,
            stop_sequence: null,
            /* All four dimensions the haiku route prices. Anthropic reports the two
             * cache counters on every stream, and the API's evidence collector treats
             * a missing one as `absorbed_unknown`: the turn then never settles and the
             * account's balance never moves, which is exactly what the receipt asserts. */
            usage: { input_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 },
          },
        });
        writeEvent('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        });
        writeEvent('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: closing ? gatewayFixtureFinalText : gatewayFixtureOpeningText },
        });
        writeEvent('content_block_stop', { type: 'content_block_stop', index: 0 });
        if (closing) {
          writeEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 9 },
          });
        } else {
          writeEvent('content_block_start', {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: `desktop-e2e-call-${String(index)}`,
              name: toolCall.name,
              input: {},
            },
          });
          writeEvent('content_block_delta', {
            type: 'content_block_delta',
            index: 1,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(toolCall.input),
            },
          });
          writeEvent('content_block_stop', { type: 'content_block_stop', index: 1 });
          writeEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 48 },
          });
        }
        writeEvent('message_stop', { type: 'message_stop' });
        response.end();
      } catch (error) {
        /* Destroying the socket makes a rejected request invisible to the spec:
         * the chat simply never advances and the poll dies at its timeout with
         * no cause. Name the fault before dropping the wire. */
        console.error('[desktop-provider-stub] rejected request', error);
        response.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
  const stub = new URL(desktopE2EProviderStubUrl);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(stub.port), stub.hostname, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const routeThrough = async (page: Page): Promise<void> => {
    const context = page.context();
    /* Recorded, never redirected: a chat's runs live in its durable log on disk,
     * and this call reaches the API exactly as it did before, so the observation
     * changes no behaviour. The renderer's own `/v1/llm/` route is gone with the
     * browser placement (D18) — the services utility calls the gateway with Node
     * `fetch`, which no page route can see, and the stub above is where that
     * traffic is observed instead. */
    await context.route(/\/v1\/chat\//u, async (route) => {
      apiChatRequests.push(new URL(route.request().url()).pathname);
      await route.continue();
    });
  };

  return {
    apiChatRequests,
    supplierModels,
    supplierBetas,
    routeThrough,
    setFailure: (next) => {
      failure = next;
    },
    close: async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
    gatewayRequests,
  };
};

/**
 * Start the stub and record one renderer's API chat calls.
 *
 * @param page - The Electron renderer page, already launched.
 * @param file - The file the scripted `create_file` writes.
 * @returns The live fixture; close it in `afterEach`.
 */
export const installGatewayFixture = async (page: Page, file?: GatewayFixtureFile): Promise<GatewayFixture> => {
  const fixture = await startGatewayFixture(file);
  await fixture.routeThrough(page);
  return fixture;
};

/** One `tool_result` block as the provider wire carries it. */
type WireToolResult = {
  readonly content?: unknown;
  readonly is_error?: unknown;
  readonly tool_use_id?: unknown;
  readonly type?: unknown;
};

/**
 * Every failed `tool_result` in the given forwarded requests, bounded so the
 * failure message stays readable.
 *
 * The agent's runtime tools (`get_kernel_result`, `screenshot`, `test_model`)
 * run in the services utility, and a request main refuses answers the agent
 * with an *error result* rather than a failed run — so every other assertion in
 * a row still passes while the tool never touched the kernel. This is the seam
 * that reads it, shared by the three specs that assert on it. Every forwarded
 * request carries the whole conversation, so the last one covers every turn.
 *
 * @param requests - Forwarded provider request bodies, e.g.
 *   `fixture.gatewayRequests.slice(-1)`.
 * @returns One bounded JSON line per failed tool result.
 */
export const failedGatewayToolResults = (requests: readonly unknown[]): readonly string[] =>
  requests
    .flatMap((request) => {
      const messages =
        (request as { readonly messages?: ReadonlyArray<{ readonly content?: unknown }> }).messages ?? [];
      return messages.flatMap((message) =>
        Array.isArray(message.content) ? (message.content as readonly WireToolResult[]) : [],
      );
    })
    .filter((block) => block.type === 'tool_result' && block.is_error === true)
    .map((block) =>
      JSON.stringify({
        toolUseId: block.tool_use_id,
        content:
          typeof block.content === 'string' ? block.content.slice(0, 2e3) : JSON.stringify(block.content).slice(0, 2e3),
      }),
    );
