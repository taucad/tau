import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTauMcpHttpHandler, tauMcpInstructions, tauMcpToolNames } from '#tau-mcp.js';
import type { TauMcpDispatch, TauMcpHostCall, TauMcpHostTool } from '#tau-mcp.js';

const rpcName = { evaluateModel: 'evaluate_model' } as const;
const toolName = { evaluateModel: 'evaluate_model' } as const;

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

const serve = async (dispatch: TauMcpDispatch, hostTools?: readonly TauMcpHostTool[]): Promise<URL> => {
  const handler = createTauMcpHttpHandler({ hostTools });
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
  it('keeps overlapping calls bound to the dispatcher admitted with each request', async () => {
    const handler = createTauMcpHttpHandler();
    const labels: string[] = [];
    const firstStarted = Promise.withResolvers<void>();
    const releaseFirst = Promise.withResolvers<void>();
    const server = createServer((request, response) => {
      const pending = (async (): Promise<void> => {
        const body = request.method === 'POST' ? await readBody(request) : undefined;
        const label = String(request.headers['x-dispatch'] ?? 'init');
        await handler.handle({
          request,
          response,
          body,
          authorityKey: 'shared-authority',
          dispatch: async () => {
            labels.push(label);
            if (label === 'first') {
              firstStarted.resolve();
              await releaseFirst.promise;
            }
            return { success: true, status: 'ready' };
          },
        });
      })();
      pendingRequests.add(pending);
    });
    server.on('close', () => {
      void handler.close();
    });
    servers.add(server);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const url = new URL(`http://127.0.0.1:${String(address.port)}/v1/mcp`);
    const initialized = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
      }),
    });
    const sessionId = initialized.headers.get('mcp-session-id');
    await initialized.text();
    expect(sessionId).toBeTypeOf('string');
    const call = async (id: number, label: string): Promise<Response> =>
      fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId ?? '',
          'x-dispatch': label,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'evaluate_model', arguments: { targetFile: 'main.ts' } },
        }),
      });

    const first = call(1, 'first');
    await firstStarted.promise;
    const second = call(2, 'second');
    await vi.waitFor(() => {
      expect(labels).toEqual(['first', 'second']);
    });
    releaseFirst.resolve();
    const responses = await Promise.all([first, second]);
    await Promise.all(responses.map(async (response) => response.text()));

    expect(labels).toEqual(['first', 'second']);
  });

  it('initializes with CAD-loop guidance and effect-correct tool annotations', async () => {
    const calls: TauMcpHostCall[] = [];
    const dispatch: TauMcpDispatch = async (call) => {
      calls.push(call);
      return { success: true, status: 'ready' };
    };
    const client = await connect(await serve(dispatch));

    expect(client.getInstructions()).toBe(tauMcpInstructions);
    expect(client.getInstructions()).toContain('Before editing geometry, create or update executable GeoSpec tests');
    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual(tauMcpToolNames);
    expect(listed.tools.map(({ name, annotations }) => [name, annotations?.readOnlyHint])).toEqual([
      ['evaluate_model', true],
      ['test_model', true],
      ['screenshot', true],
      ['export_model', false],
    ]);
    await expect(
      client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } }),
    ).resolves.toMatchObject({ structuredContent: { status: 'ready' } });
    expect(calls).toEqual([{ rpcName: rpcName.evaluateModel, args: { targetFile: 'main.ts' } }]);
    await client.close();
  });

  it('lists host tools beside the CAD four with their own schema and dispatches them by name', async () => {
    const calls: TauMcpHostCall[] = [];
    const dispatch: TauMcpDispatch = async (call) => {
      calls.push(call);
      return 'toolName' in call
        ? { success: true, requestId: 'req-1', state: 'awaiting-approval' }
        : { errorCode: 'UNEXPECTED', message: 'not a host tool' };
    };
    const requestPrint: TauMcpHostTool = {
      name: 'request_job',
      description: 'Ask the person to approve one print.',
      inputSchema: {
        type: 'object',
        properties: { machineId: { type: 'string' }, file: { type: 'string' } },
        required: ['machineId', 'file'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    };
    const client = await connect(await serve(dispatch, [requestPrint]));

    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual([...tauMcpToolNames, 'request_job']);
    const tool = listed.tools.find(({ name }) => name === 'request_job');
    expect(tool?.inputSchema).toMatchObject({ type: 'object', required: ['machineId', 'file'] });
    expect(tool?.annotations?.openWorldHint).toBe(true);
    await expect(
      client.callTool({
        name: 'request_job',
        arguments: { machineId: 'bambu-simulator', file: 'pyramid.gcode.3mf' },
      }),
    ).resolves.toMatchObject({ structuredContent: { requestId: 'req-1', state: 'awaiting-approval' } });
    expect(calls).toEqual([
      { toolName: 'request_job', args: { machineId: 'bambu-simulator', file: 'pyramid.gcode.3mf' } },
    ]);
    // The SDK refuses arguments the host schema rejects before the host sees them.
    await expect(client.callTool({ name: 'request_job', arguments: { machineId: 1 } })).resolves.toMatchObject({
      isError: true,
    });
    expect(calls).toHaveLength(1);
    await client.close();
  });

  it('should serve a draft-07 host schema whose shared definition is reached by $ref', async () => {
    const calls: TauMcpHostCall[] = [];
    const dispatch: TauMcpDispatch = async (call) => {
      calls.push(call);
      return { success: true, requestId: 'req-1', state: 'awaiting-approval' };
    };
    /* What a host registry publishes for a recursive JSON value: draft-07 with
     * `$schema` removed and the value shared under `definitions`. */
    const jsonValue = { $ref: '#/definitions/value' };
    const requestPrint: TauMcpHostTool = {
      name: 'request_job',
      description: 'Ask the person to approve one print.',
      inputSchema: {
        type: 'object',
        properties: { targetFile: { type: 'string' }, options: { type: 'object', additionalProperties: jsonValue } },
        required: ['targetFile'],
        additionalProperties: false,
        definitions: {
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'boolean' },
              { type: 'null' },
              { type: 'array', items: jsonValue },
              { type: 'object', additionalProperties: jsonValue },
            ],
          },
        },
      },
    };
    const client = await connect(await serve(dispatch, [requestPrint]));

    const listed = await client.listTools();
    expect(listed.tools.find(({ name }) => name === 'request_job')?.inputSchema).toMatchObject({
      type: 'object',
      required: ['targetFile'],
    });
    const options = { plate: 1, filament: { slots: [2, 'PLA', null], dry: true } };
    await expect(
      client.callTool({ name: 'request_job', arguments: { targetFile: 'pyramid.gcode.3mf', options } }),
    ).resolves.toMatchObject({ structuredContent: { requestId: 'req-1', state: 'awaiting-approval' } });
    expect(calls).toEqual([{ toolName: 'request_job', args: { targetFile: 'pyramid.gcode.3mf', options } }]);
    await expect(
      client.callTool({ name: 'request_job', arguments: { targetFile: 'pyramid.gcode.3mf', options: 'fast' } }),
    ).resolves.toMatchObject({ isError: true });
    expect(calls).toHaveLength(1);
    await client.close();
  });

  it('should refuse a host schema it cannot use when the handler is created, naming the tool', () => {
    const broken: TauMcpHostTool = {
      name: 'broken_tool',
      description: 'Refers to a definition that does not exist.',
      inputSchema: { type: 'object', properties: { value: { $ref: '#/definitions/missing' } } },
    };

    expect(() => createTauMcpHttpHandler({ hostTools: [broken] })).toThrow(
      'Tau MCP host tool broken_tool has an input schema the MCP server cannot use: Reference not found: #/definitions/missing',
    );
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
    const pending = client.callTool({ name: toolName.evaluateModel, arguments: { targetFile: 'main.ts' } }, undefined, {
      signal: cancellation.signal,
    });
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
