/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { TracerService, Span } from '#tracer.service.js';

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
