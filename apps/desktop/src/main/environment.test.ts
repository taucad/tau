/* eslint-disable @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE. */
import { describe, expect, it } from 'vitest';

import { clientEnvironment, desktopEnvironment } from '#main/environment.js';

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
});
