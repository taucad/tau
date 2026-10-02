import process from 'node:process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Server as SocketIoServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { ChatRpcService } from '#api/chat/chat-rpc.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import {
  expectHasToolCall,
  expectToolCallSucceeded,
  expectIncrementalToolInput,
  expectNoErrors,
  expectMultipleSteps,
  extractUsageData,
  expectCacheTokenNormalization,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, providerEnvForModelId, requiresEnv } from '#testing/skip-helpers.js';

const modelId = process.env['TEST_MODEL_ID'] ?? 'anthropic-claude-sonnet-4.6';

// Live test — requires the provider key derived from `TEST_MODEL_ID` (default
// `anthropic-claude-sonnet-4.6` => `ANTHROPIC_API_KEY`). Skips cleanly when
// the env var is missing so the rest of the API suite still runs.
const providerEnvVariable = providerEnvForModelId(modelId);

describe.skipIf(providerEnvVariable === undefined || requiresEnv(providerEnvVariable))(
  `Model Integration: ${modelId}`,
  () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    it('should use tool calls when requested', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `test-thread-tools-${Date.now()}`,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Create a file called main.ts with the following content: export default function main() { return "hello"; }',
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      const message = await collectFinalMessage(chunks);

      expectHasToolCall(message, 'create_file');
      expectToolCallSucceeded(message, 'create_file');

      // The model may write to 'main.ts' or '/main.ts' - check both
      const fileExists = (await testApp.memFs.exists('main.ts')) || (await testApp.memFs.exists('/main.ts'));
      expect(fileExists, 'Expected main.ts to exist in the in-memory filesystem').toBe(true);

      const path = (await testApp.memFs.exists('main.ts')) ? 'main.ts' : '/main.ts';
      const mainTs = await testApp.memFs.readFile(path, 'utf8');
      expect(mainTs).toBeTruthy();
    });

    it('should complete multi-turn tool execution without errors', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `test-thread-multiturn-${Date.now()}`,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: [
                    'Create a simple cube in main.ts using Replicad.',
                    'Think through the approach first, then create the file.',
                    'The file should contain:',
                    '',
                    'import { makeBaseBox } from "replicad";',
                    '',
                    'export const defaultParams = { size: 20 };',
                    '',
                    'export default function main(p = defaultParams) {',
                    '  return makeBaseBox(p.size, p.size, p.size);',
                    '}',
                  ].join('\n'),
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      const chunkTypes = chunks.map((c) => c.type);
      console.log('Multi-turn chunk types:', JSON.stringify(chunkTypes));

      // No error chunks should be present (catches 400s on second model invocation)
      expectNoErrors(chunks);

      // The agent should complete multiple steps: create_file → text response
      expectMultipleSteps(chunks, 2);

      // Should have completed the tool call
      expectHasToolCall(await collectFinalMessage(chunks), 'create_file');
    }, 120_000);

    it('should handle parallel tool calls without errors', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `test-thread-parallel-${Date.now()}`,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: [
                    'I need you to do two things at once:',
                    '1. Create a file called main.ts with this content:',
                    '',
                    'import { makeBaseBox } from "replicad";',
                    '',
                    'export const defaultParams = { size: 10 };',
                    '',
                    'export default function main(p = defaultParams) {',
                    '  return makeBaseBox(p.size, p.size, p.size);',
                    '}',
                    '',
                    '2. Read the file package.json',
                    '',
                    'Use both tools in the same response.',
                  ].join('\n'),
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      const chunkTypes = chunks.map((c) => c.type);
      console.log('Parallel tool call chunk types:', JSON.stringify(chunkTypes));

      expectNoErrors(chunks);

      const message = await collectFinalMessage(chunks);
      expectHasToolCall(message, 'create_file');

      // Verify tool-input-available chunks have non-empty input
      const toolInputAvailable = chunks.filter((c) => c.type === 'tool-input-available');
      for (const chunk of toolInputAvailable) {
        if ('input' in chunk) {
          expect(chunk.input, 'Expected tool-input-available to have non-empty input').toBeTruthy();
        }
      }
    }, 120_000);

    it('should stream tool call arguments incrementally', async () => {
      const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `test-thread-incremental-${Date.now()}`,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: [
                    'Create a file called main.ts with the following Replicad code.',
                    'The file content should be multi-line and non-trivial so it streams incrementally:',
                    '',
                    'import { draw, drawCircle } from "replicad";',
                    '',
                    'export const defaultParams = {};',
                    '',
                    'export default function main() {',
                    '  const base = draw()',
                    '    .hLine(50)',
                    '    .vLine(30)',
                    '    .hLine(-50)',
                    '    .close()',
                    '    .sketchOnPlane("XY")',
                    '    .extrude(20);',
                    '',
                    '  const hole = drawCircle(8)',
                    '    .sketchOnPlane("XY", 20)',
                    '    .extrude(-20);',
                    '',
                    '  return base.cut(hole);',
                    '}',
                    '',
                    'Use the create_file tool to write this exact content.',
                  ].join('\n'),
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

      const chunks = await collectStreamChunks(response);
      const message = await collectFinalMessage(chunks);

      expectHasToolCall(message, 'create_file');
      expectIncrementalToolInput(chunks, 'create_file');
    });

    it('should normalize cache tokens in usage data (inputTokens excludes cached)', async () => {
      const threadId = `test-thread-cache-norm-${Date.now()}`;

      // Turn 1: establish the conversation context so implicit caching kicks in
      const response1 = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Create a file called main.ts with the following Replicad code. Use the create_file tool.\n\nimport { makeBaseBox } from "replicad";\n\nexport const defaultParams = { size: 20 };\n\nexport default function main(p = defaultParams) {\n  return makeBaseBox(p.size, p.size, p.size);\n}',
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response1.ok, `Turn 1 HTTP ${response1.status}: ${response1.statusText}`).toBe(true);
      const chunks1 = await collectStreamChunks(response1);
      expectNoErrors(chunks1);
      const message1 = await collectFinalMessage(chunks1);

      // Turn 2: continue the same thread - the shared prefix should trigger caching
      const response2 = await fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: threadId,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Create a file called main.ts with the following Replicad code. Use the create_file tool.\n\nimport { makeBaseBox } from "replicad";\n\nexport const defaultParams = { size: 20 };\n\nexport default function main(p = defaultParams) {\n  return makeBaseBox(p.size, p.size, p.size);\n}',
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
            ...message1.parts
              .filter((p): p is typeof p & { type: 'text'; text: string } => p.type === 'text')
              .map((p) => ({
                id: 'msg_2',
                role: 'assistant',
                parts: [{ type: 'text', text: p.text }],
                metadata: { model: modelId, kernel: 'replicad' },
              })),
            {
              id: 'msg_3',
              role: 'user',
              parts: [
                {
                  type: 'text',
                  text: 'Now change the size to 30 and rename the file to cube.ts. Use the create_file tool.',
                },
              ],
              metadata: {
                model: modelId,
                kernel: 'replicad',
              },
            },
          ],
          agent: buildCadAgent(modelId, 'replicad'),
        }),
      });

      expect(response2.ok, `Turn 2 HTTP ${response2.status}: ${response2.statusText}`).toBe(true);
      const chunks2 = await collectStreamChunks(response2);
      expectNoErrors(chunks2);

      const usageData = extractUsageData(chunks2);
      console.log('Cache normalization usage data:', JSON.stringify(usageData, undefined, 2));

      expectCacheTokenNormalization(chunks2);
    }, 120_000);
  },
);

/**
 * Transport-level tests that validate the specific Socket.IO issues causing
 * WebSocket disconnections during chat RPC execution.
 *
 * These tests reproduce the exact failure conditions observed in production:
 *
 * 1. maxHttpBufferSize (Socket.IO default: 1MB) is too small for geometry payloads.
 *    The fetchGeometry RPC returns GLB data (Uint8Array) from the client to the server.
 *    Complex models (e.g. a detailed OpenSCAD helicopter, $fn=48, 7 files) produce
 *    2-5MB GLB. When the rpc_response message exceeds maxHttpBufferSize, Socket.IO's
 *    ws library closes the connection with code 1009 (Message Too Big).
 *
 * 2. Dev mode handleDevConnection registers Socket.IO event handlers AFTER an async
 *    auth check (await auth.api.getSession()). The client's connect handler emits
 *    'join' immediately. This message arrives at the server during the auth await,
 *    before the 'join' handler is registered — it is silently dropped. After
 *    reconnection, rooms are never re-joined, so all subsequent RPCs fail with
 *    NO_CONNECTION.
 *
 * 3. ChatRpcService pending requests are rejected with CLIENT_DISCONNECTED when the
 *    socket dies mid-RPC. The combination of (1) triggering the disconnect and (2)
 *    preventing recovery creates the exact failure cascade seen in production.
 */
describe('Chat RPC WebSocket Transport Resilience', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    const pending = cleanup.splice(0);
    await Promise.all(pending.map(async (teardown) => teardown()));
  });

  const createTestServer = (options?: Partial<import('socket.io').ServerOptions>) => {
    const httpServer = createServer();
    const serverIo = new SocketIoServer(httpServer, {
      transports: ['websocket'],
      ...options,
    });

    cleanup.push(async () => {
      await serverIo.close();
      await new Promise<void>((resolve) => {
        if (httpServer.listening) {
          httpServer.close(() => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    });

    const listen = async (): Promise<number> => {
      await new Promise<void>((resolve) => {
        httpServer.listen(0, () => {
          resolve();
        });
      });
      const { port } = httpServer.address() as AddressInfo;
      return port;
    };

    return { httpServer, serverIo, listen };
  };

  const createTestClient = (port: number, options?: Partial<import('socket.io-client').ManagerOptions>) => {
    const client = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      ...options,
    });
    cleanup.push(async () => {
      client.disconnect();
    });
    return client;
  };

  it('should maintain connection when RPC response contains large geometry payload (>1MB)', async () => {
    const { serverIo, listen } = createTestServer({ maxHttpBufferSize: 10e6 });

    let serverReceivedResponse = false;
    const responseReceived = new Promise<void>((resolve) => {
      serverIo.on('connection', (socket) => {
        socket.on('rpc_response', () => {
          serverReceivedResponse = true;
          resolve();
        });
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });
    client.connect();
    await connected;
    expect(client.connected).toBe(true);

    // Simulate fetchGeometry RPC response with realistic GLB payload.
    // A detailed OpenSCAD helicopter model ($fn=48, 7 component files)
    // produces 2-5MB of GLB geometry data.
    const twoMegabytes = 2 * 1024 * 1024;
    const largeGlb = new Uint8Array(twoMegabytes);

    const disconnectPromise = new Promise<string>((resolve) => {
      client.on('disconnect', (reason) => {
        resolve(reason);
      });
    });

    client.emit('rpc_response', {
      type: 'rpc_response',
      rpcName: 'fetch_geometry',
      requestId: 'req_geometry_001',
      toolCallId: 'tool_test_model_001',
      result: { success: true, glb: largeGlb },
    });

    const outcome = await Promise.race([
      responseReceived.then(() => 'received'),
      disconnectPromise.then((reason) => `disconnected:${reason}`),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('timeout');
        }, 5000);
      }),
    ]);

    expect(
      outcome,
      'Socket.IO killed the connection because the payload exceeded maxHttpBufferSize (1MB default)',
    ).toBe('received');
    expect(client.connected).toBe(true);
    expect(serverReceivedResponse).toBe(true);
  });

  it('should process join event when auth middleware runs before connection handler', async () => {
    const { serverIo, listen } = createTestServer();

    let joinProcessed = false;
    let joinChatId: string | undefined;

    // Auth runs as middleware — connection event fires only after middleware completes.
    // This matches the fixed pattern in chat-rpc.gateway.ts initDevSocketIo().
    serverIo.use(async (_socket, next) => {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 50);
      });
      next();
    });

    serverIo.on('connection', (socket) => {
      socket.on('join', (data: { chatId: string }) => {
        joinProcessed = true;
        joinChatId = data.chatId;
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        client.emit('join', { chatId: 'chat_test456' });
        resolve();
      });
    });
    client.connect();
    await connected;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 500);
    });

    expect(joinProcessed, 'Join event was not processed — middleware did not prevent the race condition').toBe(true);
    expect(joinChatId).toBe('chat_test456');
  });

  it('should receive disconnect reason when client disconnects', async () => {
    const { serverIo, listen } = createTestServer();

    let serverDisconnectReason: string | undefined;

    serverIo.on('connection', (socket) => {
      socket.on('disconnect', (reason) => {
        serverDisconnectReason = reason;
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });
    client.connect();
    await connected;

    const clientDisconnected = new Promise<string>((resolve) => {
      client.on('disconnect', (reason) => {
        resolve(reason);
      });
    });

    client.disconnect();
    const clientReason = await clientDisconnected;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200);
    });

    expect(clientReason).toBe('io client disconnect');
    expect(serverDisconnectReason).toBe('client namespace disconnect');
  });

  it('should receive disconnect reason when server force-disconnects', async () => {
    const { serverIo, listen } = createTestServer();

    let serverSocket: import('socket.io').Socket | undefined;

    serverIo.on('connection', (socket) => {
      serverSocket = socket;
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });
    client.connect();
    await connected;

    const clientDisconnected = new Promise<string>((resolve) => {
      client.on('disconnect', (reason) => {
        resolve(reason);
      });
    });

    expect(serverSocket).toBeDefined();
    serverSocket!.disconnect(true);

    const reason = await clientDisconnected;
    expect(reason).toBe('io server disconnect');
  });

  it('should deliver join ack via Socket.IO callback', async () => {
    const { serverIo, listen } = createTestServer();

    let joinedChatId: string | undefined;

    serverIo.on('connection', (socket) => {
      socket.on('join', (data: { chatId: string }, callback?: (ack: { success: boolean }) => void) => {
        joinedChatId = data.chatId;
        callback?.({ success: true });
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });
    client.connect();
    await connected;

    const ack = await new Promise<{ success: boolean }>((resolve) => {
      client.emit('join', { chatId: 'chat_ack_test' }, (response: { success: boolean }) => {
        resolve(response);
      });
    });

    expect(ack.success).toBe(true);
    expect(joinedChatId).toBe('chat_ack_test');
  });

  it('should retry join when server does not ack within timeout', async () => {
    const { serverIo, listen } = createTestServer();

    let joinAttempts = 0;

    serverIo.on('connection', (socket) => {
      socket.on('join', (_data: { chatId: string }, callback?: (ack: { success: boolean }) => void) => {
        joinAttempts++;
        if (joinAttempts >= 2) {
          callback?.({ success: true });
        }
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });
    client.connect();
    await connected;

    const emitJoinWithTimeout = async (): Promise<{ success: boolean } | undefined> =>
      new Promise<{ success: boolean } | undefined>((resolve) => {
        const joinTimeoutTimer = setTimeout(() => {
          resolve(undefined);
        }, 2000);
        client.emit('join', { chatId: 'chat_retry_test' }, (response: { success: boolean }) => {
          clearTimeout(joinTimeoutTimer);
          resolve(response);
        });
      });

    // First attempt: server doesn't invoke callback → undefined after timeout
    const ack1 = await emitJoinWithTimeout();
    expect(ack1).toBeUndefined();

    // Second attempt: server invokes callback
    const ack2 = await emitJoinWithTimeout();
    expect(ack2).toEqual({ success: true });
    expect(joinAttempts).toBe(2);
  });

  it('should complete RPC round-trip with large geometry payload over real Socket.IO', async () => {
    const { serverIo, listen } = createTestServer({ maxHttpBufferSize: 10e6 });

    const chatRpcService = new ChatRpcService(new MetricsService());
    const chatId = 'chat_rpc_test_001';

    serverIo.on('connection', (socket) => {
      socket.on('join', () => {
        chatRpcService.registerConnection(chatId, socket, 'test_user');
      });

      socket.on('disconnect', () => {
        chatRpcService.handleSocketDisconnect(socket);
      });

      // EmitWithAck handles responses via ack callback — no rpc_response handler needed
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        client.emit('join', { chatId });
        resolve();
      });
    });

    const twoMegabytes = 2 * 1024 * 1024;
    const largeGlb = new Uint8Array(twoMegabytes);

    client.on('rpc_request', (request: { requestId: string }, ack: (response: unknown) => void) => {
      ack({
        type: 'rpc_response',
        rpcName: 'fetch_geometry',
        requestId: request.requestId,
        toolCallId: 'tool_001',
        result: { success: true, glb: largeGlb },
      });
    });

    client.connect();
    await connected;

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });

    expect(chatRpcService.isConnected(chatId)).toBe(true);

    const rpcResult = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId: 'tool_fetch_geometry_001',
      rpcName: 'fetch_geometry',
      args: { targetFile: 'main.ts' },
    });

    expect(rpcResult, 'RPC failed — the response payload may have exceeded maxHttpBufferSize').toMatchObject({
      success: true,
    });
    expect(rpcResult).toHaveProperty('glb');
    expect((rpcResult as { glb: unknown }).glb).toBeInstanceOf(Uint8Array);
  });

  it('should complete emitWithAck round-trip with geometry payload', async () => {
    const { serverIo, listen } = createTestServer({ maxHttpBufferSize: 10e6 });

    const chatRpcService = new ChatRpcService(new MetricsService());
    const chatId = 'chat_ack_roundtrip';

    serverIo.on('connection', (socket) => {
      socket.on('join', () => {
        chatRpcService.registerConnection(chatId, socket, 'test_user');
      });
      socket.on('disconnect', () => {
        chatRpcService.handleSocketDisconnect(socket);
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        client.emit('join', { chatId });
        resolve();
      });
    });

    const glbPayload = new Uint8Array(1024);

    client.on('rpc_request', (request: { requestId: string; toolCallId: string }, ack: (response: unknown) => void) => {
      ack({
        type: 'rpc_response',
        rpcName: 'fetch_geometry',
        requestId: request.requestId,
        toolCallId: request.toolCallId,
        result: { success: true, glb: glbPayload },
      });
    });

    client.connect();
    await connected;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId: 'tool_001',
      rpcName: 'fetch_geometry',
      args: { targetFile: 'main.ts' },
    });

    expect(result).toMatchObject({ success: true });
    expect(result).toHaveProperty('glb');
    chatRpcService.onModuleDestroy();
  });

  it('should return TIMEOUT when client does not ack emitWithAck within timeout', async () => {
    const { serverIo, listen } = createTestServer();

    const chatRpcService = new ChatRpcService(new MetricsService());
    const chatId = 'chat_ack_timeout';

    serverIo.on('connection', (socket) => {
      socket.on('join', () => {
        chatRpcService.registerConnection(chatId, socket, 'test_user');
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        client.emit('join', { chatId });
        resolve();
      });
    });

    client.on('rpc_request', () => {
      // Intentionally not calling ack — simulates unresponsive client
    });

    client.connect();
    await connected;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId: 'tool_timeout',
      rpcName: 'fetch_geometry',
      args: { targetFile: 'main.ts' },
    });

    expect(result).toMatchObject({ errorCode: 'TIMEOUT' });
    chatRpcService.onModuleDestroy();
  }, 120_000);

  it('should return CLIENT_DISCONNECTED when client disconnects during emitWithAck', async () => {
    const { serverIo, listen } = createTestServer();

    const chatRpcService = new ChatRpcService(new MetricsService());
    const chatId = 'chat_ack_disconnect';

    serverIo.on('connection', (socket) => {
      socket.on('join', () => {
        chatRpcService.registerConnection(chatId, socket, 'test_user');
      });
      socket.on('disconnect', () => {
        chatRpcService.handleSocketDisconnect(socket);
      });
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        client.emit('join', { chatId });
        resolve();
      });
    });

    client.on('rpc_request', () => {
      client.disconnect();
    });

    client.connect();
    await connected;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId: 'tool_disconnect',
      rpcName: 'fetch_geometry',
      args: { targetFile: 'main.ts' },
    });

    expect(result).toMatchObject({ errorCode: 'CLIENT_DISCONNECTED' });
    chatRpcService.onModuleDestroy();
  }, 120_000);

  it('should reject unauthenticated client when auth middleware is enabled', async () => {
    const { serverIo, listen } = createTestServer();

    serverIo.use((_socket, next) => {
      next(new Error('UNAUTHENTICATED'));
    });

    const port = await listen();
    const client = createTestClient(port, { reconnection: false });

    const connectError = new Promise<Error>((resolve) => {
      client.on('connect_error', (error) => {
        resolve(error);
      });
    });

    client.connect();
    const error = await connectError;

    expect(error.message).toBe('UNAUTHENTICATED');
    expect(client.connected).toBe(false);
  });

  it('should reconnect after server-initiated disconnect with manual retry', async () => {
    const { serverIo, listen } = createTestServer();

    let connectionCount = 0;

    serverIo.on('connection', () => {
      connectionCount++;
    });

    const port = await listen();
    const client = createTestClient(port);

    const connected = new Promise<void>((resolve) => {
      client.on('connect', () => {
        resolve();
      });
    });

    client.connect();
    await connected;
    expect(connectionCount).toBe(1);

    // Socket.IO disables auto-reconnect for 'io server disconnect',
    // matching the client-side manual reconnect pattern in chat-rpc-socket.service.ts
    const reconnected = new Promise<void>((resolve) => {
      client.on('disconnect', () => {
        setTimeout(() => {
          client.connect();
        }, 100);
      });
      client.on('connect', () => {
        if (connectionCount >= 2) {
          resolve();
        }
      });
    });

    const sockets = await serverIo.fetchSockets();
    sockets[0]!.disconnect(true);
    await reconnected;

    expect(client.connected).toBe(true);
    expect(connectionCount).toBe(2);
  }, 15_000);
});
