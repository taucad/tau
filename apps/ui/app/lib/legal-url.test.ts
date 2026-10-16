import { afterEach, describe, expect, it } from 'vitest';
import { legalUrl } from '#lib/legal-url.js';
import { websiteOrigin } from '#lib/website-origin.js';

const clientEnvironment = globalThis.window.ENV;

const bind = (environment: { TAU_FRONTEND_URL?: string }): void => {
  globalThis.window.ENV = { ...clientEnvironment, ...environment };
};

afterEach(() => {
  globalThis.window.ENV = clientEnvironment;
});

describe('websiteOrigin', () => {
  it.each([
    ['https://tau.new', 'https://tau.new'],
    ['https://taucad.dev/', 'https://taucad.dev'],
  ])('should keep a hosted deployment bound to %s on its own website', (frontendUrl, expected) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
    bind({ TAU_FRONTEND_URL: frontendUrl });
    expect(websiteOrigin()).toBe(expected);
  });

  it.each(['http://localhost:3000', 'https://deploy-preview-42--taucad.netlify.app', 'https://cad.example.com'])(
    'should send %s, which runs no website, to the public site instead of a missing page',
    (frontendUrl) => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      bind({ TAU_FRONTEND_URL: frontendUrl });
      expect(websiteOrigin()).toBe('https://tau.new');
    },
  );
});

describe('legalUrl', () => {
  it('should link the page and anchor on the website origin', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
    bind({ TAU_FRONTEND_URL: 'https://taucad.dev' });
    expect(legalUrl('privacy#9.2.1-ai-service-improvement')).toBe(
      'https://taucad.dev/legal/privacy#9.2.1-ai-service-improvement',
    );
  });
});
