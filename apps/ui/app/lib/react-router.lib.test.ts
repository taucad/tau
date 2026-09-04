import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { cacheTag, cdnBackedSsrRouteHeaders, throwRedirectIfSubdomain } from '#lib/react-router.lib.js';

/**
 * The homepage is the one SSR route whose CDN policy lives in `netlify.toml`
 * rather than in a route `headers` export — React Router SPA mode (the
 * `ui:build:desktop` config) bans that export and `_index/route.tsx` is shared
 * by both builds. Nothing but this test binds the two together.
 */
const readNetlifyHomepageHeaders = (): Record<string, string> => {
  const toml = readFileSync(resolve(import.meta.dirname, '../../netlify.toml'), 'utf8');
  const block = toml
    .split('[[headers]]')
    .slice(1)
    .find((chunk) => /^for = "\/"$/mu.test(chunk));
  if (block === undefined) {
    throw new Error('netlify.toml has no [[headers]] block for "/"');
  }

  const headers: Record<string, string> = {};
  for (const line of block.slice(block.indexOf('[headers.values]')).split('\n').slice(1)) {
    const match = /^([\w-]+) = "(.*)"$/u.exec(line);
    if (!match) {
      break;
    }
    headers[match[1]!] = match[2]!;
  }
  return headers;
};

describe('netlify.toml homepage cache policy', () => {
  it('matches the cdnBackedSsrRouteHeaders the deleted _index headers export returned', () => {
    expect(readNetlifyHomepageHeaders()).toStrictEqual(cdnBackedSsrRouteHeaders(cacheTag.homepage, 'short'));
  });
});

describe('redirectIfSubdomain', () => {
  it('should throw a redirect when subdomain matches', () => {
    const request = new Request('https://www.tau.new/some/path?query=1');

    expect(() => {
      throwRedirectIfSubdomain(request, 'www');
    }).toThrow();
  });

  it('should not throw when subdomain does not match', () => {
    const request = new Request('https://tau.new/some/path');

    expect(() => {
      throwRedirectIfSubdomain(request, 'www');
    }).not.toThrow();
  });

  it('should redirect to apex domain with correct path and query', () => {
    const request = new Request('https://www.tau.new/some/path?query=1');

    try {
      throwRedirectIfSubdomain(request, 'www');
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(301);
      expect(response.headers.get('Location')).toBe('https://tau.new/some/path?query=1');
    }
  });

  it('should use 301 status code by default', () => {
    const request = new Request('https://www.example.com/');

    try {
      throwRedirectIfSubdomain(request, 'www');
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(301);
    }
  });

  it('should use custom status code when provided', () => {
    const request = new Request('https://www.example.com/');

    try {
      throwRedirectIfSubdomain(request, 'www', 302);
    } catch (error) {
      const response = error as Response;
      expect(response.status).toBe(302);
    }
  });

  it('should handle multi-level subdomains correctly', () => {
    const request = new Request('https://www.sub.example.com/path');

    try {
      throwRedirectIfSubdomain(request, 'www');
    } catch (error) {
      const response = error as Response;
      expect(response.headers.get('Location')).toBe('https://sub.example.com/path');
    }
  });

  it('should not redirect when a different subdomain is specified', () => {
    const request = new Request('https://www.example.com/');

    expect(() => {
      throwRedirectIfSubdomain(request, 'api');
    }).not.toThrow();
  });

  it('should redirect other subdomains when specified', () => {
    const request = new Request('https://api.example.com/v1/users');

    try {
      throwRedirectIfSubdomain(request, 'api');
    } catch (error) {
      const response = error as Response;
      expect(response.headers.get('Location')).toBe('https://example.com/v1/users');
    }
  });
});
