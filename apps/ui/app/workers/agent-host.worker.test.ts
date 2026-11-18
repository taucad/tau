import { afterEach, describe, expect, it, vi } from 'vitest';

/* Counts evaluations of the host implementation, the module a `provide` needs. */
const implementation = vi.hoisted(() => ({ evaluations: 0 }));

vi.mock('#workers/agent-host.impl.js', () => {
  implementation.evaluations += 1;
  return { openBrowserProjectHost: vi.fn() };
});

describe('agent-host worker', () => {
  const opened: MessagePort[] = [];

  afterEach(() => {
    for (const port of opened) {
      port.close();
    }
    opened.length = 0;
  });

  it('starts loading its host implementation when the page connects, before any provide', async () => {
    await import('#workers/agent-host.worker.js');
    const { port1, port2 } = new MessageChannel();
    opened.push(port1, port2);

    globalThis.dispatchEvent(
      new MessageEvent('message', { data: { type: 'agent-host/connect', sessionId: 'session-1', port: port1 } }),
    );

    /* No `provide` is sent: the implementation is loaded while the page is still opening the project. */
    await vi.waitFor(() => {
      expect(implementation.evaluations).toBe(1);
    });
  });
});
