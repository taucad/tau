import { describe, expect, it } from 'vitest';

import { parseJobSubmitInput } from '#job-contract.js';

const digest = (character: string): string => `sha256:${character.repeat(64)}`;

const validInput = () => ({
  provider: { id: 'openfoam.case', version: '1.0.0', manifestDigest: digest('a') },
  input: {
    revision: {
      authorityId: 'workspace-host',
      workspaceId: 'workspace',
      revisionId: 'revision-1',
      treeDigest: digest('b'),
    },
    paths: ['case/controlDict'],
  },
  configuration: { value: { viscosity: '0.001' }, explicitPointers: ['/viscosity'] },
  submissionKey: 'reusable-after-lost-reply',
});

const sparseArray: unknown[] = [];
Object.defineProperty(sparseArray, 'length', { value: 2 });

describe('parseJobSubmitInput', () => {
  it('accepts the full qualified envelope and an empty literal path selection', () => {
    expect(parseJobSubmitInput(validInput())).toEqual(validInput());
    expect(parseJobSubmitInput({ ...validInput(), input: { ...validInput().input, paths: [] } }).input.paths).toEqual(
      [],
    );
  });

  it.each([
    ['a bare revision', { ...validInput(), input: { revisionId: 'revision-1', paths: [] } }],
    [
      'a missing authority',
      {
        ...validInput(),
        input: { ...validInput().input, revision: { ...validInput().input.revision, authorityId: undefined } },
      },
    ],
    ['a missing provider version', { ...validInput(), provider: { ...validInput().provider, version: undefined } }],
    ['an opaque digest', { ...validInput(), provider: { ...validInput().provider, manifestDigest: 'opaque' } }],
    ['path traversal', { ...validInput(), input: { ...validInput().input, paths: ['../secret'] } }],
    ['a glob path', { ...validInput(), input: { ...validInput().input, paths: ['case/*.dict'] } }],
    ['a drive path', { ...validInput(), input: { ...validInput().input, paths: ['C:/secret'] } }],
    ['a URL path', { ...validInput(), input: { ...validInput().input, paths: ['file:secret'] } }],
    ['a control character', { ...validInput(), input: { ...validInput().input, paths: ['case/control\u0000Dict'] } }],
    [
      'a malformed pointer',
      { ...validInput(), configuration: { ...validInput().configuration, explicitPointers: ['/bad~2escape'] } },
    ],
    [
      'an absent explicit value',
      { ...validInput(), configuration: { ...validInput().configuration, explicitPointers: ['/iterations'] } },
    ],
    ['a forged actor', { ...validInput(), actor: { role: 'admin' } }],
  ])('rejects %s', (_name, input) => {
    expect(() => parseJobSubmitInput(input)).toThrow();
  });

  it('owns mutable transport arrays and configuration objects', () => {
    const input = validInput();
    const parsed = parseJobSubmitInput(input);
    input.input.paths.push('case/fvSchemes');
    input.configuration.value.viscosity = 'changed';

    expect(parsed.input.paths).toEqual(['case/controlDict']);
    expect(parsed.configuration.value).toEqual({ viscosity: '0.001' });
  });

  it('resolves escaped object keys and array indices for explicit presence', () => {
    const input = {
      ...validInput(),
      configuration: { value: { 'a/b': [{ '~key': 1 }] }, explicitPointers: ['/a~1b/0/~0key'] },
    };
    expect(parseJobSubmitInput(input).configuration.explicitPointers).toEqual(['/a~1b/0/~0key']);
  });

  it.each([
    ['negative zero', -0],
    ['a sparse array', sparseArray],
    ['an oversized string', 'x'.repeat(1_048_577)],
    ['a symbol property', { visible: true, [Symbol('hidden')]: true }],
    [
      'a non-enumerable property',
      Object.defineProperty({ visible: true }, 'hidden', { value: true, enumerable: false }),
    ],
  ])('rejects canonical JSON adversary: %s', (_name, value) => {
    const input = validInput();
    expect(() => parseJobSubmitInput({ ...input, configuration: { value, explicitPointers: [] } })).toThrow(TypeError);
  });

  it('rejects accessors without executing them', () => {
    let reads = 0;
    const value = Object.defineProperty({}, 'danger', {
      enumerable: true,
      get() {
        reads += 1;
        return true;
      },
    });
    const input = validInput();

    expect(() => parseJobSubmitInput({ ...input, configuration: { value, explicitPointers: [] } })).toThrow(TypeError);
    expect(reads).toBe(0);
  });

  it('rejects deeply nested configuration before recursive canonicalization', () => {
    let value: Record<string, unknown> = {};
    for (let depth = 0; depth < 130; depth += 1) {
      value = { nested: value };
    }
    const input = validInput();

    expect(() => parseJobSubmitInput({ ...input, configuration: { value, explicitPointers: [] } })).toThrow(
      'structural admission limit',
    );
  });

  it('rejects aggregate configuration strings before canonicalization', () => {
    const input = validInput();
    const value = Array.from({ length: 5 }, () => 'x'.repeat(900_000));

    expect(() => parseJobSubmitInput({ ...input, configuration: { value, explicitPointers: [] } })).toThrow(
      'string admission limit',
    );
  });

  it.each([
    [
      'envelope provider',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input, 'provider', { enumerable: true, get: getter }),
    ],
    [
      'provider id',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input.provider, 'id', { enumerable: true, get: getter }),
    ],
    [
      'input paths',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input.input, 'paths', { enumerable: true, get: getter }),
    ],
    [
      'path element',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input.input.paths, 0, { enumerable: true, get: getter }),
    ],
    [
      'pointer element',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input.configuration.explicitPointers, 0, { enumerable: true, get: getter }),
    ],
    [
      'configuration value',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input.configuration, 'value', { enumerable: true, get: getter }),
    ],
    [
      'submission key',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input, 'submissionKey', { enumerable: true, get: getter }),
    ],
    [
      'signal',
      (input: ReturnType<typeof validInput>, getter: () => unknown) =>
        Object.defineProperty(input, 'signal', { enumerable: true, get: getter }),
    ],
  ])('rejects the %s accessor without executing it', (_name, install) => {
    let reads = 0;
    const input = validInput();
    install(input, () => {
      reads += 1;
      return undefined;
    });

    expect(() => parseJobSubmitInput(input)).toThrow(TypeError);
    expect(reads).toBe(0);
  });

  it.each(['/__proto__', '/safe/constructor', '/safe~1branch/prototype'])(
    'rejects dangerous decoded pointer token %s',
    (pointer) => {
      const input = validInput();
      const value = {
        ['__proto__']: true,
        safe: { constructor: true },
        'safe/branch': { prototype: true },
      };

      expect(() => parseJobSubmitInput({ ...input, configuration: { value, explicitPointers: [pointer] } })).toThrow(
        'prototype-path tokens',
      );
    },
  );
});
