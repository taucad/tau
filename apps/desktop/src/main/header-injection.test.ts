/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names are case-insensitive and tested as sent */
import { describe, expect, it } from 'vitest';

import { injectTauHeaders, originOf } from '#main/header-injection.js';

const options = {
  allowedOrigins: ['http://localhost:4000', 'ws://localhost:4001'],
  token: () => 'session-token',
  clientHeader: 'tau-desktop/0.0.1',
};

describe('injectTauHeaders', () => {
  it('injects the bearer and client header on the API origin', () => {
    expect(injectTauHeaders('http://localhost:4000/v1/chat', { accept: '*/*' }, options)).toEqual({
      accept: '*/*',
      authorization: 'Bearer session-token',
      'tau-client': 'tau-desktop/0.0.1',
    });
  });

  it('injects on the WebSocket origin, which a browser cannot decorate itself', () => {
    expect(injectTauHeaders('ws://localhost:4001/socket.io/?EIO=4', {}, options)).toEqual({
      authorization: 'Bearer session-token',
      'tau-client': 'tau-desktop/0.0.1',
    });
  });

  it('never injects toward any other origin', () => {
    for (const url of [
      'https://api.openai.com/v1/responses',
      /* Same host, different port — an origin comparison, not a hostname one. */
      'http://localhost:4001/v1/chat',
      /* A lookalike suffix must not match a prefix test. */
      'http://localhost:4000.evil.example/v1/chat',
      'app://tau/assets/entry.js',
    ]) {
      expect(injectTauHeaders(url, { accept: '*/*' }, options)).toEqual({ accept: '*/*' });
    }
  });

  it('sends the client header but no authorization while signed out', () => {
    expect(
      injectTauHeaders('http://localhost:4000/v1/auth/get-session', {}, { ...options, token: () => undefined }),
    ).toEqual({ 'tau-client': 'tau-desktop/0.0.1' });
  });

  it('replaces a renderer-supplied credential rather than sending two', () => {
    /* Header names are case-insensitive: spreading the request headers and then
     * setting the lowercase name would leave both on the wire, with the one main
     * did not choose potentially winning. */
    const injected = injectTauHeaders(
      'http://localhost:4000/v1/chat',
      { Authorization: 'Bearer renderer-supplied', 'TAU-Client': 'tau-web/9', accept: '*/*' },
      options,
    );
    expect(injected).toEqual({
      accept: '*/*',
      authorization: 'Bearer session-token',
      'tau-client': 'tau-desktop/0.0.1',
    });
  });

  it('strips a stale credential even while signed out', () => {
    const injected = injectTauHeaders(
      'http://localhost:4000/v1/chat',
      { AUTHORIZATION: 'Bearer stale' },
      { ...options, token: () => undefined },
    );
    expect(injected).toEqual({ 'tau-client': 'tau-desktop/0.0.1' });
  });

  it('leaves an unparseable request URL alone', () => {
    expect(injectTauHeaders('::::', { accept: '*/*' }, options)).toEqual({ accept: '*/*' });
  });
});

describe('originOf', () => {
  it('normalizes configured URLs to the origin webRequest reports', () => {
    expect(originOf('http://localhost:4000/')).toBe('http://localhost:4000');
    expect(originOf('ws://localhost:4001')).toBe('ws://localhost:4001');
    expect(originOf(undefined)).toBeUndefined();
    expect(originOf('not-a-url')).toBeUndefined();
  });
});
