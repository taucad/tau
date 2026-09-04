import { describe, expect, it } from 'vitest';

import { appOrigin } from '#main/app-protocol.js';
import {
  contentSecurityPolicy,
  isPermissionGranted,
  isRendererUrl,
  isTrustedSender,
  navigationDecision,
  rendererOrigins,
} from '#main/navigation-policy.js';

const production = rendererOrigins({ appOrigin });
const development = rendererOrigins({ appOrigin, devServerUrl: 'http://localhost:3001' });

describe('rendererOrigins', () => {
  it('is exactly the app origin in production', () => {
    expect(production).toEqual(['app://tau']);
  });

  it('admits the dev server when one is running', () => {
    expect(development).toEqual(['app://tau', 'http://localhost:3001']);
  });

  it('grants nothing extra for a malformed dev URL', () => {
    expect(rendererOrigins({ appOrigin, devServerUrl: 'not-a-url' })).toEqual(['app://tau']);
  });
});

describe('isRendererUrl', () => {
  it('accepts the app origin and rejects everything else', () => {
    expect(isRendererUrl('app://tau/w/acme/widget', production)).toBe(true);
    expect(isRendererUrl('https://example.com', production)).toBe(false);
    /* A lookalike must not pass a prefix-style test. */
    expect(isRendererUrl('app://tau.evil.example/', production)).toBe(false);
    expect(isRendererUrl('http://localhost:3001/', production)).toBe(false);
    expect(isRendererUrl('garbage', production)).toBe(false);
  });
});

describe('navigationDecision', () => {
  it('allows navigation inside the app', () => {
    expect(navigationDecision('app://tau/settings', production)).toBe('allow');
  });

  it('sends real links to the user browser instead of loading them in-window', () => {
    /* Loading a foreign origin in-window would hand it the preload bridge:
     * requestServicesPort, tauAuth, the kernel bridge — and main would keep
     * attaching the bearer to API-origin requests it makes. */
    expect(navigationDecision('https://example.com/docs', production)).toBe('open-externally');
    expect(navigationDecision('http://example.com', production)).toBe('open-externally');
    expect(navigationDecision('mailto:someone@example.com', production)).toBe('open-externally');
  });

  it('refuses everything else outright rather than handing it to the OS', () => {
    // oxlint-disable-next-line eslint/no-script-url -- the point of the test is that this is refused
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'tau://auth/callback', 'not a url']) {
      expect([url, navigationDecision(url, production)]).toEqual([url, 'deny']);
    }
  });
});

describe('isTrustedSender', () => {
  it('accepts the app top-level document only', () => {
    expect(isTrustedSender({ url: 'app://tau/' }, production)).toBe(true);
  });

  it('refuses a nested frame, which still holds the preload bridge', () => {
    expect(isTrustedSender({ url: 'app://tau/', parent: {} }, production)).toBe(false);
  });

  it('refuses a document that navigated away, and an absent frame', () => {
    expect(isTrustedSender({ url: 'https://example.com/' }, production)).toBe(false);
    expect(isTrustedSender(undefined, production)).toBe(false);
  });
});

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy(['http://localhost:4000', 'ws://localhost:4001']);
  const directive = (name: string): string =>
    policy.split('; ').find((entry) => entry.startsWith(`${name} `)) ?? `${name} <absent>`;

  it('starts from deny-all so every directive is an explicit grant', () => {
    expect(policy.startsWith("default-src 'none'; ")).toBe(true);
  });

  it('reaches the API and WebSocket origins and nothing else', () => {
    expect(directive('connect-src')).toBe("connect-src 'self' data: blob: http://localhost:4000 ws://localhost:4001");
  });

  it('admits no remote script origin, while allowing what the SPA measurably needs', () => {
    /* React Router's built index.html carries five inline scripts; without
     * 'unsafe-inline' the app does not boot. What the directive still buys is
     * the part that matters: no remote origin can supply code. */
    const scriptSource = directive('script-src');
    expect(scriptSource).toContain("'self'");
    expect(scriptSource).toContain("'unsafe-inline'");
    expect(scriptSource).toContain("'wasm-unsafe-eval'");
    expect(scriptSource.split(' ')).not.toContain("'unsafe-eval'");
    expect(scriptSource).not.toContain('http://');
    expect(scriptSource).not.toContain('https://');
  });

  it('allows blob workers and closes the redirect-style escapes', () => {
    expect(directive('worker-src')).toBe("worker-src 'self' blob:");
    for (const closed of ['object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
      expect([closed, directive(closed)]).toEqual([closed, `${closed} 'none'`]);
    }
  });
});

describe('isPermissionGranted', () => {
  it('grants persistent storage, because evictable storage is data loss on a native app', () => {
    /* The file manager mounts `/node_modules` on OPFS and keeps its file pool
     * there; denying this leaves all of it evictable. */
    expect(isPermissionGranted('persistent-storage')).toBe(true);
  });

  it('denies everything the app never asks for', () => {
    for (const permission of [
      'media',
      'geolocation',
      'notifications',
      'clipboard-read',
      'background-sync',
      'web-app-installation',
      'openExternal',
    ]) {
      expect([permission, isPermissionGranted(permission)]).toEqual([permission, false]);
    }
  });
});
