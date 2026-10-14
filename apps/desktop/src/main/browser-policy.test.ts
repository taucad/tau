import { describe, expect, it } from 'vitest';
import { browserAddress, browserPreferences, isBrowserUrl } from '#main/browser-policy.js';
import { browserCommandSchema } from '@taucad/types/browser';

describe('browser navigation boundary', () => {
  it.each([
    'file:///etc/passwd',
    // oxlint-disable-next-line no-script-url -- Regression input verifies rejection of executable URLs.
    'javascript:alert(1)',
    'data:text/html,hi',
    'app://tau',
    'https://user:pass@example.com',
    'mailto:test@example.com',
    'https://',
  ])('should refuse unsafe target %s', (url) => {
    expect(isBrowserUrl(url)).toBe(false);
    expect(() => browserAddress(url, 'duckduckgo')).toThrow();
  });
  it('should normalize addresses and encode searches without executing schemes', () => {
    expect(browserAddress('example.com/docs', 'duckduckgo')).toBe('https://example.com/docs');
    expect(browserAddress('localhost:3000', 'duckduckgo')).toBe('http://localhost:3000/');
    expect(browserAddress('stainless steel M4', 'google')).toBe('https://www.google.com/search?q=stainless+steel+M4');
    expect(browserAddress('https://example.com/path', 'bing')).toBe('https://example.com/path');
  });
  it('should explicitly sandbox guests without any app preload', () => {
    expect(browserPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    });
    expect(browserPreferences).not.toHaveProperty('preload');
  });
  it('should reject forged commands and non-finite bounds', () => {
    expect(browserCommandSchema.safeParse({ kind: 'executeJavaScript', code: 'process.exit()' }).success).toBe(false);
    expect(browserCommandSchema.safeParse({ kind: 'new-tab', input: 'example.com', preload: '/evil' }).success).toBe(
      false,
    );
    expect(
      browserCommandSchema.safeParse({
        kind: 'viewport',
        tabId: 'test',
        visible: true,
        x: Number.NaN,
        y: 0,
        width: 20,
        height: 20,
      }).success,
    ).toBe(false);
    expect(browserCommandSchema.safeParse({ kind: 'zoom', tabId: 'test', factor: 100 }).success).toBe(false);
  });
});
