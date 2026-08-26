import { describe, expect, it } from 'vitest';
import type { VirtualPathError } from '@taucad/utils/path';
import { resolveRpcProjectPath } from '#rpc/rpc-project-path.js';

describe('resolveRpcProjectPath', () => {
  it.each([
    ['', ''],
    ['.', ''],
    ['./', ''],
    ['/', ''],
    ['main.ts', 'main.ts'],
    ['./src/main.ts', 'src/main.ts'],
    ['/src/main.ts', 'src/main.ts'],
    ['src/../main.ts', 'main.ts'],
  ])('should resolve %j to the canonical project path %j', (input, expected) => {
    expect(resolveRpcProjectPath(input)).toBe(expected);
  });

  it.each([
    ['//server/share', 'INVALID_PATH'],
    ['//checks', 'INVALID_PATH'],
    ['../secret', 'PATH_OUTSIDE_ROOT'],
    ['/../../secret', 'PATH_OUTSIDE_ROOT'],
    ['C:/secret', 'INVALID_PATH'],
    [String.raw`C:\secret`, 'INVALID_PATH'],
    [String.raw`\\server\share`, 'INVALID_PATH'],
    ['file:///secret', 'INVALID_PATH'],
    ['https://example.com/file', 'INVALID_PATH'],
    ['bad\0path', 'INVALID_PATH'],
  ])('should reject %j with %s', (input, code) => {
    expect(() => resolveRpcProjectPath(input)).toThrow(
      expect.objectContaining<Partial<VirtualPathError>>({
        name: 'VirtualPathError',
        code: code as VirtualPathError['code'],
      }),
    );
  });
});
