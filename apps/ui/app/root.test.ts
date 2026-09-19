import { authQueryKeys } from '@better-auth-ui/core';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureSessionQueryDefaults, handleQueryError } from '#root-layout.js';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { error: toastError } }));

describe('handleQueryError', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should not toast an error owned by its query', () => {
    handleQueryError(
      { error: { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' } },
      { handlesErrorLocally: true },
    );

    expect(toastError).not.toHaveBeenCalled();
  });

  it('should toast an unhandled auth query error', () => {
    handleQueryError({ error: { code: 'UNKNOWN', message: 'Unhandled auth error' } }, undefined);

    expect(toastError).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledWith('Unhandled auth error');
  });
});

const sessionClient = (): QueryClient => {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  configureSessionQueryDefaults(client);
  return client;
};

describe('session query defaults', () => {
  it.each([400, 401, 403, 429])('does not retry HTTP %i responses', async (status) => {
    const client = sessionClient();
    const queryFunction = vi.fn(async () => {
      throw Object.assign(new Error(`HTTP ${status}`), { status });
    });

    await expect(client.fetchQuery({ queryKey: authQueryKeys.session, queryFn: queryFunction })).rejects.toThrow(
      `HTTP ${status}`,
    );
    expect(queryFunction).toHaveBeenCalledOnce();
  });

  it.each([new TypeError('network unavailable'), Object.assign(new Error('HTTP 500'), { status: 500 })])(
    'limits transient failures to three attempts',
    async (error) => {
      const client = sessionClient();
      const queryFunction = vi.fn(async () => {
        throw error;
      });

      await expect(client.fetchQuery({ queryKey: authQueryKeys.session, queryFn: queryFunction })).rejects.toBe(error);
      expect(queryFunction).toHaveBeenCalledTimes(3);
    },
  );

  it('does not retry a failed session query when an observer remounts', async () => {
    const client = sessionClient();
    const error = Object.assign(new Error('HTTP 429'), { status: 429 });
    const queryFunction = vi.fn(async () => {
      throw error;
    });
    await expect(client.fetchQuery({ queryKey: authQueryKeys.session, queryFn: queryFunction })).rejects.toBe(error);

    const observer = new QueryObserver(client, { queryKey: authQueryKeys.session, queryFn: queryFunction });
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();

    expect(queryFunction).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('reuses a fresh session result', async () => {
    const client = sessionClient();
    const queryFunction = vi.fn(async () => ({ user: { id: 'user-1' } }));

    await client.fetchQuery({ queryKey: authQueryKeys.session, queryFn: queryFunction });
    await client.fetchQuery({ queryKey: authQueryKeys.session, queryFn: queryFunction });

    expect(queryFunction).toHaveBeenCalledOnce();
  });
});
