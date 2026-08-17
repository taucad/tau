import { describe, it, expect, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import type { Port } from '#port.js';
import { wrapMessagePort } from '#port.js';

describe('wrapMessagePort', () => {
  it('routes postMessage and onMessage with unsubscribe', () => {
    const handlers: Array<(d: string) => void> = [];
    const mock: Port<string> = {
      postMessage(data) {
        for (const h of handlers) {
          h(data);
        }
      },
      onMessage(handler) {
        handlers.push(handler);
        return () => {
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      },
      close() {
        handlers.length = 0;
      },
    };
    const received: string[] = [];
    const off = mock.onMessage((d) => {
      received.push(d);
    });
    mock.postMessage('x');
    off();
    mock.postMessage('y');
    expect(received).toEqual(['x']);
  });

  it('wraps close errors with context', () => {
    const { port1 } = new MessageChannel();
    vi.spyOn(port1, 'close').mockImplementation(() => {
      throw new Error('fail');
    });
    const a = wrapMessagePort(port1, { label: 'P' });
    expect(() => {
      a.close();
    }).toThrow('P close failed');
  });
});
