import { describe, it, expect, vi } from 'vitest';
import {
  createCorsOriginValidator,
  separateOriginsAndPatterns,
  createCorsOriginValidatorFromList,
  createTauCorsOriginValidator,
  desktopAppOrigin,
} from '#utils/cors.utils.js';
import { corsBaseConfiguration } from '#constants/cors.constant.js';

it('should expose the durable chat run identity and bearer session token to cross-origin clients', () => {
  expect(corsBaseConfiguration.exposedHeaders).toEqual(['x-tau-chat-run-id', 'set-auth-token']);
});

describe('separateOriginsAndPatterns', () => {
  it('should separate exact origins from glob patterns', () => {
    const origins = [
      'https://example.com',
      'https://*.example.com',
      'https://app.example.com',
      'https://**.example.org',
      'https://test?.example.com',
      'https://[abc].example.com',
    ];

    const result = separateOriginsAndPatterns(origins);

    expect(result.exactOrigins).toEqual(['https://example.com', 'https://app.example.com']);
    expect(result.globPatterns).toEqual([
      'https://*.example.com',
      'https://**.example.org',
      'https://test?.example.com',
      'https://[abc].example.com',
    ]);
  });

  it('should handle empty arrays', () => {
    const result = separateOriginsAndPatterns([]);

    expect(result.exactOrigins).toEqual([]);
    expect(result.globPatterns).toEqual([]);
  });

  it('should handle only exact origins', () => {
    const origins = ['https://example.com', 'https://app.example.com'];

    const result = separateOriginsAndPatterns(origins);

    expect(result.exactOrigins).toEqual(origins);
    expect(result.globPatterns).toEqual([]);
  });

  it('should handle only glob patterns', () => {
    const origins = ['https://*.example.com', 'https://test?.example.com'];

    const result = separateOriginsAndPatterns(origins);

    expect(result.exactOrigins).toEqual([]);
    expect(result.globPatterns).toEqual(origins);
  });
});

describe('createCorsOriginValidator', () => {
  it('should allow requests with no origin', () => {
    const validator = createCorsOriginValidator(['https://example.com'], []);
    const callback = vi.fn();

    validator(undefined, callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should allow exact origin matches', () => {
    const validator = createCorsOriginValidator(['https://example.com', 'https://app.example.com'], []);
    const callback = vi.fn();

    validator('https://example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should reject non-matching origins', () => {
    const validator = createCorsOriginValidator(['https://example.com'], []);
    const callback = vi.fn();

    validator('https://evil.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('should match glob patterns with wildcard', () => {
    const validator = createCorsOriginValidator([], ['https://*.example.com']);
    const callback = vi.fn();

    validator('https://app.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should match glob patterns with multiple wildcards', () => {
    const validator = createCorsOriginValidator([], ['https://*.*.example.com']);
    const callback = vi.fn();

    validator('https://app.dev.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should reject non-matching glob patterns', () => {
    const validator = createCorsOriginValidator([], ['https://*.example.com']);
    const callback = vi.fn();

    validator('https://example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('should match Netlify deploy preview URLs', () => {
    const validator = createCorsOriginValidator([], ['https://deploy-preview-*--example.netlify.app']);
    const callback = vi.fn();

    validator('https://deploy-preview-78--example.netlify.app', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should match Netlify deploy preview URLs with different PR numbers', () => {
    const validator = createCorsOriginValidator([], ['https://deploy-preview-*--example.netlify.app']);

    const callback1 = vi.fn();
    validator('https://deploy-preview-1--example.netlify.app', callback1);
    expect(callback1).toHaveBeenCalledWith(null, true);

    const callback2 = vi.fn();
    validator('https://deploy-preview-999--example.netlify.app', callback2);
    expect(callback2).toHaveBeenCalledWith(null, true);

    const callback3 = vi.fn();
    validator('https://deploy-preview-12345--example.netlify.app', callback3);
    expect(callback3).toHaveBeenCalledWith(null, true);
  });

  it('should reject non-matching Netlify URLs', () => {
    const validator = createCorsOriginValidator([], ['https://deploy-preview-*--example.netlify.app']);
    const callback = vi.fn();

    validator('https://deploy-preview-78--otherdomain.netlify.app', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('should match question mark patterns', () => {
    const validator = createCorsOriginValidator([], ['https://app?.example.com']);
    const callback = vi.fn();

    validator('https://app1.example.com', callback);
    expect(callback).toHaveBeenCalledWith(null, true);

    callback.mockClear();
    validator('https://app12.example.com', callback);
    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('should reject invalid origin formats', () => {
    const validator = createCorsOriginValidator(['https://example.com'], []);
    const callback = vi.fn();

    validator('not-a-valid-url', callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error), false);
    expect(callback.mock.calls[0]![0]).toHaveProperty('message', 'Invalid origin format');
  });

  it('should cache glob pattern results', () => {
    const validator = createCorsOriginValidator([], ['https://*.example.com']);
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    // First call - computes result
    validator('https://app.example.com', callback1);
    expect(callback1).toHaveBeenCalledWith(null, true);

    // Second call - uses cache
    validator('https://app.example.com', callback2);
    expect(callback2).toHaveBeenCalledWith(null, true);
  });

  it('should prioritize exact matches over glob patterns', () => {
    const validator = createCorsOriginValidator(['https://app.example.com'], ['https://*.example.com']);
    const callback = vi.fn();

    validator('https://app.example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should be case-sensitive', () => {
    const validator = createCorsOriginValidator(['https://example.com'], []);
    const callback = vi.fn();

    validator('https://Example.com', callback);

    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('should throw error when too many glob patterns are provided', () => {
    const manyPatterns = Array.from({ length: 51 }, (_, index) => `https://*.example${index}.com`);

    expect(() => {
      createCorsOriginValidator([], manyPatterns);
    }).toThrow('Too many CORS glob patterns (51). Maximum allowed: 50');
  });

  it('should handle maximum allowed glob patterns', () => {
    const maxPatterns = Array.from({ length: 50 }, (_, index) => `https://*.example${index}.com`);

    expect(() => {
      createCorsOriginValidator([], maxPatterns);
    }).not.toThrow();
  });

  it('should handle mixed exact origins and glob patterns', () => {
    const validator = createCorsOriginValidator(
      ['https://example.com', 'https://app.example.com'],
      ['https://*.staging.example.com', 'https://*.dev.example.com'],
    );

    const exactCallback = vi.fn();
    validator('https://example.com', exactCallback);
    expect(exactCallback).toHaveBeenCalledWith(null, true);

    const globCallback1 = vi.fn();
    validator('https://test.staging.example.com', globCallback1);
    expect(globCallback1).toHaveBeenCalledWith(null, true);

    const globCallback2 = vi.fn();
    validator('https://feature.dev.example.com', globCallback2);
    expect(globCallback2).toHaveBeenCalledWith(null, true);

    const rejectCallback = vi.fn();
    validator('https://evil.com', rejectCallback);
    expect(rejectCallback).toHaveBeenCalledWith(null, false);
  });
});

describe('createCorsOriginValidatorFromList', () => {
  it('should create validator from mixed list', () => {
    const validator = createCorsOriginValidatorFromList([
      'https://example.com',
      'https://*.staging.example.com',
      'https://app.example.com',
    ]);

    const exactCallback = vi.fn();
    validator('https://example.com', exactCallback);
    expect(exactCallback).toHaveBeenCalledWith(null, true);

    const globCallback = vi.fn();
    validator('https://test.staging.example.com', globCallback);
    expect(globCallback).toHaveBeenCalledWith(null, true);

    const rejectCallback = vi.fn();
    validator('https://evil.com', rejectCallback);
    expect(rejectCallback).toHaveBeenCalledWith(null, false);
  });

  it('should handle empty list', () => {
    const validator = createCorsOriginValidatorFromList([]);

    const callback = vi.fn();
    validator('https://example.com', callback);
    expect(callback).toHaveBeenCalledWith(null, false);
  });

  it('should automatically separate origins and patterns', () => {
    const validator = createCorsOriginValidatorFromList([
      'https://example.com',
      'https://*.example.com',
      'https://app?.example.com',
    ]);

    const exact1 = vi.fn();
    validator('https://example.com', exact1);
    expect(exact1).toHaveBeenCalledWith(null, true);

    const glob1 = vi.fn();
    validator('https://test.example.com', glob1);
    expect(glob1).toHaveBeenCalledWith(null, true);

    const glob2 = vi.fn();
    validator('https://app1.example.com', glob2);
    expect(glob2).toHaveBeenCalledWith(null, true);
  });
});

/**
 * Regression cover for defect B7 (desktop shell lane, 2026-09-02): the Electron
 * renderer sends `Origin: app://tau`, which no configured origin matched, so
 * every API response came back without `access-control-allow-origin` and the
 * browser discarded it.
 *
 * `app://tau` is a fixed product constant (rulings D4/C5), not a deployment
 * value — it cannot be derived from `TAU_FRONTEND_URL`, because the desktop app
 * serves its own SPA. It is admitted for **CORS only**; better-auth's
 * `trustedOrigins` is a separate list that ruling D7 keeps untouched.
 */
describe('createTauCorsOriginValidator', () => {
  const allow = (origin: string | undefined, nodeEnvironment = 'production'): boolean => {
    const validator = createTauCorsOriginValidator('https://tau.new', ['https://*.taucad.dev'], nodeEnvironment);
    let allowed = false;
    validator(origin, (error, result) => {
      allowed = error === null && result;
    });
    return allowed;
  };

  it('admits the desktop document origin (B7)', () => {
    expect(allow(desktopAppOrigin)).toBe(true);
    expect(desktopAppOrigin).toBe('app://tau');
  });

  it('still admits the configured frontend and additional origins', () => {
    expect(allow('https://tau.new')).toBe(true);
    expect(allow('https://preview.taucad.dev')).toBe(true);
  });

  it('keeps every other origin rejected, custom schemes included', () => {
    expect(allow('https://attacker.example')).toBe(false);
    expect(allow('app://evil')).toBe(false);
    expect(allow('app://tau.evil.com')).toBe(false);
    expect(allow('app://tau.evil')).toBe(false);
    expect(allow('tau://tau')).toBe(false);
  });

  it('matches the desktop origin exactly rather than as a pattern', () => {
    // `new URL()` accepts any custom scheme, so a glob here would admit
    // `app://<anything>`. Exactness is the whole security property.
    expect(separateOriginsAndPatterns([desktopAppOrigin])).toEqual({
      exactOrigins: [desktopAppOrigin],
      globPatterns: [],
    });
  });

  it('keeps allowing origin-less requests, as the loopback token exchange needs', () => {
    expect(allow(undefined)).toBe(true);
  });
});

/**
 * Regression cover for review finding MAJOR 8: `nx dev:desktop ui` serves the
 * renderer from `http://localhost:3001` (`apps/ui/desktop/vite.config.ts:61`),
 * which no configured origin matched — so the charter's own dev command could
 * not reach the API at all.
 *
 * Admitted only outside production: it is a loopback origin, and a deployed API
 * must never answer one.
 */
describe('createTauCorsOriginValidator development origins', () => {
  const allow = (origin: string, nodeEnvironment: string): boolean => {
    const validator = createTauCorsOriginValidator('https://tau.new', [], nodeEnvironment);
    let allowed = false;
    validator(origin, (error, result) => {
      allowed = error === null && result;
    });
    return allowed;
  };

  it.each(['development', 'test'])('admits the ui:dev:desktop renderer in %s', (nodeEnvironment) => {
    expect(allow('http://localhost:3001', nodeEnvironment)).toBe(true);
  });

  it('never admits it in production', () => {
    expect(allow('http://localhost:3001', 'production')).toBe(false);
  });

  it('admits the desktop document origin in every environment', () => {
    expect(allow(desktopAppOrigin, 'production')).toBe(true);
    expect(allow(desktopAppOrigin, 'development')).toBe(true);
  });

  it('does not open loopback generally, even in development', () => {
    expect(allow('http://localhost:3002', 'development')).toBe(false);
    expect(allow('http://127.0.0.1:3001', 'development')).toBe(false);
    expect(allow('https://localhost:3001', 'development')).toBe(false);
  });
});
