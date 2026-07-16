import { describe, it, expect } from 'vitest';
import type { RenderFailureCode } from '#render-error.js';
import { RenderError } from '#render-error.js';

describe('RenderError', () => {
  describe('from', () => {
    it('should classify each taxonomy tag to its code', () => {
      const cases: Array<[string, RenderFailureCode]> = [
        ['adapter-unavailable: no gpu adapter', 'adapter-unavailable'],
        ['gpu: poll failed', 'gpu'],
        ['parse: unexpected glb magic', 'parse'],
        ['encode: jpeg has no alpha channel', 'encode'],
      ];
      for (const [message, code] of cases) {
        const error = RenderError.from(new Error(message));
        expect(error).toBeInstanceOf(RenderError);
        expect(error.code).toBe(code);
        expect(error.message).toBe(message);
      }
    });

    it('should detect device loss regardless of the leading tag', () => {
      const error = RenderError.from(new Error('gpu: map_async callback dropped (device lost?)'));
      expect(error.code).toBe('device-lost');
    });

    it('should classify an untagged message as unknown', () => {
      const error = RenderError.from(new Error('something unexpected'));
      expect(error.code).toBe('unknown');
      expect(error.name).toBe('RenderError');
    });

    it('should contain a non-Error throw as an unknown RenderError', () => {
      const error = RenderError.from('raw string failure');
      expect(error).toBeInstanceOf(RenderError);
      expect(error.code).toBe('unknown');
      expect(error.message).toBe('raw string failure');
    });

    it('should return the same instance when given a RenderError', () => {
      const original = new RenderError('parse', 'parse: bad');
      expect(RenderError.from(original)).toBe(original);
    });
  });

  describe('isGpuFault', () => {
    it('should be true for transient GPU faults and false for deterministic faults', () => {
      const gpuFaults: RenderFailureCode[] = ['adapter-unavailable', 'device-lost', 'gpu'];
      const deterministic: RenderFailureCode[] = ['parse', 'encode', 'unknown'];
      for (const code of gpuFaults) {
        expect(new RenderError(code, 'x').isGpuFault).toBe(true);
      }
      for (const code of deterministic) {
        expect(new RenderError(code, 'x').isGpuFault).toBe(false);
      }
    });
  });
});
