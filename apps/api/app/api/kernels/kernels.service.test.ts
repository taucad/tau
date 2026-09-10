import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { KernelsService } from '#api/kernels/kernels.service.js';

describe('KernelsService hosted billing gate', () => {
  it('closes with service-unavailable before creating an upstream Zoo socket', () => {
    const close = vi.fn();
    const clientSocket = { close } as unknown as WebSocket;

    new KernelsService().createZooProxy(clientSocket, new URLSearchParams(), 'user-1');

    expect(close).toHaveBeenCalledWith(1013, 'HOSTED_BILLING_MIGRATION_REQUIRED');
  });
});
