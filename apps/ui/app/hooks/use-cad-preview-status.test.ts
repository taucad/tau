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

  it('should prefer initError over CAD state', () => {
    expect(
      deriveCadPreviewStatus({
        initError: new Error('bootstrap failed'),
        cadState: 'idle',
      }),
    ).toBe('error');
  });
});
