import { afterEach, expect, test } from 'vitest';

import { desktopE2EProviderStubUrl } from '#support/config.js';
import { gatewayFixtureSupplierModelId, startGatewayFixture } from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';

let fixture: GatewayFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const forward = async (model: string): Promise<Response> =>
  fetch(`${desktopE2EProviderStubUrl}/v1/messages`, {
    body: JSON.stringify({ model, messages: [{ content: 'Create a model', role: 'user' }] }),
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

test('refuses a request the gateway did not rewrite to the supplier id', async () => {
  fixture = await startGatewayFixture();

  await expect(forward('anthropic-claude-haiku-4.5')).rejects.toThrow();
  expect(fixture.supplierModels).toStrictEqual([]);
});
