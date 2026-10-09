import { afterEach, expect, test, vi } from 'vitest';

import { desktopE2EProviderStubUrl } from '#support/config.js';
import { gatewayFixtureSupplierModelId, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';

let fixture: GatewayFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const prompt = { content: 'Create a model', role: 'user' };

const forward = async (model: string, messages: readonly unknown[] = [prompt]): Promise<Response> =>
  fetch(`${desktopE2EProviderStubUrl}/v1/messages`, {
    body: JSON.stringify({ model, messages }),
    headers: { 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    method: 'POST',
  });

test('binds every model response to an operation identity', async () => {
  fixture = await startGatewayFixture();
  const response = await forward(gatewayFixtureSupplierModelId);

  expect(response.status).toBe(200);
  expect(response.headers.get('x-tau-operation-id')).toBe('desktop-e2e-operation-0');
  await response.text();
  expect(fixture.supplierModels).toStrictEqual([gatewayFixtureSupplierModelId]);
});

test('answers provider liveness without consuming a model round', async () => {
  fixture = await startGatewayFixture();

  const response = await fetch(`${desktopE2EProviderStubUrl}/health/live`);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toStrictEqual({ status: 'ok' });
  expect(fixture.gatewayRequests).toStrictEqual([]);
});

/* A turn is one prompt: every other user message carries the previous round's
   results, so a second turn in the same chat must be able to write different
   bytes than the first (byte-identical rewrites save nothing, and repeating the
   arguments trips the host's `ping_pong` safeguard). */
test('scripts each turn from its own index', async () => {
  fixture = await startGatewayFixture({
    toolCalls: (turn) => [{ name: 'create_file', input: { content: `turn ${String(turn)}` } }],
  });

  const first = await forward(gatewayFixtureSupplierModelId);
  const second = await forward(gatewayFixtureSupplierModelId, [
    prompt,
    { content: [{ type: 'tool_result' }], role: 'user' },
    prompt,
  ]);

  await expect(first.text()).resolves.toContain('turn 0');
  await expect(second.text()).resolves.toContain('turn 1');
});

test('refuses a request the gateway did not rewrite to the supplier id', async () => {
  fixture = await startGatewayFixture();

  await expect(forward('anthropic-claude-haiku-4.5')).rejects.toThrow();
  expect(fixture.supplierModels).toStrictEqual([]);
});

/* Held provider bytes must remain independently observable before settlement. */
test('delivers distinct text chunks while later output and settlement remain held', async () => {
  const second = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const script = {
    toolCalls: [],
    textChunks: ['First held paragraph.', 'Second held paragraph.'],
    beforeTextChunk: async (index: number) => {
      if (index === 1) {
        await second.promise;
      }
    },
    beforeFinish: async () => finish.promise,
  };
  fixture = await startGatewayFixture(script);
  let received = '';
  let settled = false;
  const response = await forward(gatewayFixtureSupplierModelId);
  const reading = (async () => {
    for await (const chunk of response.body!) {
      received += new TextDecoder().decode(chunk);
    }
    settled = true;
  })();
  try {
    await vi.waitFor(() => {
      expect(received).toContain('First held paragraph.');
    });
    expect(received).not.toContain('Second held paragraph.');
    expect(settled).toBe(false);
    second.resolve();
    await vi.waitFor(() => {
      expect(received).toContain('Second held paragraph.');
    });
    expect(received).not.toContain('message_stop');
    expect(settled).toBe(false);
    finish.resolve();
    await reading;
    expect(received).toContain('message_stop');
  } finally {
    second.resolve();
    finish.resolve();
    await reading;
  }
});

test('keeps a replacement response gate independent while the cancelled old response remains held', async () => {
  const oldGate = Promise.withResolvers<void>();
  const replacementGate = Promise.withResolvers<void>();
  const reached: number[] = [];
  fixture = await startGatewayFixture({
    toolCalls: [],
    textChunks: ['Independent first chunk.', 'Independent trailing chunk.'],
    beforeTextChunk: async (chunk, request = 0) => {
      if (chunk === 1) {
        reached.push(request);
        await (request === 0 ? oldGate.promise : replacementGate.promise);
      }
    },
  });
  const controller = new AbortController();
  const old = await fetch(`${desktopE2EProviderStubUrl}/v1/messages`, {
    body: JSON.stringify({ model: gatewayFixtureSupplierModelId, messages: [prompt] }),
    headers: { 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    method: 'POST',
    signal: controller.signal,
  });
  let oldText = '';
  const readingOld = (async () => {
    for await (const chunk of old.body!) {
      oldText += new TextDecoder().decode(chunk);
    }
  })();
  let replacementText = '';
  let readingReplacement: Promise<void> | undefined;
  try {
    await vi.waitFor(() => {
      expect(oldText).toContain('Independent first chunk.');
    });
    controller.abort();
    await expect(readingOld).rejects.toThrow();
    const replacement = await forward(gatewayFixtureSupplierModelId);
    readingReplacement = (async () => {
      for await (const chunk of replacement.body!) {
        replacementText += new TextDecoder().decode(chunk);
      }
    })();
    await vi.waitFor(() => {
      expect(replacementText).toContain('Independent first chunk.');
    });
    expect(replacementText).not.toContain('Independent trailing chunk.');
    replacementGate.resolve();
    await vi.waitFor(() => {
      expect(replacementText).toContain('Independent trailing chunk.');
    });
    expect(oldText).not.toContain('Independent trailing chunk.');
    expect(reached).toEqual([0, 1]);
    await readingReplacement;
  } finally {
    controller.abort();
    oldGate.resolve();
    replacementGate.resolve();
    await readingOld.catch(() => undefined);
    await readingReplacement;
  }
});

test('selects distinct first second and resumed chunks and settlement gates by request ordinal', async () => {
  const settled: number[] = [];
  const names = ['first', 'second', 'resumed'];
  fixture = await startGatewayFixture({
    toolCalls: [],
    textChunks: (request) => [`Actual ${names[request]} scripted response.`],
    beforeFinish: async (request) => {
      settled.push(request);
    },
  });
  const readResponse = async (): Promise<string> => {
    const response = await forward(gatewayFixtureSupplierModelId);
    return response.text();
  };
  expect(await readResponse()).toContain('Actual first scripted response.');
  expect(await readResponse()).toContain('Actual second scripted response.');
  expect(await readResponse()).toContain('Actual resumed scripted response.');
  expect(settled).toEqual([0, 1, 2]);
});
