import { expect, it } from 'vitest';
import { normalizeRuntimeSource, withStagedFiles } from '#client/runtime-document-source.js';

it('preserves reserved object names as exact staged file paths', () => {
  const protoKey = '__proto__';
  const source = normalizeRuntimeSource({
    files: Object.fromEntries([
      ['main.ts', 'entry'],
      ['__proto__', 'dependency'],
    ]),
    entry: 'main.ts',
  });
  expect(Object.hasOwn(source.stage ?? {}, '__proto__')).toBe(true);
  expect(new TextDecoder().decode(source.stage?.[protoKey])).toBe('dependency');
  const updated = withStagedFiles(
    source,
    Object.fromEntries([
      ['constructor', 'updated'],
      ['__proto__', 'changed'],
    ]),
  );
  expect(Object.hasOwn(updated.stage ?? {}, '__proto__')).toBe(true);
  expect(Object.hasOwn(updated.stage ?? {}, 'constructor')).toBe(true);
  expect(new TextDecoder().decode(updated.stage?.[protoKey])).toBe('changed');
});
