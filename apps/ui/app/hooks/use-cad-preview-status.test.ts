import { describe, expect, it } from 'vitest';
import { deriveCadPreviewStatus } from '#hooks/use-cad-preview.js';

describe('deriveCadPreviewStatus', () => {
  it('should stay ready before the first render settles with no geometry', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
      }),
    ).toBe('ready');
  });

  it('should not expose an empty successful render state', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
      }),
    ).toBe('ready');
  });

  it('should stay ready when geometry is present after a settled render', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
      }),
    ).toBe('ready');
  });

  it('should stay loading while the pipeline is active even if render id is settled', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'rendering',
      }),
    ).toBe('loading');
  });

  it('should report error when the first render settled as failure with no geometry', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
        geometryFailed: true,
      }),
    ).toBe('error');
  });

  it('should stay loading during a re-render even after a prior failure', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'rendering',
        geometryFailed: true,
      }),
    ).toBe('loading');
  });

  it('should stay ready when a later failure still has a stale frame to show', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
        geometryFailed: false,
      }),
    ).toBe('ready');
  });

  it('should prefer initError over CAD state', () => {
    expect(
      deriveCadPreviewStatus({
        initError: new Error('bootstrap failed'),
        cadState: 'idle',
      }),
    ).toBe('error');
  });
});
