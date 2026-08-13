import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';
import { coiMiddleware } from '#cross-origin-isolation/express.js';
import { documentHeaders } from '#cross-origin-isolation/index.js';

type CoiServerResponse = ServerResponse & { append?: (name: string, value?: string | string[]) => unknown };

function asRequest(value: Record<string, unknown>): IncomingMessage {
  return value as unknown as IncomingMessage;
}

function asResponse(value: Record<string, unknown>): CoiServerResponse {
  return value as unknown as CoiServerResponse;
}

const emptyRequest: IncomingMessage = asRequest({});

function createResponse() {
  return { setHeader: vi.fn<(name: string, value: string) => void>() };
}

function createExpressResponse() {
  const setCalls: Array<[string, string]> = [];
  const appendCalls: Array<[string, string | string[] | undefined]> = [];
  const response = {
    setHeader(name: string, value: string) {
      setCalls.push([name, value]);
    },
    append(name: string, value?: string | string[]) {
      appendCalls.push([name, value]);
      return response;
    },
  };
  return { response, setCalls, appendCalls };
}

describe('coiMiddleware (express adapter)', () => {
  it('should be a factory that returns a middleware function', () => {
    const middleware = coiMiddleware();
    expect(middleware).toBeTypeOf('function');
    expect(middleware.length).toBe(3);
  });

  it('should set all three COI headers via response.setHeader', () => {
    const middleware = coiMiddleware();
    const response = createResponse();
    const next = vi.fn();

    middleware(emptyRequest, asResponse(response), next);

    expect(response.setHeader).toHaveBeenCalledWith('Cross-Origin-Opener-Policy', 'same-origin');
    expect(response.setHeader).toHaveBeenCalledWith('Cross-Origin-Embedder-Policy', 'require-corp');
    expect(response.setHeader).toHaveBeenCalledWith('Cross-Origin-Resource-Policy', 'same-origin');
  });

  it('should stay in sync with the canonical documentHeaders from @taucad/runtime/cross-origin-isolation', () => {
    const middleware = coiMiddleware();
    const response = createResponse();
    const next = vi.fn();

    middleware(emptyRequest, asResponse(response), next);

    for (const [name, value] of Object.entries(documentHeaders)) {
      expect(response.setHeader).toHaveBeenCalledWith(name, value);
    }
    expect(response.setHeader).toHaveBeenCalledTimes(Object.keys(documentHeaders).length);
  });

  it('should call next() exactly once to continue the middleware chain', () => {
    const middleware = coiMiddleware();
    const response = createResponse();
    const next = vi.fn();

    middleware(emptyRequest, asResponse(response), next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('should set all headers on every request (no caching)', () => {
    const middleware = coiMiddleware();
    const response = createResponse();
    const next = vi.fn();

    middleware(emptyRequest, asResponse(response), next);
    middleware(emptyRequest, asResponse(response), next);

    expect(response.setHeader).toHaveBeenCalledTimes(Object.keys(documentHeaders).length * 2);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should ignore the request argument so it works for any verb/path', () => {
    const middleware = coiMiddleware();
    const responseGet = createResponse();
    const responsePost = createResponse();
    const next = vi.fn();

    middleware(asRequest({ method: 'GET', url: '/' }), asResponse(responseGet), next);
    middleware(asRequest({ method: 'POST', url: '/anything' }), asResponse(responsePost), next);

    expect(responseGet.setHeader).toHaveBeenCalledTimes(Object.keys(documentHeaders).length);
    expect(responsePost.setHeader).toHaveBeenCalledTimes(Object.keys(documentHeaders).length);
  });

  it('should suppress downstream res.append() of COI headers to prevent duplicates', () => {
    const middleware = coiMiddleware();
    const { response, appendCalls } = createExpressResponse();
    const next = vi.fn();

    middleware(emptyRequest, asResponse(response), next);

    response.append('Cross-Origin-Opener-Policy', 'same-origin');
    response.append('cross-origin-embedder-policy', 'require-corp');
    response.append('CROSS-ORIGIN-RESOURCE-POLICY', 'same-origin');

    expect(appendCalls).toEqual([]);
  });

  it('should still allow downstream res.append() of non-COI headers', () => {
    const middleware = coiMiddleware();
    const { response, appendCalls } = createExpressResponse();
    const next = vi.fn();

    middleware(emptyRequest, asResponse(response), next);

    response.append('Set-Cookie', 'sid=abc');
    response.append('Content-Type', 'text/html');

    expect(appendCalls).toEqual([
      ['Set-Cookie', 'sid=abc'],
      ['Content-Type', 'text/html'],
    ]);
  });

  it('should leave responses without an append method untouched', () => {
    const middleware = coiMiddleware();
    const response = createResponse();
    const next = vi.fn();

    expect(() => {
      middleware(emptyRequest, asResponse(response), next);
    }).not.toThrow();
    expect(response.setHeader).toHaveBeenCalledTimes(Object.keys(documentHeaders).length);
  });

  it('should not throw when next throws downstream (lets caller handle errors)', () => {
    const middleware = coiMiddleware();
    const response = createResponse();
    const next = vi.fn(() => {
      throw new Error('downstream blew up');
    });

    expect(() => {
      middleware(emptyRequest, asResponse(response), next);
    }).toThrow('downstream blew up');
    expect(response.setHeader).toHaveBeenCalledTimes(Object.keys(documentHeaders).length);
  });
});
