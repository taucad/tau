import { describe, expect, it, vi } from 'vitest';
import { createKernelLibraryTracer, defineLibraryTracePolicy } from '#framework/kernel-library-tracing.js';
import type { RuntimeSpanTracer, SpanHandle } from '#types/runtime-tracer.types.js';

type MockTracer = RuntimeSpanTracer & {
  startSpan: ReturnType<typeof vi.fn>;
  ended: ReturnType<typeof vi.fn>;
};

function createMockTracer(): MockTracer {
  const ended = vi.fn();
  const span: SpanHandle = { end: ended };
  return {
    ended,
    startSpan: vi.fn().mockReturnValue(span),
  };
}

function createTraceAllPolicy() {
  return defineLibraryTracePolicy({
    library: 'demo',
    traceCall(context) {
      if (context.scope !== 'user-main') {
        return { type: 'ignore' };
      }

      return {
        type: 'trace',
        attributes: {
          policyScope: context.scope,
        },
      };
    },
    shouldWrapValue(context) {
      return context.scope === 'user-main';
    },
  });
}

describe('defineLibraryTracePolicy', () => {
  it('should add default span names from the library name', () => {
    const policy = defineLibraryTracePolicy({
      library: 'demo',
      traceCall: () => ({ type: 'ignore' }),
    });

    expect(policy.spanPrefix).toBe('demo.library');
    expect(policy.summarySpanName).toBe('demo.library.summary');
  });

  it('should preserve explicit span names', () => {
    const policy = defineLibraryTracePolicy({
      library: 'demo',
      spanPrefix: 'custom.calls',
      summarySpanName: 'custom.summary',
      traceCall: () => ({ type: 'ignore' }),
    });

    expect(policy.spanPrefix).toBe('custom.calls');
    expect(policy.summarySpanName).toBe('custom.summary');
  });
});

describe('createKernelLibraryTracer', () => {
  it('should return raw library behavior and emit no spans in off mode', () => {
    const library = { add: vi.fn((a: number, b: number) => a + b) };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'off',
      policy: createTraceAllPolicy(),
    });

    const result = handle.runInScope({
      scope: 'user-main',
      operation: () => handle.tracedLibrary.add(2, 3),
    });
    handle.emitSummary();

    expect(result).toBe(5);
    expect(handle.tracedLibrary).toBe(library);
    expect(tracer.startSpan).not.toHaveBeenCalled();
  });

  it('should cache proxies for repeated property access', () => {
    const library = { add: (a: number, b: number) => a + b };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    expect(handle.tracedLibrary.add).toBe(handle.tracedLibrary.add);
  });

  it('should preserve this binding for proxied methods', () => {
    const library = {
      value: 4,
      addToThis(delta: number) {
        return this.value + delta;
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    const result = handle.runInScope({
      scope: 'user-main',
      operation: () => handle.tracedLibrary.addToThis(6),
    });

    expect(result).toBe(10);
    expect(tracer.startSpan).toHaveBeenCalledWith(
      'demo.library.addToThis',
      expect.objectContaining({
        memberPath: 'demo.addToThis',
        operation: 'addToThis',
        callType: 'apply',
      }),
    );
  });

  it('should unwrap proxied arguments before invoking raw methods', () => {
    const library = {
      makeBox: vi.fn(() => ({
        cut(other: unknown) {
          return other;
        },
      })),
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    const returned = handle.runInScope({
      scope: 'user-main',
      operation: () => {
        const first = handle.tracedLibrary.makeBox();
        const second = handle.tracedLibrary.makeBox();
        return first.cut(second);
      },
    });

    expect(returned).not.toBe(library.makeBox.mock.results[1]!.value);
    expect(handle.unwrap(returned)).toBe(library.makeBox.mock.results[1]!.value);
  });

  it('should deep-unwrap arrays and plain objects for internal callers', () => {
    const library = {
      makeBox: () => ({ id: 'box' }),
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    const raw = handle.runInScope({
      scope: 'user-main',
      operation: () => handle.tracedLibrary.makeBox(),
    });
    const unwrapped = handle.unwrap([{ shape: raw }]);

    expect(unwrapped).toEqual([{ shape: { id: 'box' } }]);
    expect(unwrapped[0]!.shape).toBe(handle.unwrap(raw));
  });

  it('should wrap chainable return values', () => {
    const library = {
      makeChain() {
        return {
          step() {
            return this;
          },
        };
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    handle.runInScope({
      scope: 'user-main',
      operation: () => handle.tracedLibrary.makeChain().step(),
    });

    expect(tracer.startSpan).toHaveBeenCalledWith('demo.library.makeChain', expect.any(Object));
    expect(tracer.startSpan).toHaveBeenCalledWith('demo.library.step', expect.any(Object));
  });

  it('should end per-call spans after async calls settle', async () => {
    const library = {
      async load() {
        return { ok: true };
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    await handle.runInScope({
      scope: 'user-main',
      operation: async () => handle.tracedLibrary.load(),
    });

    expect(tracer.startSpan).toHaveBeenCalledWith('demo.library.load', expect.any(Object));
    expect(tracer.ended).toHaveBeenCalledOnce();
  });

  it('should end per-call spans and rethrow async errors', async () => {
    const library = {
      async fail() {
        throw new Error('boom');
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    await expect(
      handle.runInScope({
        scope: 'user-main',
        operation: async () => handle.tracedLibrary.fail(),
      }),
    ).rejects.toThrow('boom');

    expect(tracer.ended).toHaveBeenCalledOnce();
  });

  it('should end per-call spans and rethrow sync errors', () => {
    const library = {
      fail() {
        throw new Error('boom');
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    expect(() =>
      handle.runInScope({
        scope: 'user-main',
        operation: () => handle.tracedLibrary.fail(),
      }),
    ).toThrow('boom');
    expect(tracer.ended).toHaveBeenCalledOnce();
  });

  it('should emit aggregate summary telemetry in summary mode', () => {
    const library = {
      add: (a: number, b: number) => a + b,
      fail() {
        throw new Error('boom');
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'summary',
      policy: createTraceAllPolicy(),
    });

    handle.runInScope({
      scope: 'user-main',
      operation: () => {
        handle.tracedLibrary.add(1, 2);
        handle.tracedLibrary.add(3, 4);
        try {
          handle.tracedLibrary.fail();
        } catch {}
      },
    });
    handle.emitSummary();

    const expectedSummary: Record<string, unknown> = {
      library: 'demo',
      operations: 2,
    };
    expectedSummary['add.calls'] = 2;
    expectedSummary['fail.calls'] = 1;
    expectedSummary['fail.errors'] = 1;
    expectedSummary['total.calls'] = 3;
    expectedSummary['total.errors'] = 1;

    expect(tracer.startSpan).toHaveBeenCalledWith('demo.library.summary', expect.objectContaining(expectedSummary));
  });

  it('should not emit empty summary spans', () => {
    const library = { noop: () => undefined };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'summary',
      policy: createTraceAllPolicy(),
    });

    handle.emitSummary();

    expect(tracer.startSpan).not.toHaveBeenCalled();
  });

  it('should ignore native-like values when wrapping returns', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const library = {
      bytes() {
        return bytes;
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    const result = handle.runInScope({
      scope: 'user-main',
      operation: () => handle.tracedLibrary.bytes(),
    });

    expect(result).toBe(bytes);
  });

  it('should restore nested scopes after async operations', async () => {
    const calls: string[] = [];
    const library = {
      op() {
        calls.push('op');
      },
    };
    const tracer = createMockTracer();
    const handle = createKernelLibraryTracer({
      library,
      tracer,
      mode: 'per-call',
      policy: createTraceAllPolicy(),
    });

    await handle.runInScope({
      scope: 'user-main',
      async operation() {
        await handle.runInScope({
          scope: 'render-output',
          async operation() {
            handle.tracedLibrary.op();
          },
        });
        handle.tracedLibrary.op();
      },
    });

    expect(calls).toEqual(['op', 'op']);
    expect(tracer.startSpan).toHaveBeenCalledTimes(1);
    expect(tracer.startSpan).toHaveBeenCalledWith('demo.library.op', expect.any(Object));
  });
});
