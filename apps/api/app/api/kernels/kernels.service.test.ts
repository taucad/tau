/* eslint-disable @typescript-eslint/naming-convention -- mock preserves the third-party WebSocket API surface. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { WebSocket as WsWebSocket } from 'ws';
import type { Environment } from '#config/environment.config.js';
import type { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import type { MetricsService } from '#telemetry/metrics.js';
import { KernelsService } from '#api/kernels/kernels.service.js';

const { MockWebSocket, sockets } = vi.hoisted(() => {
  class HoistedMockWebSocket {
    public static get CONNECTING(): number {
      return 0;
    }

    public static get OPEN(): number {
      return 1;
    }

    public static get CLOSED(): number {
      return 3;
    }

    public readonly send = vi.fn();
    public readonly close = vi.fn(() => {
      this.readyState = HoistedMockWebSocket.CLOSED;
    });
    public readyState = HoistedMockWebSocket.OPEN;
    public binaryType = '';
    readonly #listeners = new Map<string, Array<(event: { data?: unknown; code?: number; reason?: string }) => void>>();

    public constructor(_url?: unknown) {
      instances.push(this);
    }

    public addEventListener(
      event: string,
      listener: (event: { data?: unknown; code?: number; reason?: string }) => void,
    ): void {
      const listeners = this.#listeners.get(event) ?? [];
      listeners.push(listener);
      this.#listeners.set(event, listeners);
    }

    public emit(event: string, payload: { data?: unknown; code?: number; reason?: string } = {}): void {
      for (const listener of this.#listeners.get(event) ?? []) {
        listener(payload);
      }
    }
  }

  const instances: HoistedMockWebSocket[] = [];
  return { MockWebSocket: HoistedMockWebSocket, sockets: instances };
});

vi.mock('ws', () => ({ WebSocket: MockWebSocket }));

const createService = () => {
  const debit = vi.fn().mockResolvedValue({ balanceMicro: 100n });
  const config = {
    get: vi.fn((key: keyof Environment) => {
      if (key === 'ZOO_API_KEY') {
        return 'zoo-key';
      }
      if (key === 'ZOO_WEBSOCKET_URL') {
        return 'wss://api.zoo.dev';
      }
      if (key === 'ZOO_ENGINE_RATE_MICRO_PER_MINUTE') {
        return '1';
      }
      return undefined;
    }),
  } as unknown as ConfigService<Environment, true>;
  const ledger = { debit } as unknown as CreditLedgerService;
  const metrics = {
    billingCreditCommitted: { add: vi.fn() },
    billingCommitFailures: { add: vi.fn() },
  } as unknown as MetricsService;
  return { debit, service: new KernelsService(config, ledger, metrics) };
};

describe('KernelsService Zoo wire validation', () => {
  beforeEach(() => {
    sockets.length = 0;
  });

  it('does not authenticate from an incomplete modeling-session response', () => {
    const { debit, service } = createService();
    const client = new MockWebSocket();
    service.createZooProxy(client as unknown as WsWebSocket, new URLSearchParams(), 'user_1');
    const upstream = sockets.at(-1)!;
    upstream.emit('open');

    upstream.emit('message', {
      data: JSON.stringify({ success: true, resp: { type: 'modeling_session_data' } }),
    });
    client.emit('close');

    expect(debit).not.toHaveBeenCalled();
  });

  it('forwards an incomplete client headers frame instead of treating it as authentication', () => {
    const { service } = createService();
    const client = new MockWebSocket();
    service.createZooProxy(client as unknown as WsWebSocket, new URLSearchParams(), 'user_1');
    const upstream = sockets.at(-1)!;
    upstream.emit('open');
    upstream.send.mockClear();
    const malformed = JSON.stringify({ type: 'headers' });

    client.emit('message', { data: malformed });
    client.emit('close');

    expect(upstream.send).toHaveBeenCalledWith(malformed);
  });
});
