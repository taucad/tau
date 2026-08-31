import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  apiHeaders,
  applyApiHeaders,
  applyDocumentHeaders,
  applySubresourceHeaders,
  detectMultiThreadSupport,
  documentHeaders,
  getIsolationStatus,
  subresourceHeaders,
} from '#cross-origin-isolation/index.js';
import type { IsolationStatus } from '#cross-origin-isolation/index.js';

describe('canonical header constants', () => {
  it('documentHeaders should contain COOP, COEP require-corp, CORP same-origin', () => {
    expect(documentHeaders).toEqual({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
  });

  it('apiHeaders should advertise CORP cross-origin', () => {
    expect(apiHeaders).toEqual({ 'Cross-Origin-Resource-Policy': 'cross-origin' });
  });

  it('subresourceHeaders should advertise CORP same-origin', () => {
    expect(subresourceHeaders).toEqual({ 'Cross-Origin-Resource-Policy': 'same-origin' });
  });

  it('should be frozen so consumers cannot mutate canonical values', () => {
    expect(Object.isFrozen(documentHeaders)).toBe(true);
    expect(Object.isFrozen(apiHeaders)).toBe(true);
    expect(Object.isFrozen(subresourceHeaders)).toBe(true);
  });
});

describe('applyDocumentHeaders', () => {
  it('should set all three headers on a Headers instance', () => {
    const target = new Headers();
    applyDocumentHeaders(target);
    expect(target.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(target.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(target.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });

  it('should set all three headers on a plain record', () => {
    const target: Record<string, string> = {};
    applyDocumentHeaders(target);
    expect(target).toEqual({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
  });

  it('should override existing values', () => {
    const target = new Headers({ 'Cross-Origin-Opener-Policy': 'unsafe-none' });
    applyDocumentHeaders(target);
    expect(target.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });
});

describe('applyApiHeaders', () => {
  it('should set CORP cross-origin on a Headers instance', () => {
    const target = new Headers();
    applyApiHeaders(target);
    expect(target.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
  });

  it('should not set COOP or COEP (those belong to the document only)', () => {
    const target = new Headers();
    applyApiHeaders(target);
    expect(target.get('Cross-Origin-Opener-Policy')).toBeNull();
    expect(target.get('Cross-Origin-Embedder-Policy')).toBeNull();
  });
});

describe('applySubresourceHeaders', () => {
  it('should set CORP same-origin on a Headers instance', () => {
    const target = new Headers();
    applySubresourceHeaders(target);
    expect(target.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
  });
});

describe('getIsolationStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'reports the insecure context first, even when SAB is also missing',
      { isSecureContext: false, crossOriginIsolated: false, sharedArrayBuffer: undefined },
      { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-secure-context' },
    ],
    [
      'reports missing COOP/COEP when the context is secure but not isolated',
      { isSecureContext: true, crossOriginIsolated: false, sharedArrayBuffer: undefined },
      { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-coep' },
    ],
    [
      'reports the missing constructor when nothing else is gated',
      { isSecureContext: true, crossOriginIsolated: true, sharedArrayBuffer: undefined },
      { crossOriginIsolated: false, sharedArrayBuffer: false, reason: 'no-sab-constructor' },
    ],
  ] as const)('%s', (_label, globals, expected: IsolationStatus) => {
    vi.stubGlobal('isSecureContext', globals.isSecureContext);
    vi.stubGlobal('crossOriginIsolated', globals.crossOriginIsolated);
    vi.stubGlobal('SharedArrayBuffer', globals.sharedArrayBuffer);

    expect(getIsolationStatus()).toEqual(expected);
  });

  it('treats the unstubbed Node globals as isolated (absent flags are not a gate)', () => {
    expect(getIsolationStatus()).toEqual({ crossOriginIsolated: true, sharedArrayBuffer: true });
  });
});

describe('detectMultiThreadSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'reports an insecure context',
      { isSecureContext: false, crossOriginIsolated: false, sharedArrayBuffer: undefined },
      'crossOriginIsolated=false (insecure context)',
    ],
    [
      'reports missing isolation headers',
      { isSecureContext: true, crossOriginIsolated: false, sharedArrayBuffer: SharedArrayBuffer },
      'crossOriginIsolated=false (missing COOP/COEP headers)',
    ],
    [
      'reports a missing SharedArrayBuffer constructor',
      { isSecureContext: true, crossOriginIsolated: true, sharedArrayBuffer: undefined },
      'SharedArrayBuffer unavailable',
    ],
  ] as const)('%s', (_label, globals, reason) => {
    vi.stubGlobal('isSecureContext', globals.isSecureContext);
    vi.stubGlobal('crossOriginIsolated', globals.crossOriginIsolated);
    vi.stubGlobal('SharedArrayBuffer', globals.sharedArrayBuffer);

    expect(detectMultiThreadSupport()).toEqual({ supported: false, reason });
  });

  it('supports the unstubbed Node realm', () => {
    expect(detectMultiThreadSupport()).toEqual({ supported: true, reason: 'SAB available' });
  });
});
