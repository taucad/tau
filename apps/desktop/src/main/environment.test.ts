/* eslint-disable @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE. */
import { describe, expect, it } from 'vitest';

import { clientEnvironment, desktopAgentGatewayBaseUrl, desktopEnvironment } from '#main/environment.js';

describe('desktopEnvironment', () => {
  it('supplies production endpoints when the app is launched without a shell environment', () => {
    expect(desktopEnvironment({})).toMatchObject({
      TAU_API_URL: 'https://api.tau.new',
      TAU_WEBSOCKET_URL: 'wss://api.tau.new',
      TAU_FRONTEND_URL: 'https://tau.new',
    });
  });

  it('keeps explicit environment overrides and replaces blank endpoint values', () => {
    expect(
      desktopEnvironment({
        TAU_API_URL: 'https://api.staging.tau.test/',
        TAU_WEBSOCKET_URL: '   ',
        TAU_FRONTEND_URL: 'https://staging.tau.test',
        TAU_DEBUG: 'true',
      }),
    ).toMatchObject({
      TAU_API_URL: 'https://api.staging.tau.test/',
      TAU_WEBSOCKET_URL: 'wss://api.tau.new',
      TAU_FRONTEND_URL: 'https://staging.tau.test',
      TAU_DEBUG: 'true',
    });
  });

  it('publishes complete client defaults without leaking unrelated host values', () => {
    expect(clientEnvironment({ OPENAI_API_KEY: 'secret' })).toEqual({
      TAU_API_URL: 'https://api.tau.new',
      TAU_WEBSOCKET_URL: 'wss://api.tau.new',
      TAU_FRONTEND_URL: 'https://tau.new',
    });
  });

  it('publishes the billing environment the cloud renderer needs', () => {
    expect(clientEnvironment({ TAU_BILLING_ENVIRONMENT: 'development' })).toMatchObject({
      TAU_BILLING_ENVIRONMENT: 'development',
    });
  });
});

describe('desktopAgentGatewayBaseUrl', () => {
  /* The transport appends `v1/llm/...` itself. Composing it here is what makes
   * this a regression test rather than a restatement: a prefix added to the
   * base lands in the path twice, which is the 404 shipped in the packaged app
   * while every e2e spec set the retired override and never exercised the
   * default. The override is gone; the desktop e2e suite drives this path. */
  const composed = (base: string): string => new URL('v1/llm/openai/v1/responses', `${base}/`).href;

  it('composes the API gateway route from the default base', () => {
    expect(composed(desktopAgentGatewayBaseUrl({ TAU_API_URL: 'http://localhost:4000' }))).toBe(
      'http://localhost:4000/v1/llm/openai/v1/responses',
    );
  });

  it('composes the same route from a trailing-slash base and from the production default', () => {
    expect(composed(desktopAgentGatewayBaseUrl({ TAU_API_URL: 'http://localhost:4000/' }))).toBe(
      'http://localhost:4000/v1/llm/openai/v1/responses',
    );
    expect(composed(desktopAgentGatewayBaseUrl({}))).toBe('https://api.tau.new/v1/llm/openai/v1/responses');
  });
});
