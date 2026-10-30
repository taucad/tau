/**
 * @vitest-environment node
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  indexKclProgram,
  kclCallAt,
  kclExportedBinding,
  kclOccurrenceAt,
  kclOutline,
  kclRelatedOccurrences,
} from '#lib/kcl-language/kcl-bindings.js';
import type { KclIndex } from '#lib/kcl-language/kcl-bindings.js';

let parse: (code: string) => unknown;

beforeAll(async () => {
  const kcl = await import('@taucad/kcl-wasm-lib');
  const wasm = await fs.promises.readFile(fileURLToPath(import.meta.resolve('@taucad/kcl-wasm-lib/kcl.wasm')));
  // eslint-disable-next-line @typescript-eslint/naming-convention -- wasm-bindgen generated API
  await kcl.default({ module_or_path: await WebAssembly.compile(new Uint8Array(wasm)) });
  parse = (code) => (kcl.parse_wasm(code) as [unknown, unknown])[0];
}, 30_000);

function index(code: string): KclIndex {
  return indexKclProgram(parse(code));
}

/** The text of each occurrence related to the `nth` match of `word`, as `text@offset`. */
function related(code: string, word: string, nth = 0): string[] {
  let offset = -1;
  for (let count = 0; count <= nth; count++) {
    offset = code.indexOf(word, offset + 1);
  }
  const built = index(code);
  const target = kclOccurrenceAt(built, offset);
  return target
    ? kclRelatedOccurrences(built, target).map(
        (occurrence) => `${code.slice(occurrence.from, occurrence.to)}@${occurrence.from}`,
      )
    : [];
}

const source = [
  'width = 10',
  'fn box(@size, depth?: number(mm) = 2) {',
  '  width = size * depth',
  '  return width',
  '}',
  'part = box(width, depth = width)',
  '  |> extrude(length = width, tagEnd = $top)',
  'other = extrude(part, length = 1)',
  'edge = part.top + top',
].join('\n');

describe('indexKclProgram', () => {
  it('separates a shadowing local from the top-level variable of the same name', () => {
    const outer = related(source, 'width');
    expect(outer).toHaveLength(4);
    expect(outer.every((entry) => entry.startsWith('width@'))).toBe(true);
    expect(outer).not.toContain(`width@${source.indexOf('  width = size') + 2}`);
    const inner = related(source, '  width = size');
    expect(inner).toEqual([]);
    const local = related(source, 'width', 1);
    expect(local).toHaveLength(2);
  });

  it('resolves call labels to the parameters of a local function', () => {
    const depth = related(source, 'depth');
    expect(depth).toEqual([
      `depth@${source.indexOf('depth')}`,
      `depth@${source.indexOf('depth', source.indexOf('size *'))}`,
      `depth@${source.indexOf('depth = width')}`,
    ]);
  });

  it('groups free names such as standard library functions by name', () => {
    expect(related(source, 'extrude')).toHaveLength(2);
  });

  it('declares tags without their sigil and skips member property names', () => {
    const tags = related(source, 'top');
    expect(tags).toEqual([`top@${source.indexOf('$top') + 1}`, `top@${source.lastIndexOf('top')}`]);
  });

  it('marks exported top-level declarations and import aliases', () => {
    const code = 'import a, b as c from "lib.kcl"\nexport fn shape() { return a + c }\nlocal = 1';
    const built = index(code);
    expect(kclExportedBinding(built, 'shape')?.kind).toBe('function');
    expect(kclExportedBinding(built, 'local')).toBeUndefined();
    const alias = kclOccurrenceAt(built, code.indexOf(' c ') + 1);
    expect(alias?.binding).toMatchObject({ kind: 'import', importedName: 'b', importPath: 'lib.kcl' });
    expect(kclRelatedOccurrences(built, alias!)).toHaveLength(2);
    expect(kclOccurrenceAt(built, code.indexOf('b as'))?.importedFrom).toBe('lib.kcl');
  });

  it('finds the innermost call and its arguments', () => {
    const built = index(source);
    const call = kclCallAt(built, source.indexOf('depth = width') + 2);
    expect(call?.callee.name).toBe('box');
    expect(call?.callee.binding?.signature?.map((parameter) => parameter.name)).toEqual(['size', 'depth']);
    expect(call?.unlabeled).toEqual({ from: source.indexOf('box(width') + 4, to: source.indexOf('box(width') + 9 });
    expect(call?.arguments.map((argument) => argument.label)).toEqual(['depth']);
  });
});

describe('kclOutline', () => {
  it('nests declarations inside the function that declares them', () => {
    const outline = kclOutline(index(source));
    const shape = (symbols: ReturnType<typeof kclOutline>): unknown =>
      symbols.map((symbol) => [symbol.binding.name, symbol.binding.kind, shape([...symbol.children])]);
    expect(shape(outline)).toEqual([
      ['width', 'variable', []],
      ['box', 'function', [['width', 'variable', []]]],
      ['part', 'variable', []],
      ['other', 'variable', []],
      ['edge', 'variable', []],
    ]);
    expect(outline[1]?.binding.extent).toEqual({ from: source.indexOf('fn box'), to: source.indexOf('}') + 1 });
  });
});
