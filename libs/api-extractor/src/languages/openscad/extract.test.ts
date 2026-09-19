import { describe, expect, it } from 'vitest';
import {
  crossCheckDispatch,
  loadOpenscadCorpus,
  parseBuiltins,
  readBuiltinsSource,
} from '#languages/openscad/extract.js';

const tableFixture = String.raw`
pub static BUILTINS: &[Builtin] = &[
    // ---- 3D primitives ----
    b!(
        "cube",
        module,
        "cube(size, center=false)",
        "Axis-aligned box."
    ),
    // ---- Transforms ----
    b!(
        "color",
        module,
        "color(c | \"name\", alpha=1)",
        "Recolor children for preview."
    ),
    // ---- Math functions ----
    b!("sin", function, "sin(deg)", "Sine (degrees)."),
];
`;

const evaluatorFixture = `
    fn dispatch_module(&mut self, name: &str) -> EResult<Node> {
        match name {
            "cube" => self.b_cube(args),
            "group" => Ok(Node::group(self.eval_children(children)?)),
            _ => Ok(Node::Empty),
        }
    }

    fn builtin_fn(name: &str) -> Value {
        match name {
            "sin" | "cos" => one(sin_deg),
            _ => Value::Undef,
        }
    }
`;

describe('parseBuiltins', () => {
  const builtins = parseBuiltins(tableFixture);

  it('reads rows in both macro layouts and unescapes Rust string literals', () => {
    expect(builtins.map((builtin) => builtin.name)).toEqual(['cube', 'color', 'sin']);
    expect(builtins[1]?.signature).toBe('color(c | "name", alpha=1)');
    expect(builtins[2]).toMatchObject({ isModule: false, category: 'Math functions', signature: 'sin(deg)' });
  });

  it('attributes each row to its section comment and source line', () => {
    expect(builtins[0]).toMatchObject({ category: '3D primitives', line: 4 });
  });

  it('refuses to emit an empty table', () => {
    expect(() => parseBuiltins('pub static BUILTINS: &[Builtin] = &[];')).toThrow(/macro shape changed/u);
  });
});

describe('readBuiltinsSource', () => {
  it('names the missing checkout and how to get it', () => {
    expect(() => readBuiltinsSource('/nonexistent/openrscad/')).toThrow(/optional checkout; clone it/u);
    expect(() => readBuiltinsSource('/nonexistent/openrscad/')).toThrow(/repos:clone/u);
  });
});

describe('crossCheckDispatch', () => {
  it('reports divergence in both directions without reconciling it', () => {
    expect(crossCheckDispatch(evaluatorFixture, parseBuiltins(tableFixture))).toEqual({
      tableOnly: ['color'],
      implementationOnly: ['group', 'cos'],
    });
  });
});

describe('the committed OpenSCAD corpus', () => {
  const corpus = loadOpenscadCorpus();

  it('needs no checkout and holds the whole builtins table', () => {
    expect(corpus.metadata).toMatchObject({
      language: 'openscad',
      packageName: 'openrscad',
      extractor: 'openrscad-lsp BUILTINS table',
      totalEntries: 78,
      breakdown: { module: 33, function: 35, constant: 10 },
    });
    expect(new Set(corpus.entries.map((entry) => entry.id)).size).toBe(78);
  });

  it('separates modules from functions', () => {
    const cube = corpus.entries.find((entry) => entry.name === 'cube');
    expect(cube?.kind).toBe('module');
    expect(cube?.languageSpecific).toEqual({ language: 'openscad', isModule: true });
    expect(cube?.signatures?.[0]?.parameters).toEqual([
      { name: 'size', optional: false },
      { name: 'center', optional: true, defaultValue: 'false' },
    ]);

    const sin = corpus.entries.find((entry) => entry.name === 'sin');
    expect(sin?.kind).toBe('function');
    expect(sin?.languageSpecific).toEqual({ language: 'openscad', isModule: false });
  });

  it('treats special variables as values rather than callables', () => {
    const fragments = corpus.entries.find((entry) => entry.name === '$fn');
    expect(fragments?.kind).toBe('constant');
    expect(fragments?.signatures).toBeUndefined();
  });

  it('records where each entry came from', () => {
    for (const entry of corpus.entries) {
      expect(entry.source?.file).toBe('crates/openrscad-lsp/src/builtins.rs');
      expect(entry.docs?.summary).toBeTruthy();
    }
  });
});
