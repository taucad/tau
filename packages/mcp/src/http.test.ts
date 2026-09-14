import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTauMcpHttpHandler, tauMcpInstructions, tauMcpToolNames } from '#tau-mcp.js';
import type { TauMcpDispatch, TauMcpRpcCall } from '#tau-mcp.js';

const rpcName = { getKernelResult: 'get_kernel_result' } as const;
const toolName = { getKernelResult: 'get_kernel_result' } as const;

const servers = new Set<ReturnType<typeof createServer>>();
const pendingRequests = new Set<Promise<void>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      async (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
  servers.clear();
  await Promise.all(pendingRequests);
  pendingRequests.clear();
});

const readBody = async (request: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<unknown> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
};

const serve = async (dispatch: TauMcpDispatch): Promise<URL> => {
  const handler = createTauMcpHttpHandler();
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const body = request.method === 'POST' ? await readBody(request) : undefined;
    await handler.handle({
      request,
      response,
      body,
      dispatch,
      authorityKey: String(request.headers.authorization ?? 'test-authority'),
    });
  };
  const trackRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      await handleRequest(request, response);
    } catch (error) {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  };
  const server = createServer((request, response) => {
    pendingRequests.add(trackRequest(request, response));
  });
  server.on('close', () => {
    void handler.close();
  });
  servers.add(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return new URL(`http://127.0.0.1:${String(address.port)}/v1/mcp`);
};

const connect = async (url: URL): Promise<Client> => {
  const client = new Client({ name: 'tau-mcp-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: 'Bearer authority-a' } } }),
  );
  return client;
};

describe('Tau MCP Streamable HTTP transport', () => {
  it('initializes with CAD-loop guidance and effect-correct tool annotations', async () => {
    const calls: TauMcpRpcCall[] = [];
    const dispatch: TauMcpDispatch = async (call) => {
      calls.push(call);
      return { success: true, status: 'ready' };
    };
    const client = await connect(await serve(dispatch));

    expect(client.getInstructions()).toBe(tauMcpInstructions);
    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual(tauMcpToolNames);
    expect(listed.tools.map(({ name, annotations }) => [name, annotations?.readOnlyHint])).toEqual([
      ['get_kernel_result', true],
      ['test_model', true],
      ['screenshot', true],
      ['export_geometry', false],
    ]);
    await expect(
      client.callTool({ name: toolName.getKernelResult, arguments: { targetFile: 'main.ts' } }),
    ).resolves.toMatchObject({ structuredContent: { status: 'ready' } });
    expect(calls).toEqual([{ rpcName: rpcName.getKernelResult, args: { targetFile: 'main.ts' } }]);
    await client.close();
  });

  it('forwards client cancellation to the run-bound dispatcher', async () => {
    const aborted = vi.fn();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const dispatch: TauMcpDispatch = async (_call, options) => {
      markStarted();
      return new Promise((resolve) => {
        if (options.signal?.aborted) {
          aborted();
          resolve({ success: false, errorCode: 'CANCELLED', message: 'Cancelled.' });
          return;
        }
        options.signal?.addEventListener(
          'abort',
          () => {
            aborted();
            resolve({ success: false, errorCode: 'CANCELLED', message: 'Cancelled.' });
          },
          { once: true },
        );
      });
    };
    const client = await connect(await serve(dispatch));
    const cancellation = new AbortController();
    const pending = client.callTool(
      { name: toolName.getKernelResult, arguments: { targetFile: 'main.ts' } },
      undefined,
      { signal: cancellation.signal },
    );
    await started;
    cancellation.abort();

    await expect(pending).rejects.toThrow();
    await vi.waitFor(() => {
      expect(aborted).toHaveBeenCalledOnce();
    });
    await client.close();
  });

  it('rejects a valid MCP session id presented under a different run authority', async () => {
    const dispatch: TauMcpDispatch = async () => ({ success: true, status: 'ready' });
    const url = await serve(dispatch);
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: 'Bearer authority-a' } },
    });
    const client = new Client({ name: 'tau-mcp-test', version: '1.0.0' });
    await client.connect(transport);
    expect(transport.sessionId).toBeTypeOf('string');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: 'Bearer authority-b',
        'content-type': 'application/json',
        'mcp-session-id': transport.sessionId ?? '',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(response.status).toBe(403);
    await client.close();
  });
});
