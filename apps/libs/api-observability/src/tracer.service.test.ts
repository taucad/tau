/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { AttributeValue, Attributes, SpanOptions, Tracer } from '@opentelemetry/api';
import { TracerService, Span, startGenAiChatSpan } from '#tracer.service.js';

describe('TracerService', () => {
  let service: TracerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TracerService],
    }).compile();

    service = module.get(TracerService);
  });

  describe('injectTraceContext', () => {
    it('should return an object (may be empty when no active span)', () => {
      const carrier = service.injectTraceContext();
      expect(carrier).toBeTypeOf('object');
    });
  });
});

describe('@Span decorator', () => {
  it('should wrap async methods and preserve return value', async () => {
    class TestService {
      @Span('test.operation')
      public async doWork(): Promise<string> {
        return 'done';
      }
    }

    const instance = new TestService();
    const result = await instance.doWork();
    expect(result).toBe('done');
  });

  it('should preserve sync method return type (not a Promise)', () => {
    class TestService {
      @Span()
      public doSyncWork(): number {
        return 123;
      }
    }

    const instance = new TestService();
    const result = instance.doSyncWork();
    expect(result).toBe(123);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('should wrap async methods returning a Promise', async () => {
    class TestService {
      @Span()
      public async doAsyncWork(): Promise<string> {
        return 'async-result';
      }
    }

    const instance = new TestService();
    const result = instance.doAsyncWork();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe('async-result');
  });

  it('should propagate errors from async decorated methods', async () => {
    class TestService {
      @Span('failing.operation')
      public async failingWork(): Promise<never> {
        throw new Error('decorated error');
      }
    }

    const instance = new TestService();
    await expect(instance.failingWork()).rejects.toThrow('decorated error');
  });

  it('should propagate errors from sync decorated methods', () => {
    class TestService {
      @Span('sync.fail')
      public failingSync(): never {
        throw new Error('sync error');
      }
    }

    const instance = new TestService();
    expect(() => instance.failingSync()).toThrow('sync error');
  });

  it('should use ClassName.methodName as default span name', () => {
    class MyService {
      @Span()
      public myMethod(): string {
        return 'works';
      }
    }

    const instance = new MyService();
    expect(instance.myMethod()).toBe('works');
  });
});

describe('startGenAiChatSpan', () => {
  type Started = { name: string; options: SpanOptions | undefined };
  type Recorded = { attributes: Attributes; status: unknown; ended: number };
  const recordingTracer = (): { tracer: Tracer; started: Started[]; span: Recorded } => {
    const started: Started[] = [];
    const span: Recorded = { attributes: {}, status: undefined, ended: 0 };
    const recorded = {
      setAttributes: (attributes: Attributes) => {
        Object.assign(span.attributes, attributes);
        return recorded;
      },
      setAttribute: (key: string, value: AttributeValue) => {
        span.attributes[key] = value;
        return recorded;
      },
      setStatus: (status: unknown) => {
        span.status = status;
        return recorded;
      },
      end: () => {
        span.ended += 1;
      },
    };
    const tracer = {
      startSpan: (name: string, options?: SpanOptions) => {
        started.push({ name, options });
        return recorded;
      },
    } as unknown as Tracer;
    return { tracer, started, span };
  };

  it('should open a client chat span with the GenAI request attributes and end it with usage', () => {
    const { tracer, started, span } = recordingTracer();

    const chat = startGenAiChatSpan(
      { providerName: 'anthropic', requestModel: 'fixture-model', maxTokens: 64 },
      tracer,
    );
    chat.succeed({ inputTokens: 30, outputTokens: 12, cacheReadTokens: 20, cacheWriteTokens: 6, reasoningTokens: 0 });
    chat.fail('late');

    expect(started).toEqual([
      {
        name: 'chat fixture-model',
        options: {
          kind: SpanKind.CLIENT,
          attributes: {
            'gen_ai.operation.name': 'chat',
            'gen_ai.provider.name': 'anthropic',
            'gen_ai.request.model': 'fixture-model',
            'gen_ai.request.max_tokens': 64,
          },
        },
      },
    ]);
    expect(span).toEqual({
      attributes: {
        'gen_ai.usage.input_tokens': 30,
        'gen_ai.usage.output_tokens': 12,
        'gen_ai.usage.cache_read_input_tokens': 20,
        'gen_ai.usage.cache_creation_input_tokens': 6,
        'gen_ai.usage.reasoning_tokens': 0,
      },
      status: { code: SpanStatusCode.OK },
      ended: 1,
    });
  });

  it('should end a failed call once with its error type', () => {
    const { tracer, span } = recordingTracer();

    const chat = startGenAiChatSpan({ providerName: 'openai', requestModel: 'fixture-model' }, tracer);
    chat.fail('503');
    chat.succeed({ inputTokens: 1, outputTokens: 1 });

    expect(span).toEqual({ attributes: { 'error.type': '503' }, status: { code: SpanStatusCode.ERROR }, ended: 1 });
  });
});
