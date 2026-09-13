import { describe, it, expect, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { createHoverProvider } from '#lib/openscad-language/openscad-hover.js';
import { codeLanguages } from '@taucad/types/constants';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('OpenSCAD hover provider', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }

    await drainMonacoPostTestWork();
  });

  it('returns hover markdown for built-in module cube', async () => {
    const provider = createHoverProvider(monaco);
    const uri = monaco.Uri.parse('file:///hover/main.scad');
    const model = monaco.editor.createModel('cube([1,1,1]);\n', codeLanguages.openscad, uri);
    const cubeIndex = model.getValue().indexOf('cube');
    const position = model.getPositionAt(cubeIndex + 1);

    const hover = await provider.provideHover(model, position, createTestCancellationToken());

    expect(hover).not.toBeNull();
    expect(hover?.contents.length).toBeGreaterThan(0);
  });
});
