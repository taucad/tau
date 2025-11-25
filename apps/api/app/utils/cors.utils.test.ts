import { describe, it, expect, vi } from 'vitest';
import {
  createCorsOriginValidator,
  separateOriginsAndPatterns,
  createCorsOriginValidatorFromList,
} from '#utils/cors.utils.js';

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
    const validator = createCorsOriginValidator([], ['https://deploy-preview-*--taucad.netlify.app']);
    const callback = vi.fn();

    validator('https://deploy-preview-78--taucad.netlify.app', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('should match Netlify deploy preview URLs with different PR numbers', () => {
    const validator = createCorsOriginValidator([], ['https://deploy-preview-*--taucad.netlify.app']);

    const callback1 = vi.fn();
    validator('https://deploy-preview-1--taucad.netlify.app', callback1);
    expect(callback1).toHaveBeenCalledWith(null, true);

    const callback2 = vi.fn();
    validator('https://deploy-preview-999--taucad.netlify.app', callback2);
    expect(callback2).toHaveBeenCalledWith(null, true);

    const callback3 = vi.fn();
    validator('https://deploy-preview-12345--taucad.netlify.app', callback3);
    expect(callback3).toHaveBeenCalledWith(null, true);
  });

  it('should reject non-matching Netlify URLs', () => {
    const validator = createCorsOriginValidator([], ['https://deploy-preview-*--taucad.netlify.app']);
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
