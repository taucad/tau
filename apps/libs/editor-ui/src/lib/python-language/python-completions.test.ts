import { expect, it } from 'vitest';
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { pythonKernelCompletions } from '#lib/python-language/python-completions.js';

it.each(['from build123d import Bo', 'build123d.Bo'])(
  'should offer bounded Build123d symbols for %s',
  async (document) => {
    const state = EditorState.create({ doc: document });
    const result = await pythonKernelCompletions(new CompletionContext(state, document.length, true));
    expect(result?.from).toBe(document.length - 2);
    expect(result?.options.map(({ label }) => label)).toEqual(
      expect.arrayContaining([
        'Shape',
        'Box',
        'Compound',
        'Color',
        'RevoluteJoint',
        'BallJoint',
        'Select',
        'export_step',
        'export_gltf',
      ]),
    );
  },
);

it('should distinguish SMLibPy kernel symbols from Build123d symbols', async () => {
  const document = 'from smlibpy import Bo';
  const result = await pythonKernelCompletions(
    new CompletionContext(EditorState.create({ doc: document }), document.length, true),
  );
  expect(result?.options).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'GridLocations', detail: 'smlibpy.GridLocations', type: 'class' }),
      expect.objectContaining({ label: 'loft', detail: 'smlibpy.loft', type: 'function' }),
    ]),
  );
  expect(result?.options.map(({ label }) => label)).not.toContain('BuildPart');
});

it('should keep kernel symbols out of unrelated Python expressions', async () => {
  const document = 'print(Bo)';
  expect(
    await pythonKernelCompletions(new CompletionContext(EditorState.create({ doc: document }), document.length, true)),
  ).toBeNull();
});
