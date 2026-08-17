import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { VmFileSystem } from '#types.js';

/**
 * Options for creating a VM filesystem mock.
 *
 * @public
 */
export type MockFileSystemOptions = {
  /** Result for exists calls. */
  existsResult?: boolean | ((path: string) => boolean | Promise<boolean>);
  /** Result for readFile calls. */
  readFileResult?:
    | string
    | Uint8Array<ArrayBuffer>
    | ((
        path: string,
        encoding?: 'utf8',
      ) => string | Uint8Array<ArrayBuffer> | Promise<string | Uint8Array<ArrayBuffer>>);
};

/**
 * Mock functions exposed for VM filesystem assertions.
 *
 * @public
 */
export type MockFileSystemMocks = {
  readFile: Mock<(path: string, encoding?: 'utf8') => Promise<string | Uint8Array<ArrayBuffer>>>;
  exists: Mock<(path: string) => Promise<boolean>>;
  writeFile: Mock<(path: string, content: string) => Promise<void>>;
  ensureDir: Mock<(path: string) => Promise<void>>;
};

/**
 * A typed VM filesystem test double.
 *
 * @public
 */
export type MockFileSystem = VmFileSystem & {
  /** Access the underlying mock functions for setup and assertions. */
  mocks: MockFileSystemMocks;
};

/**
 * Create a typed mock VM filesystem.
 *
 * @param options - optional default mock behavior.
 * @returns a VM filesystem with observable mock methods.
 * @public
 */
export function createMockFileSystem(options?: MockFileSystemOptions): MockFileSystem {
  const existsFunction = vi.fn<(path: string) => Promise<boolean>>().mockImplementation(async (path) => {
    if (typeof options?.existsResult === 'function') {
      return options.existsResult(path);
    }

    return options?.existsResult ?? false;
  });

  const readFileFunction = vi
    .fn<(path: string, encoding?: 'utf8') => Promise<string | Uint8Array<ArrayBuffer>>>()
    .mockImplementation(async (path, encoding) => {
      if (typeof options?.readFileResult === 'function') {
        return options.readFileResult(path, encoding);
      }

      if (encoding === 'utf8' && options?.readFileResult instanceof Uint8Array) {
        return new TextDecoder().decode(options.readFileResult);
      }

      return options?.readFileResult ?? new Uint8Array(new ArrayBuffer(0));
    });

  const writeFileFunction: MockFileSystemMocks['writeFile'] = vi.fn().mockResolvedValue(undefined);
  const ensureDirectoryFunction: MockFileSystemMocks['ensureDir'] = vi.fn().mockResolvedValue(undefined);

  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return readFileFunction(path, encoding);
  }

  const mocks: MockFileSystemMocks = {
    readFile: readFileFunction,
    exists: existsFunction,
    writeFile: writeFileFunction,
    ensureDir: ensureDirectoryFunction,
  };

  return {
    readFile,
    exists: async (path) => existsFunction(path),
    writeFile: async (path, content) => writeFileFunction(path, content),
    ensureDir: async (path) => ensureDirectoryFunction(path),
    mocks,
  };
}

/**
 * Create a real Response object for fetch tests.
 *
 * @param body - response body text.
 * @param headers - optional response headers.
 * @returns a Response with the supplied body and headers.
 * @public
 */
export function createMockResponse(body: string, headers?: Record<string, string>): Response {
  return new Response(body, { headers, status: 200, statusText: 'OK' });
}
