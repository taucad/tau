import { afterEach, describe, expect, it, vi } from 'vitest';

import { getIsolationStatus } from '@taucad/runtime/cross-origin-isolation';
import { detectMultiThreadSupport } from '#oc-threading.js';

describe('detectMultiThreadSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('agrees with getIsolationStatus in the gated and ungated cases', () => {
    expect(getIsolationStatus()).toEqual({ crossOriginIsolated: true, sharedArrayBuffer: true });
    expect(detectMultiThreadSupport()).toEqual({ supported: true, reason: 'SAB available' });

    vi.stubGlobal('crossOriginIsolated', false);

    expect(getIsolationStatus()).toEqual({ crossOriginIsolated: false, sharedArrayBuffer: true, reason: 'no-coep' });
    expect(detectMultiThreadSupport()).toEqual({
      supported: false,
      reason: 'crossOriginIsolated=false (missing COOP/COEP headers)',
    });
  });

  it('declines the pthread build where the Node permission model refuses worker threads', () => {
    Object.defineProperty(process, 'permission', {
      configurable: true,
      value: { has: (scope: string) => scope !== 'worker' },
    });
    try {
      expect(getIsolationStatus()).toEqual({ crossOriginIsolated: true, sharedArrayBuffer: true });
      expect(detectMultiThreadSupport()).toEqual({
        supported: false,
        reason: 'worker threads refused by the Node permission model (no --allow-worker)',
      });
    } finally {
      Reflect.deleteProperty(process, 'permission');
    }
  });

  it('keeps the pthread build where the Node permission model admits worker threads', () => {
    Object.defineProperty(process, 'permission', { configurable: true, value: { has: () => true } });
    try {
      expect(detectMultiThreadSupport()).toEqual({ supported: true, reason: 'SAB available' });
    } finally {
      Reflect.deleteProperty(process, 'permission');
    }
  });
});
