/**
 * Type-level tests for {@link StringKeyedObject} and bridge function signatures.
 *
 * Verifies that generic constraints accept both plain objects and class
 * instances without requiring `as never` or `as unknown as T` casts.
 *
 * These tests are statically analysed by the TypeScript compiler via
 * vitest --typecheck and are never executed at runtime.
 */

import { assertType, describe, expectTypeOf, it } from 'vitest';
import type { Port } from '@taucad/rpc';

import type { BridgePort, BridgeServerHandle } from '#filesystem/index.js';
import type { StringKeyedObject } from '#types/bridge.types.js';
import { createBridgeServer } from '@taucad/rpc/bridge';

// =============================================================================
// StringKeyedObject constraint
// =============================================================================

describe('StringKeyedObject', () => {
  it('exposes filesystem bridge handles without exposing RPC values', () => {
    expectTypeOf<BridgePort>().toMatchObjectType<{ port: MessagePort; dispose(): void }>();
    expectTypeOf<BridgeServerHandle>().toMatchObjectType<{
      emit(event: string, data: unknown): void;
      dispose(): void;
    }>();
  });

  it('should accept plain objects', () => {
    expectTypeOf<{ foo: string; bar: number }>().toExtend<StringKeyedObject>();
  });

  it('should accept Record<string, unknown>', () => {
    expectTypeOf<Record<string, unknown>>().toExtend<StringKeyedObject>();
  });

  it('should accept class instances', () => {
    class MyService {
      public greet(): string {
        return 'hello';
      }
    }

    expectTypeOf<MyService>().toExtend<StringKeyedObject>();
  });

  it('should accept interfaces', () => {
    // oxlint-disable-next-line typescript/consistent-type-definitions -- type testing
    interface MyHandlers {
      read(path: string): Promise<Uint8Array<ArrayBuffer>>;
      write(path: string, data: Uint8Array<ArrayBuffer>): Promise<void>;
    }

    expectTypeOf<MyHandlers>().toExtend<StringKeyedObject>();
  });

  it('should accept types', () => {
    type MyHandlers = {
      read(path: string): Promise<Uint8Array<ArrayBuffer>>;
      write(path: string, data: Uint8Array<ArrayBuffer>): Promise<void>;
    };

    expectTypeOf<MyHandlers>().toExtend<StringKeyedObject>();
  });

  it('should reject string', () => {
    expectTypeOf<string>().not.toExtend<StringKeyedObject>();
  });

  it('should reject number', () => {
    expectTypeOf<number>().not.toExtend<StringKeyedObject>();
  });

  it('should reject boolean', () => {
    expectTypeOf<boolean>().not.toExtend<StringKeyedObject>();
  });

  it('should reject undefined', () => {
    expectTypeOf<undefined>().not.toExtend<StringKeyedObject>();
  });
});

// =============================================================================
// createBridgeServer — constraint compatibility
// =============================================================================

describe('createBridgeServer', () => {
  it('should accept a plain object handler', () => {
    const handlers = {
      async read(_path: string): Promise<Uint8Array<ArrayBuffer>> {
        return new Uint8Array();
      },
    };

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
    assertType(createBridgeServer(handlers, {} as Port<unknown>));
  });

  it('should accept a class instance handler', () => {
    class FileService {
      public async read(_path: string): Promise<Uint8Array<ArrayBuffer>> {
        return new Uint8Array();
      }

      public async write(_path: string, _data: Uint8Array<ArrayBuffer>): Promise<void> {
        // No-op
      }
    }

    const service = new FileService();

    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
    assertType(createBridgeServer(service, {} as Port<unknown>));
  });

  it('should reject primitives', () => {
    // @ts-expect-error -- string is not a StringKeyedObject
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
    void createBridgeServer('hello', {} as Port<unknown>);

    // @ts-expect-error -- number is not a StringKeyedObject
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
    void createBridgeServer(42, {} as Port<unknown>);
  });
});
