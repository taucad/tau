/* eslint-disable @typescript-eslint/naming-convention -- Environment names are SCREAMING_SNAKE. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  clientEnvironment,
  desktopAgentGatewayBaseUrl,
  desktopEnvironment,
  packagedOverridesEnabled,
  stripPackagedOverrides,
} from '#main/environment.js';

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

  it('ignores endpoint, renderer, client-root, executable and e2e overrides in a locked packaged build', () => {
    const environment = desktopEnvironment(
      {
        TAU_API_URL: 'https://attacker.example',
        TAU_WEBSOCKET_URL: 'wss://attacker.example',
        TAU_FRONTEND_URL: 'https://attacker.example',
        TAU_S3_ENDPOINT: 'https://attacker.example',
        ELECTRON_RENDERER_URL: 'https://attacker.example',
        TAU_DESKTOP_CLIENT_ROOT: '/tmp/attacker-spa',
        TAU_BAMBU_STUDIO_PATH: '/tmp/attacker-binary',
        TAU_E2E_HIDE_WINDOW: '1',
        TAU_E2E_DISABLE_CREDENTIAL_PERSISTENCE: '1',
        TAU_DEBUG: 'true',
      },
      { locked: true },
    );
    expect(environment).toEqual({
      TAU_API_URL: 'https://api.tau.new',
      TAU_WEBSOCKET_URL: 'wss://api.tau.new',
      TAU_FRONTEND_URL: 'https://tau.new',
      TAU_DEBUG: 'true',
    });
  });

  it('scrubs the locked names in place and keeps everything else', () => {
    const target: NodeJS.ProcessEnv = {
      PATH: '/usr/bin',
      ELECTRON_RENDERER_URL: 'https://attacker.example',
      TAU_E2E_WAIT_FOR_PLAYWRIGHT: '1',
      TAU_CONFIG_DIR: '/Users/me/.tau',
    };
    stripPackagedOverrides(target);
    expect(target).toEqual({ PATH: '/usr/bin', TAU_CONFIG_DIR: '/Users/me/.tau' });
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

describe('packagedOverridesEnabled', () => {
  const roots: string[] = [];
  afterAll(async () => {
    await Promise.all(roots.map(async (root) => rm(root, { recursive: true, force: true })));
  });
  const appWith = async (manifest: string | undefined): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'tau-packaged-manifest-'));
    roots.push(root);
    if (manifest !== undefined) {
      await writeFile(join(root, 'package.json'), manifest);
    }
    return root;
  };

  it('opts in only when the packaged manifest says so', async () => {
    expect(packagedOverridesEnabled(await appWith('{"tauDesktop":{"environmentOverrides":true}}'))).toBe(true);
  });

  it('locks a release manifest, a truthy non-boolean, a malformed and a missing manifest', async () => {
    expect(packagedOverridesEnabled(await appWith('{"name":"@taucad/desktop"}'))).toBe(false);
    expect(packagedOverridesEnabled(await appWith('{"tauDesktop":{"environmentOverrides":"true"}}'))).toBe(false);
    expect(packagedOverridesEnabled(await appWith('{'))).toBe(false);
    expect(packagedOverridesEnabled(await appWith(undefined))).toBe(false);
  });
});
