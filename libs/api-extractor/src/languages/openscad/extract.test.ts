import { describe, expect, it } from 'vitest';
import {
  buildOpenscadCorpus,
  crossCheckDispatch,
  languageConstructs,
  loadOpenscadCorpus,
  parseBuiltins,
  readBuiltinsSource,
  signatureOverrides,
  verifySignatures,
} from '#languages/openscad/extract.js';
import type { ApiCorpus } from '#model/api-corpus.types.js';

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

describe('buildOpenscadCorpus', () => {
  it('refuses overrides for rows the table no longer has', () => {
    expect(() => buildOpenscadCorpus(parseBuiltins(tableFixture), { packageVersion: '0.0.0' })).toThrow(
      /overrides without a row \[sphere, cylinder/u,
    );
  });
});

describe('verifySignatures', () => {
  const bindingFixture = `
    fn dispatch_module(&mut self, name: &str) -> EResult<Node> {
        match name {
            "sphere" => builtin(self.b_sphere(args)),
            "rotate" => builtin(self.transform(args, children, TransformKind::Rotate)),
            "projection" => {
                let m = self.bind_named(&["cut"], args)?;
                Ok(Node::Projection { cut: m.get("cut") })
            }
            "render" => builtin(Ok(Node::group(self.eval_children(children)?))),
            _ => Ok(Node::Empty),
        }
    }

    fn b_sphere(&mut self, args: &[Arg]) -> EResult<Node> {
        let m = self.bind_named(&["r"], args)?;
        let d = m.get("d");
        Ok(Node::Sphere { frags: self.frag_spec(&m) })
    }

    fn transform(&mut self, args: &[Arg], kind: TransformKind) -> EResult<Node> {
        match kind {
            TransformKind::Translate => self.bind_named(&["v"], args),
            TransformKind::Rotate => self.bind_named(&["a", "v"], args),
        }
    }
`;
  const corpusOf = (signatures: Record<string, string[]>): ApiCorpus => ({
    metadata: loadOpenscadCorpus().metadata,
    entries: Object.entries(signatures).map(([name, texts]) => ({
      id: `openscad:${name}`,
      name,
      kind: 'module',
      source: { file: 'crates/openrscad-lsp/src/builtins.rs' },
      signatures: texts.map((text) => ({
        text,
        parameters: text
          .slice(text.indexOf('(') + 1, -1)
          .split(',')
          .map((part) => part.split('=').map((side) => side.trim()))
          .filter(([name]) => name !== '')
          .map(([name = '', defaultValue]) => ({
            name,
            optional: true,
            ...(defaultValue === undefined ? {} : { defaultValue }),
          })),
      })),
    })),
  });

  it('accepts names the handler binds, reads or takes through frag_spec', () => {
    expect(
      verifySignatures(
        bindingFixture,
        corpusOf({
          sphere: ['sphere(r = 1, $fn, $fa, $fs)', 'sphere(d, $fn)'],
          rotate: ['rotate(a, v)'],
          projection: ['projection(cut = false)'],
          render: ['render()'],
        }),
      ),
    ).toEqual([]);
  });

  it('names each parameter the evaluator would ignore', () => {
    expect(
      verifySignatures(
        bindingFixture,
        corpusOf({ sphere: ['sphere(r, center)'], rotate: ['rotate(a, $fn)'], render: ['render(convexity = 1)'] }),
      ),
    ).toEqual([
      'sphere: center in `sphere(r, center)`',
      'rotate: $fn in `rotate(a, $fn)`',
      'render: convexity in `render(convexity = 1)`',
    ]);
  });
});

describe('the committed OpenSCAD corpus', () => {
  const corpus = loadOpenscadCorpus();

  it('needs no checkout and holds the whole builtins table plus the language constructs', () => {
    expect(corpus.metadata).toMatchObject({
      language: 'openscad',
      packageName: 'openrscad',
      extractor: 'openrscad-lsp BUILTINS table + evaluator-verified signatures',
      totalEntries: 88,
      breakdown: { module: 40, function: 37, constant: 11 },
    });
    expect(new Set(corpus.entries.map((entry) => entry.id)).size).toBe(88);
  });

  it('is regenerated from the current signature table', () => {
    for (const [name, { signatures, remarks }] of signatureOverrides) {
      const entry = corpus.entries.find((candidate) => candidate.name === name);
      expect(entry?.source?.file, name).toBe('crates/openrscad-lsp/src/builtins.rs');
      expect(entry?.signatures?.map((signature) => signature.text)).toEqual(signatures);
      expect(entry?.docs?.remarks).toBe(remarks);
    }
    for (const construct of languageConstructs) {
      const entry = corpus.entries.find((candidate) => candidate.name === construct.name);
      expect(entry).toMatchObject({ kind: construct.kind, category: 'Language' });
    }
  });

  it('shows callable alternatives with named parameters and defaults', () => {
    const cylinder = corpus.entries.find((entry) => entry.name === 'cylinder');
    expect(cylinder?.signatures?.map((signature) => signature.text)).toContain(
      'cylinder(h = 1, d1, d2, center = false, $fn, $fa, $fs)',
    );
    expect(cylinder?.signatures?.[0]?.parameters.map((parameter) => parameter.name)).toEqual([
      'h',
      'r',
      'center',
      '$fn',
      '$fa',
      '$fs',
    ]);
  });

  it('keeps syntax templates free of fake parameters', () => {
    const forLoop = corpus.entries.find((entry) => entry.name === 'for');
    expect(forLoop?.signatures?.every((signature) => signature.parameters.length === 0)).toBe(true);
  });

  it('separates modules from functions', () => {
    const cube = corpus.entries.find((entry) => entry.name === 'cube');
    expect(cube?.kind).toBe('module');
    expect(cube?.languageSpecific).toEqual({ language: 'openscad', isModule: true });
    expect(cube?.signatures?.[0]?.parameters).toEqual([
      { name: 'size', optional: true, defaultValue: '[1, 1, 1]' },
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
      expect(entry.source?.file).toBe(
        entry.category === 'Language' ? 'crates/openrscad-syntax/src/ast.rs' : 'crates/openrscad-lsp/src/builtins.rs',
      );
      expect(entry.docs?.summary).toBeTruthy();
    }
  });
});
