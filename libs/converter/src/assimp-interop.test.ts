import { describe, expect, it } from 'vitest';
import { resolveAssimpFactory } from '#assimp-interop.js';

describe('resolveAssimpFactory', () => {
  it('should return the factory unchanged when the import is the function (bundler interop)', () => {
    const factory = async (): Promise<string> => 'module';

    expect(resolveAssimpFactory(factory)).toBe(factory);
  });

  it('should unwrap the default export when the import is a CJS namespace object (Node interop)', () => {
    const factory = async (): Promise<string> => 'module';
    const namespace = { default: factory } as unknown as typeof factory;

    expect(resolveAssimpFactory(namespace)).toBe(factory);
  });
});
