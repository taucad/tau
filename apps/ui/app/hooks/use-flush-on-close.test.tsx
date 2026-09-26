// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { UnloadProvider, useFlushOnClose, useFlushProducers } from '#hooks/use-flush-on-close.js';

let visibility: DocumentVisibilityState = 'visible';

function Registration({
  callback,
  stage,
}: {
  readonly callback: (phase: 'hidden' | 'pagehide') => void | Promise<void>;
  readonly stage: 'producer' | 'session';
}): undefined {
  useFlushOnClose(callback, { stage });
  return undefined;
}

describe('UnloadProvider', () => {
  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  it('awaits hidden producers before sessions and runs only prepared session work at pagehide', async () => {
    const sequence: string[] = [];
    const producer = Promise.withResolvers<void>();

    render(
      <UnloadProvider>
        <Registration
          callback={(phase) => {
            sequence.push(`session:${phase}`);
          }}
          stage='session'
        />
        <Registration
          callback={async (phase) => {
            sequence.push(`producer:${phase}:start`);
            await producer.promise;
            sequence.push(`producer:${phase}:done`);
          }}
          stage='producer'
        />
      </UnloadProvider>,
    );

    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sequence).toEqual(['producer:hidden:start']);

    producer.resolve();
    await waitFor(() => {
      expect(sequence).toEqual(['producer:hidden:start', 'producer:hidden:done', 'session:hidden']);
    });

    sequence.length = 0;
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(sequence).toEqual(['session:pagehide']);
  });

  it('should await every producer on demand while the page is still visible, and run no session work', async () => {
    const sequence: string[] = [];
    const producer = Promise.withResolvers<void>();
    let flushProducers: (() => Promise<void>) | undefined;

    function FlushProducersProbe(): undefined {
      flushProducers = useFlushProducers();
      return undefined;
    }

    render(
      <UnloadProvider>
        <Registration
          callback={(phase) => {
            sequence.push(`session:${phase}`);
          }}
          stage='session'
        />
        <Registration
          callback={async (phase) => {
            sequence.push(`producer:${phase}:start`);
            await producer.promise;
            sequence.push(`producer:${phase}:done`);
          }}
          stage='producer'
        />
        <FlushProducersProbe />
      </UnloadProvider>,
    );

    let settled = false;
    const flushing = (async () => {
      await flushProducers?.();
      settled = true;
    })();
    await Promise.resolve();
    expect(sequence).toEqual(['producer:hidden:start']);
    expect(settled).toBe(false);

    producer.resolve();
    await flushing;
    expect(sequence).toEqual(['producer:hidden:start', 'producer:hidden:done']);
  });
});
