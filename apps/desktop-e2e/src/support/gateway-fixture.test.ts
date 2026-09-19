import { afterEach, expect, test } from 'vitest';

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
