import { describe, expect, it } from 'vitest';

import { checkPath, checkRouteData, isDataResponse, main, routeDataPaths } from '#check-route-data.js';

const respond = (status: number, contentType: string) => async () =>
  new Response('x', { status, headers: { 'content-type': contentType } });

describe('isDataResponse', () => {
  it('accepts the turbo-stream type with or without parameters', () => {
    expect(isDataResponse('text/x-script')).toBe(true);
    expect(isDataResponse('Text/X-Script; charset=utf-8')).toBe(true);
  });

  it('refuses HTML and a missing type', () => {
    expect(isDataResponse('text/html; charset=UTF-8')).toBe(false);
    expect(isDataResponse(undefined)).toBe(false);
  });
});

describe('checkPath', () => {
  it('passes a data response whatever its status', async () => {
    const result = await checkPath('https://example.test', '/a.data', {
      retries: 0,
      fetcher: respond(404, 'text/x-script'),
      retryDelay: 0,
    });
    expect(result).toEqual({ path: '/a.data', status: 404, contentType: 'text/x-script', ok: true });
  });

  it('fails the static shell at once, without retrying', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return new Response('<!DOCTYPE html>', { status: 200, headers: { 'content-type': 'text/html' } });
    };
    const result = await checkPath('https://example.test', '/a.data', { retries: 3, fetcher, retryDelay: 0 });
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('retries a 5xx and a network failure, then reports the last answer', async () => {
    const answers = [
      async () => {
        throw new Error('reset');
      },
      respond(503, 'text/html'),
      respond(200, 'text/x-script'),
    ];
    let index = 0;
    const fetcher = async () => {
      const answer = answers[index];
      index += 1;
      if (!answer) {
        throw new Error('no answer left');
      }
      return answer();
    };
    const result = await checkPath('https://example.test', '/a.data', { retries: 2, fetcher, retryDelay: 0 });
    expect(result.ok).toBe(true);
    expect(index).toBe(3);
  });
});

describe('checkRouteData', () => {
  it('checks the project, nested and sign-in data requests against the origin', async () => {
    const requested: string[] = [];
    const fetcher = async (url: string) => {
      requested.push(url);
      return new Response('x', { headers: { 'content-type': 'text/x-script' } });
    };
    const results = await checkRouteData('https://taucad.dev', { retries: 0, fetcher, retryDelay: 0 });
    expect(results.every((result) => result.ok)).toBe(true);
    expect(requested).toEqual(routeDataPaths.map((path) => `https://taucad.dev${path}`));
  });
});

describe('main', () => {
  it('rejects a missing or relative origin and a bad retry count', async () => {
    expect(await main([])).toBe(2);
    expect(await main(['taucad.dev'])).toBe(2);
    expect(await main(['https://taucad.dev', '--retries', '-1'])).toBe(2);
  });
});
