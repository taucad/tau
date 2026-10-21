/* eslint-disable @typescript-eslint/naming-convention -- RFC 8628 wire fields. */
import { beforeEach, describe, expect, it } from 'vitest';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { bearer } from 'better-auth/plugins';
import { cliDeviceAuthorization } from '#config/cli-device-authorization.js';

type DeviceRow = { deviceCode: string; expiresAt: Date; lastPolledAt?: Date; status: string };
const store: Record<string, unknown[]> & { deviceCode: DeviceRow[] } = {
  user: [],
  session: [],
  account: [],
  verification: [],
  deviceCode: [],
};
const auth = betterAuth({
  baseURL: 'https://api.example.test',
  basePath: '/v1/auth',
  secret: 'cli-auth-integration-test-secret-at-least-32',
  database: memoryAdapter(store),
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: false },
  plugins: [cliDeviceAuthorization('https://app.example.test'), bearer()],
});
const call = async (path: string, body?: unknown, token?: string) =>
  auth.handler(
    new Request(`https://api.example.test/v1/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
const statusOf = async (pending: Promise<Response>): Promise<number> => {
  const response = await pending;
  return response.status;
};
const jsonOf = async (pending: Promise<Response>): Promise<unknown> => {
  const response = await pending;
  return response.json();
};
const signIn = async (email: string): Promise<string> => {
  const result = await call('sign-up/email', { email, password: 'test-password-strong-1234', name: 'Test user' });
  const value = result.headers.get('set-auth-token');
  if (!value) {
    throw new Error('Test sign-in failed');
  }
  return value;
};
const issue = async () => {
  const response = await call('device/code', { client_id: 'tau-cli' });
  expect(response.status).toBe(200);
  return (await response.json()) as { device_code: string; user_code: string; verification_uri_complete: string };
};
const redeem = async (deviceCode: string, clientId = 'tau-cli') =>
  call('device/token', {
    client_id: clientId,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  });

describe('CLI browser-approved sessions', () => {
  beforeEach(() => {
    for (const rows of Object.values(store)) {
      rows.length = 0;
    }
  });
  it('issues a distinct session, consumes once, and revokes without signing out the browser', async () => {
    const browser = await signIn('owner@example.test');
    const device = await issue();
    expect(device.verification_uri_complete).toContain('https://app.example.test/auth/cli?user_code=');
    expect(await statusOf(call(`device?user_code=${device.user_code}`, undefined, browser))).toBe(200);
    expect(await statusOf(call('device/approve', { userCode: device.user_code }, browser))).toBe(200);
    const response = await redeem(device.device_code);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token: string };
    expect(body.access_token).not.toBe(browser);
    expect(await jsonOf(call('get-session', undefined, body.access_token))).toMatchObject({
      user: { email: 'owner@example.test' },
    });
    expect(await statusOf(redeem(device.device_code))).toBe(400);
    expect(await statusOf(call('sign-out', {}, body.access_token))).toBe(200);
    expect(await jsonOf(call('get-session', undefined, body.access_token))).toBeNull();
    expect(await jsonOf(call('get-session', undefined, browser))).toMatchObject({
      user: { email: 'owner@example.test' },
    });
  });
  it('requires a session, ownership, and explicit approval', async () => {
    const owner = await signIn('owner@example.test');
    const other = await signIn('other@example.test');
    const device = await issue();
    expect(await statusOf(call('device/approve', { userCode: device.user_code }))).toBe(401);
    await call(`device?user_code=${device.user_code}`, undefined, owner);
    expect(await statusOf(call('device/approve', { userCode: device.user_code }, other))).toBe(403);
    expect(await jsonOf(redeem(device.device_code))).toMatchObject({ error: 'authorization_pending' });
  });
  it('allows exactly one concurrent approval or denial', async () => {
    const owner = await signIn('owner@example.test');
    const device = await issue();
    await call(`device?user_code=${device.user_code}`, undefined, owner);
    const decisions = await Promise.all([
      call('device/approve', { userCode: device.user_code }, owner),
      call('device/deny', { userCode: device.user_code }, owner),
    ]);
    expect(decisions.map((response) => response.status).sort((left, right) => left - right)).toEqual([200, 403]);
  });
  it('collects expired abandoned requests on subsequent issuance', async () => {
    const old = await issue();
    const row = store.deviceCode.find((item) => item.deviceCode === old.device_code);
    if (!row) {
      throw new Error('Missing test device');
    }
    row.expiresAt = new Date(0);
    await issue();
    expect(store.deviceCode.some((item) => item.deviceCode === old.device_code)).toBe(false);
  });
  it('rejects unregistered clients and scopes', async () => {
    expect(await statusOf(call('device/code', { client_id: 'other' }))).toBe(400);
    expect(await statusOf(call('device/code', { client_id: 'tau-cli', scope: 'admin' }))).toBe(400);
    const device = await issue();
    expect(await statusOf(redeem(device.device_code, 'other'))).toBe(400);
  });
  it('does not redeem a denied or expired request', async () => {
    const owner = await signIn('owner@example.test');
    const denied = await issue();
    await call(`device?user_code=${denied.user_code}`, undefined, owner);
    expect(await statusOf(call('device/deny', { userCode: denied.user_code }, owner))).toBe(200);
    expect(await jsonOf(redeem(denied.device_code))).toMatchObject({ error: 'access_denied' });
    const expired = await issue();
    const row = store.deviceCode.find((item) => item.deviceCode === expired.device_code);
    if (!row) {
      throw new Error('Missing test device');
    }
    row.expiresAt = new Date(0);
    expect(await jsonOf(redeem(expired.device_code))).toMatchObject({ error: 'expired_token' });
  });
});
