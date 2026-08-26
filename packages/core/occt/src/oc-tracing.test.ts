// oxlint-disable typescript-eslint/no-unsafe-return -- OC instance proxy returns any-typed values by design
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapOcForExceptions, wrapOcWithTracing } from '#oc-tracing.js';
import type { OcExceptionInstance } from '#oc-exceptions.js';
import { RenderAbortedError, isRenderAbortedError } from '@taucad/runtime';
import type * as RuntimeKernelModule from '@taucad/runtime/kernel';
import type { RuntimeSpanTracer, SpanHandle } from '@taucad/runtime/types';

const { checkAbortMock } = vi.hoisted(() => ({ checkAbortMock: vi.fn() }));

vi.mock('@taucad/runtime/kernel', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeKernelModule>()),
  checkAbort: checkAbortMock,
}));

// ===================================================================
// Helpers
// ===================================================================

type MockOc = OcExceptionInstance & {
  someMethod: (...args: unknown[]) => unknown;
  failingMethod?: (...args: unknown[]) => unknown;
  nonFunction?: string;
};

// Proxy from mock<T>() auto-adds getExceptionMessage, breaking "return original" test
function createMockOc(overrides?: Record<string, unknown>): MockOc {
  const base: Record<string, unknown> = {
    someMethod: vi.fn().mockReturnValue(42),
    nonFunction: 'string-value',
    ...overrides,
  };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- plain object required for identity test
  return base as unknown as MockOc;
}

function createMockTracer(): RuntimeSpanTracer & { startSpan: ReturnType<typeof vi.fn> } {
  const endFunction = vi.fn();
  const mockSpan: SpanHandle = { end: endFunction };
  return {
    startSpan: vi.fn().mockReturnValue(mockSpan),
  };
}

const abortNextCheck = (): void => {
  checkAbortMock.mockImplementationOnce(() => {
    throw new RenderAbortedError();
  });
};

beforeEach(() => {
  checkAbortMock.mockReset();
});

// ===================================================================
// Tests
// ===================================================================

describe('abort context via tracing proxy', () => {
  it('should throw RenderAbortedError when abort generation changes', () => {
    const oc = createMockOc({ getExceptionMessage: vi.fn() });
    const traced = wrapOcForExceptions(oc);

    abortNextCheck();

    expect(() => traced.someMethod()).toThrow(RenderAbortedError);
  });

  it('should not throw when abort generation matches', () => {
    const oc = createMockOc({ getExceptionMessage: vi.fn() });
    const traced = wrapOcForExceptions(oc);

    expect(() => traced.someMethod()).not.toThrow();
  });

  it('should continue after the abort check is reset', () => {
    const oc = createMockOc({ getExceptionMessage: vi.fn() });
    const traced = wrapOcForExceptions(oc);

    abortNextCheck();
    checkAbortMock.mockReset();

    expect(() => traced.someMethod()).not.toThrow();
  });
});

describe('wrapOcForExceptions', () => {
  it('should return original OC when no getExceptionMessage decoder exists', () => {
    const oc = createMockOc();
    const result = wrapOcForExceptions(oc);
    expect(result).toBe(oc);
  });

  it('should proxy function calls and return results', () => {
    const oc = createMockOc({ getExceptionMessage: vi.fn() });
    const traced = wrapOcForExceptions(oc);

    const result: unknown = traced.someMethod();
    expect(result).toBe(42);
  });

  it('should cache class proxies for repeated property access', () => {
    const oc = createMockOc({ getExceptionMessage: vi.fn() });
    const traced = wrapOcForExceptions(oc);

    const first = traced.someMethod;
    const second = traced.someMethod;
    expect(first).toBe(second);
  });

  it('should pass through symbol properties without wrapping', () => {
    const sym = Symbol('test');
    const oc = createMockOc({ getExceptionMessage: vi.fn(), [sym]: 'symbol-value' });
    const traced = wrapOcForExceptions(oc);

    expect((traced as Record<symbol, unknown>)[sym]).toBe('symbol-value');
  });

  it('should pass through non-function properties', () => {
    const oc = createMockOc({ getExceptionMessage: vi.fn() });
    const traced = wrapOcForExceptions(oc);

    expect(traced.nonFunction).toBe('string-value');
  });

  it('should rethrow non-WASM errors from proxied calls', () => {
    const oc = createMockOc({
      getExceptionMessage: vi.fn(),
      failingMethod: vi.fn().mockImplementation(() => {
        throw new Error('regular error');
      }),
    });
    const traced = wrapOcForExceptions(oc);

    expect(() => traced.failingMethod!()).toThrow('regular error');
  });
});

describe('wrapOcWithTracing', () => {
  it('should proxy function calls and return results', () => {
    const oc = createMockOc();
    const tracer = createMockTracer();
    const { tracedInstance } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

    const result: unknown = tracedInstance.someMethod();
    expect(result).toBe(42);
  });

  it('should cache class proxies for repeated property access', () => {
    const oc = createMockOc();
    const tracer = createMockTracer();
    const { tracedInstance } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

    const first = tracedInstance.someMethod;
    const second = tracedInstance.someMethod;
    expect(first).toBe(second);
  });

  it('should pass through symbol properties without wrapping', () => {
    const sym = Symbol('test');
    const oc = createMockOc({ [sym]: 'sym-val' });
    const tracer = createMockTracer();
    const { tracedInstance } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

    expect((tracedInstance as Record<symbol, unknown>)[sym]).toBe('sym-val');
  });

  it('should accumulate call stats in summary mode and emit on flush', () => {
    const oc = createMockOc();
    const tracer = createMockTracer();
    const { tracedInstance, summary } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

    tracedInstance.someMethod();
    tracedInstance.someMethod();
    summary.flush();

    const spannedArguments = (tracer.startSpan as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(spannedArguments[0]).toBe('oc.summary');
    expect(spannedArguments[1]).toHaveProperty('someMethod.calls', 2);
    expect(spannedArguments[1]).toHaveProperty('total.calls', 2);
  });

  it('should not emit span when flush is called with no calls', () => {
    const oc = createMockOc();
    const tracer = createMockTracer();
    const { summary } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

    summary.flush();
    expect(tracer.startSpan).not.toHaveBeenCalled();
  });

  it('should create per-call spans in per-call mode', () => {
    const oc = createMockOc();
    const tracer = createMockTracer();
    const { tracedInstance } = wrapOcWithTracing(oc, tracer, { mode: 'per-call' });

    tracedInstance.someMethod();

    expect(tracer.startSpan).toHaveBeenCalledWith('oc.someMethod', { method: 'apply' });
  });

  it('should rethrow errors from proxied calls', () => {
    const oc = createMockOc({
      failingMethod: vi.fn().mockImplementation(() => {
        throw new Error('kaboom');
      }),
    });
    const tracer = createMockTracer();
    const { tracedInstance } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

    expect(() => tracedInstance.failingMethod!()).toThrow('kaboom');
  });
});

// ===================================================================
// In-flight cooperative abort (multi-call sequences)
// ===================================================================

describe('in-flight cooperative abort', () => {
  function createMultiStepOc() {
    return createMockOc({
      getExceptionMessage: vi.fn(),
      step1: vi.fn().mockReturnValue('result-1'),
      step2: vi.fn().mockReturnValue('result-2'),
      step3: vi.fn().mockReturnValue('result-3'),
    }) as MockOc & {
      step1: (...args: unknown[]) => unknown;
      step2: (...args: unknown[]) => unknown;
      step3: (...args: unknown[]) => unknown;
    };
  }

  describe('wrapOcForExceptions proxy', () => {
    it('should complete all calls when generation matches throughout', () => {
      const oc = createMultiStepOc();
      const proxied = wrapOcForExceptions(oc);

      expect(proxied.step1()).toBe('result-1');
      expect(proxied.step2()).toBe('result-2');
      expect(proxied.step3()).toBe('result-3');
    });

    it('should throw RenderAbortedError on the first call after generation bump', () => {
      const oc = createMultiStepOc();
      const proxied = wrapOcForExceptions(oc);

      expect(proxied.step1()).toBe('result-1');
      expect(proxied.step2()).toBe('result-2');

      abortNextCheck();

      expect(() => proxied.step3()).toThrow(RenderAbortedError);
    });

    it('should execute prior steps but not the aborted step', () => {
      const oc = createMultiStepOc();
      const proxied = wrapOcForExceptions(oc);

      proxied.step1();
      proxied.step2();

      abortNextCheck();

      expect(() => proxied.step3()).toThrow(RenderAbortedError);
      expect(oc.step1).toHaveBeenCalledOnce();
      expect(oc.step2).toHaveBeenCalledOnce();
      expect(oc.step3).not.toHaveBeenCalled();
    });
  });

  describe('wrapOcWithTracing proxy', () => {
    it('should complete all calls when generation matches throughout', () => {
      const oc = createMultiStepOc();
      const tracer = createMockTracer();
      const { tracedInstance: proxied } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

      expect(proxied.step1()).toBe('result-1');
      expect(proxied.step2()).toBe('result-2');
      expect(proxied.step3()).toBe('result-3');
    });

    it('should throw RenderAbortedError on the first call after generation bump', () => {
      const oc = createMultiStepOc();
      const tracer = createMockTracer();
      const { tracedInstance: proxied } = wrapOcWithTracing(oc, tracer, { mode: 'summary' });

      expect(proxied.step1()).toBe('result-1');

      abortNextCheck();

      expect(() => proxied.step2()).toThrow(RenderAbortedError);
    });

    it('should abort in per-call tracing mode', () => {
      const oc = createMultiStepOc();
      const tracer = createMockTracer();
      const { tracedInstance: proxied } = wrapOcWithTracing(oc, tracer, { mode: 'per-call' });

      expect(proxied.step1()).toBe('result-1');

      abortNextCheck();

      expect(() => proxied.step2()).toThrow(RenderAbortedError);
    });
  });

  describe('recovery after abort', () => {
    it('should resume normal operation after a completed abort check', () => {
      const oc = createMultiStepOc();
      const proxied = wrapOcForExceptions(oc);

      proxied.step1();

      abortNextCheck();
      expect(() => proxied.step2()).toThrow(RenderAbortedError);

      checkAbortMock.mockReset();

      const freshOc = createMultiStepOc();
      const freshProxied = wrapOcForExceptions(freshOc);

      expect(freshProxied.step1()).toBe('result-1');
      expect(freshProxied.step2()).toBe('result-2');
      expect(freshProxied.step3()).toBe('result-3');
    });
  });

  describe('render loop catch pattern', () => {
    it('should catch RenderAbortedError and transition state to idle', () => {
      const oc = createMultiStepOc();
      const proxied = wrapOcForExceptions(oc);

      let workerState = 'rendering';

      try {
        proxied.step1();
        proxied.step2();

        abortNextCheck();

        proxied.step3();
        expect.fail('should have thrown RenderAbortedError');
      } catch (error) {
        workerState = isRenderAbortedError(error) ? 'idle' : 'error';
      }

      expect(workerState).toBe('idle');
      expect(oc.step1).toHaveBeenCalledOnce();
      expect(oc.step2).toHaveBeenCalledOnce();
      expect(oc.step3).not.toHaveBeenCalled();
    });

    it('should not swallow non-abort errors as idle transitions', () => {
      let workerState = 'rendering';

      try {
        throw new Error('Compilation failed');
      } catch (error) {
        workerState = isRenderAbortedError(error) ? 'idle' : 'error';
        expect((error as Error).message).toBe('Compilation failed');
      }

      expect(workerState).toBe('error');
    });
  });
});
