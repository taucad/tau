import { authQueryKeys } from '@better-auth-ui/core';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureSessionQueryDefaults, handleQueryError } from '#runtime/root-query-client.js';
import { shouldRevalidate } from '#root.js';

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

    await expect(client.query({ queryKey: authQueryKeys.session, queryFn: queryFunction })).rejects.toThrow(
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

      await expect(client.query({ queryKey: authQueryKeys.session, queryFn: queryFunction })).rejects.toBe(error);
      expect(queryFunction).toHaveBeenCalledTimes(3);
    },
  );

  it('does not retry a failed session query when an observer remounts', async () => {
    const client = sessionClient();
    const error = Object.assign(new Error('HTTP 429'), { status: 429 });
    const queryFunction = vi.fn(async () => {
      throw error;
    });
    await expect(client.query({ queryKey: authQueryKeys.session, queryFn: queryFunction })).rejects.toBe(error);

    const observer = new QueryObserver(client, { queryKey: authQueryKeys.session, queryFn: queryFunction });
    const unsubscribe = observer.subscribe(() => undefined);
    await Promise.resolve();

    expect(queryFunction).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('reuses a fresh session result', async () => {
    const client = sessionClient();
    const queryFunction = vi.fn(async () => ({ user: { id: 'user-1' } }));

    await client.query({ queryKey: authQueryKeys.session, queryFn: queryFunction });
    await client.query({ queryKey: authQueryKeys.session, queryFn: queryFunction });

    expect(queryFunction).toHaveBeenCalledOnce();
  });
});

const rootNavigation = (
  from: string,
  to: string,
  formMethod?: ShouldRevalidateFunctionArgs['formMethod'],
): ShouldRevalidateFunctionArgs => ({
  currentUrl: new URL(from, 'https://tau.new'),
  nextUrl: new URL(to, 'https://tau.new'),
  currentParams: {},
  nextParams: {},
  formMethod,
  defaultShouldRevalidate: true,
});

describe('root shouldRevalidate on client navigation', () => {
  it('C17 (U23): a GET navigation that changes the pathname does not re-run the root loader', () => {
    expect(shouldRevalidate(rootNavigation('/', '/projects/abc'))).toBe(false);
  });

  it('keeps the default for a submission', () => {
    expect(shouldRevalidate(rootNavigation('/', '/projects/abc', 'POST'))).toBe(true);
    expect(shouldRevalidate(rootNavigation('/projects/abc', '/projects/abc', 'POST'))).toBe(true);
  });

  it('keeps the default for an explicit revalidation of the same URL', () => {
    expect(shouldRevalidate(rootNavigation('/projects/abc', '/projects/abc'))).toBe(true);
    expect(shouldRevalidate(rootNavigation('/community?q=gear', '/community?q=gear'))).toBe(true);
  });

  it('never revalidates into the offline shell path', () => {
    expect(shouldRevalidate(rootNavigation('/', '/usage'))).toBe(false);
    expect(shouldRevalidate(rootNavigation('/', '/usage', 'POST'))).toBe(false);
  });

  it('keeps the default into and out of the remote-host harness, whose check reads the loader pathname', () => {
    expect(shouldRevalidate(rootNavigation('/', '/__e2e/remote-host'))).toBe(true);
    expect(shouldRevalidate(rootNavigation('/__e2e/remote-host', '/projects/abc'))).toBe(true);
  });

  it('keeps the default when leaving the offline shell path, whose neutral document carries no real root data', () => {
    expect(shouldRevalidate(rootNavigation('/usage', '/projects/abc'))).toBe(true);
    expect(shouldRevalidate(rootNavigation('/usage/', '/'))).toBe(true);
  });
});
