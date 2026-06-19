import { describe, expect, it } from 'vitest';
import { deriveCadPreviewStatus } from '#hooks/use-cad-preview.js';

describe('deriveCadPreviewStatus', () => {
  it('should stay ready before the first render settles with no geometry', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
        lastSettledRenderId: 0,
        geometryCount: 0,
      }),
    ).toBe('ready');
  });

  it('should become empty after a settled render produced no geometry', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
        lastSettledRenderId: 1,
        geometryCount: 0,
      }),
    ).toBe('empty');
  });

  it('should stay ready when geometry is present after a settled render', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'idle',
        lastSettledRenderId: 1,
        geometryCount: 2,
      }),
    ).toBe('ready');
  });

  it('should stay loading while the pipeline is active even if render id is settled', () => {
    expect(
      deriveCadPreviewStatus({
        initError: undefined,
        cadState: 'rendering',
        lastSettledRenderId: 1,
        geometryCount: 0,
      }),
    ).toBe('loading');
  });

  it('should prefer initError over empty geometry', () => {
    expect(
      deriveCadPreviewStatus({
        initError: new Error('bootstrap failed'),
        cadState: 'idle',
        lastSettledRenderId: 1,
        geometryCount: 0,
      }),
    ).toBe('error');
  });
});
