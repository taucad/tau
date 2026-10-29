import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { EditorDocument } from '#lib/editor-document.js';
import type { EditorLanguageEnvironment } from '#lib/editor-language-environment.js';
import {
  callContext,
  definitionFor,
  hoverTextFor,
  importedHoverTextFor,
  parameterCompletions,
} from '#lib/openscad-language/openscad-codemirror.js';
import { parseOpenScad } from '#lib/openscad-language/openscad-pseudoparser.js';

describe('OpenSCAD CodeMirror language behavior', () => {
  it('finds the enclosing call through nested arguments and offers unused parameter names', () => {
    const source = 'module custom(radius=2, height=5) {}\ncustom(radius=sin(1), ';
    const context = callContext(source, source.length);
    expect(context).toEqual({ name: 'custom', argument: 1, used: ['radius'] });
    if (!context) {
      throw new Error('Expected call context');
    }
    const parsed = parseOpenScad('main.scad', source, false);
    expect(parameterCompletions(context, parsed).map((completion) => completion.label)).toEqual(['height=']);
  });

  it('does not count commas nested in calls, arrays or strings as new arguments', () => {
    const source = 'custom(radius=max(1, 2), height=[1, 2], note="a,b", ';
    expect(callContext(source, source.length)).toEqual({
      name: 'custom',
      argument: 3,
      used: ['radius', 'height', 'note'],
    });
  });

  it('offers built-in OpenSCAD parameter names', () => {
    const source = 'cube(';
    const context = callContext(source, source.length);
    expect(context?.name).toBe('cube');
    if (!context) {
      throw new Error('Expected call context');
    }
    const options = parameterCompletions(context, parseOpenScad('main.scad', source, false));
    expect(options.map((option) => option.label)).toContain('size=');
  });

  it('resolves modules from use and variables from include through content authority', async () => {
    const contentService = mock<FileContentService>();
    const environment = mock<EditorLanguageEnvironment>({ contentService });
    contentService.resolve.mockResolvedValue({
      kind: 'text',
      content: new TextEncoder().encode('module imported() {}\nsize = 5;'),
    });
    const used = new EditorDocument('models/main.scad', 'use <library.scad>\nimported();');
    expect(await definitionFor(used, environment, 'imported')).toEqual({
      uri: 'file:///models/library.scad',
      line: 1,
      column: 8,
    });
    expect(await importedHoverTextFor(used, environment, 'imported')).toEqual({ text: 'imported()', literal: true });
    const included = new EditorDocument('models/main.scad', 'include <library.scad>\ncube(size);');
    expect(await definitionFor(included, environment, 'size')).toEqual({
      uri: 'file:///models/library.scad',
      line: 2,
      column: 1,
    });
  });

  it('keeps built-in and group comment hover text', () => {
    expect(hoverTextFor('cube(1);', 'main.scad', { text: 'cube', from: 0, to: 4 })?.text).toContain('cube');
    const group = '/* [Dimensions] */';
    expect(hoverTextFor(group, 'main.scad', { text: 'Dimensions', from: 4, to: 14 })).toEqual({
      text: 'Group — Dimensions',
      literal: true,
    });
  });

  it('keeps arithmetic in local hover signatures literal', () => {
    expect(hoverTextFor('module custom(value = 2*3*4) {}', 'main.scad', { text: 'custom', from: 7, to: 13 })).toEqual({
      text: 'custom(value=2*3*4)',
      literal: true,
    });
  });
});
