/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's provider wire is snake_case. */
import { createServer } from 'node:http';
import type { Page } from 'playwright';

/**
 * The deterministic chat tier's mocked model gateway (substrate wave S0).
 *
 * A desktop port of `apps/ui-e2e/src/support/browser-command.ts`'s
 * `uiInstallAgentHostGatewayFixture`. A Tau turn runs in the renderer's browser
 * agent host, which speaks a provider wire straight to
 * `POST <api>/v1/llm/anthropic/v1/messages`; the API is a dumb pipe on that
 * path. Redirecting exactly that request to a local server makes the chat tier
 * deterministic without an API key, a provider round trip or the retired `tau`
 * replay wire (charter ruling C3's re-rule, 2026-09-02).
 *
 * Three differences from the web fixture:
 *
 * - The renderer's document origin is `app://tau`, so every CORS header echoes
 *   the request's own `origin` rather than a test base URL.
 * - `GET /v1/models` is **not** stubbed. `ui-e2e`'s browser-host vertical runs
 *   with no API at all and has to fake the catalog; this suite boots a real API
 *   on its own port for auth, projects and credits, and that API already serves
 *   the same rows out of `model.constants.ts`. A second copy could only drift.
 * - Only the Anthropic path is redirected, so the live tier can seed a project
 *   on the mock for free and still spend on a real OpenAI row.
 *
 * The scripted turn is the simplest one that proves the whole desktop chain:
 * one `create_file` writing a real OpenSCAD model to `main.scad` (so the native
 * kernel renders it and the viewport frames it), then a closing `end_turn`.
 * There is no holdable gate — no desktop spec asserts a partial stream.
 */

/** The catalog row the deterministic specs drive, and the wire it speaks. */
export const gatewayFixtureModelName = 'Haiku 4.5';
/** The same row's catalog id, as it appears on the wire. */
export const gatewayFixtureModelId = 'anthropic-claude-haiku-4.5';

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

const defaultGatewayFixtureFile: GatewayFixtureFile = {
  targetFile: 'main.scad',
  content: gatewayFixtureScadSource,
};

/** The renderer's document origin, and therefore every request's `Origin`. */
const desktopAppOrigin = 'app://tau';
const gatewayPath = '/v1/llm/anthropic/v1/messages';

/** One installed fixture: what it saw, and how to take it down. */
export type GatewayFixture = {
  /** Every gateway request body, in order. */
  readonly gatewayRequests: readonly unknown[];
  /** Every `\/v1\/chat\/` path the renderer still called, in order. */
  readonly apiChatRequests: readonly string[];
  /**
   * The port the mock listens on.
   *
   * Launcher 2 needs it *before* the app starts: the services utility reads
   * `TAU_DESKTOP_AGENT_GATEWAY_URL` at fork time and calls the gateway with
   * Node `fetch`, which no page route can touch.
   */
  readonly port: number;
  /** Point one renderer's own gateway and chat calls at this mock. */
  readonly routeThrough: (page: Page) => Promise<void>;
  readonly close: () => Promise<void>;
};

type WireMessage = { readonly content?: unknown };

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

const corsHeaders = (origin: string | undefined): Record<string, string> => ({
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'accept,anthropic-version,authorization,content-type',
  'access-control-allow-methods': 'OPTIONS,POST',
  'access-control-allow-origin': origin ?? desktopAppOrigin,
});

/**
 * Serve the Anthropic wire locally, without binding it to a renderer yet.
 *
 * Split from {@link installGatewayFixture} for launcher 2, whose gateway caller
 * is the services utility rather than the page: its `TAU_DESKTOP_AGENT_GATEWAY_URL`
 * has to be known before `electron.launch`, so the server must outlive — and
 * predate — any page.
 *
 * @returns The live fixture; close it in `afterEach`.
 */
export const startGatewayFixture = async (
  file: GatewayFixtureFile = defaultGatewayFixtureFile,
): Promise<GatewayFixture> => {
  const gatewayRequests: unknown[] = [];
  const apiChatRequests: string[] = [];
  let requestIndex = 0;

  const server = createServer((request, response) => {
    // async-iife: bootstrap
    // Node owns request-listener settlement; failures become connection errors.
    void (async () => {
      const headers = corsHeaders(request.headers.origin);
      try {
        if (request.method === 'OPTIONS') {
          response.writeHead(204, {
            ...headers,
            'access-control-allow-headers':
              request.headers['access-control-request-headers'] ?? headers['access-control-allow-headers'],
          });
          response.end();
          return;
        }
        const requestPath = new URL(request.url ?? '/', 'http://desktop-gateway.invalid').pathname;
        if (request.method !== 'POST' || requestPath !== gatewayPath) {
          throw new Error(`Unexpected browser-host gateway request: ${request.method ?? 'unknown'} ${requestPath}`);
        }
        if (request.headers['anthropic-version'] !== '2023-06-01') {
          throw new Error('Browser-host Anthropic gateway request omitted anthropic-version: 2023-06-01.');
        }

        const chunks: string[] = [];
        request.setEncoding('utf8');
        for await (const chunk of request) {
          chunks.push(String(chunk));
        }
        const body = JSON.parse(chunks.join('')) as { readonly messages?: readonly WireMessage[] };
        gatewayRequests.push(body);

        const index = requestIndex++;
        const closing = endsWithToolResult(body);
        const writeEvent = (event: string, data: unknown): void => {
          response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };
        response.writeHead(200, { ...headers, 'cache-control': 'no-cache', 'content-type': 'text/event-stream' });
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
            usage: { input_tokens: 20, output_tokens: 0 },
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
            usage: { output_tokens: 9 },
          });
        } else {
          writeEvent('content_block_start', {
            type: 'content_block_start',
            index: 1,
            content_block: {
              type: 'tool_use',
              id: `desktop-e2e-call-${String(index)}`,
              name: 'create_file',
              input: {},
            },
          });
          writeEvent('content_block_delta', {
            type: 'content_block_delta',
            index: 1,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(file),
            },
          });
          writeEvent('content_block_stop', { type: 'content_block_stop', index: 1 });
          writeEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'tool_use', stop_sequence: null },
            usage: { output_tokens: 48 },
          });
        }
        writeEvent('message_stop', { type: 'message_stop' });
        response.end();
      } catch (error) {
        /* Destroying the socket makes a rejected request invisible to the spec:
         * the chat simply never advances and the poll dies at its timeout with
         * no cause. Name the fault before dropping the wire. */
        console.error('[desktop-gateway] rejected request', error);
        response.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('The desktop gateway fixture did not bind a TCP address.');
  }

  const routeThrough = async (page: Page): Promise<void> => {
    const context = page.context();
    /* Only the Anthropic wire, never `/v1/llm/` wholesale: the live tier seeds
     * its project on this mock and then spends on an OpenAI row, so a broader
     * route would swallow the one turn that is supposed to reach a provider.
     *
     * Redirected below the renderer's CSP: the page still sees the API origin it
     * is allowed to connect to, and `connect-src` never learns about 127.0.0.1. */
    await context.route(/\/v1\/llm\/anthropic\//u, async (route) => {
      const url = new URL(route.request().url());
      url.hostname = '127.0.0.1';
      url.port = String(address.port);
      await route.continue({ url: url.href });
    });
    /* A browser-placed chat's runs live in its durable log on disk, never in
     * the API. Recorded, never redirected — the call reaches the API exactly as
     * it did before, so this observation changes no behaviour. */
    await context.route(/\/v1\/chat\//u, async (route) => {
      apiChatRequests.push(new URL(route.request().url()).pathname);
      await route.continue();
    });
  };

  return {
    apiChatRequests,
    port: address.port,
    routeThrough,
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
 * Start the mock and bind it to one renderer — the browser-host tiers' form.
 *
 * @param page - The Electron renderer page, already launched.
 * @returns The live fixture; close it in `afterEach`.
 */
export const installGatewayFixture = async (page: Page, file?: GatewayFixtureFile): Promise<GatewayFixture> => {
  const fixture = await startGatewayFixture(file);
  await fixture.routeThrough(page);
  return fixture;
};
