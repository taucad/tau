import { describe, expect, it } from 'vitest';
import { createConverterSource } from '@taucad/converter';

describe('createConverterSource', () => {
  it('should preserve selected file bytes, runtime paths and the entry file', () => {
    const model = new Uint8Array([1, 2, 3]);
    const material = new Uint8Array([4, 5]);

    expect(
      createConverterSource(
        [
          ['models/part.obj', model],
          ['materials/part.mtl', material],
        ],
        'models/part.obj',
      ),
    ).toEqual({
      files: { 'models/part.obj': model, 'materials/part.mtl': material },
      entry: 'models/part.obj',
    });
  });

  it('should refuse duplicate runtime paths instead of silently replacing a selected file', () => {
    expect(() =>
      createConverterSource(
        [
          ['part.obj', new Uint8Array([1])],
          ['part.obj', new Uint8Array([2])],
        ],
        'part.obj',
      ),
    ).toThrow('Selected files contain duplicate runtime paths');
  });
});
