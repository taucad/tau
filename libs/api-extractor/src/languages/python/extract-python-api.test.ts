import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { extractPythonApi, resolvePythonExecutable } from '#languages/python/extract-python-api.js';
import { flattenEntries } from '#model/api-corpus.js';
import type { ApiCorpus, ApiEntry } from '#model/api-corpus.types.js';

/**
 * The vendored interpreter only exists after `desktop:prepare-build123d-python`
 * and only for supported targets, so the live extraction is conditional. The
 * absence path is asserted unconditionally, because that is the message a
 * developer without the runtime actually sees.
 */
const available = ((): boolean => {
  try {
    return existsSync(resolvePythonExecutable());
  } catch {
    return false;
  }
})();

const describeWithPython = available ? describe : describe.skip;

describe('resolvePythonExecutable', () => {
  it('names the preparation target when the runtime is absent', () => {
    if (available) {
      expect(resolvePythonExecutable()).toMatch(/apps\/desktop\/resources\/python\/.+python3?(\.exe)?$/u);
      return;
    }
    expect(() => resolvePythonExecutable()).toThrow(/desktop:prepare-build123d-python/u);
  });
});

describeWithPython('signature text', () => {
  /** Render synthetic callables through the extractor's own `_signature`. */
  const render = (definitions: string): string[] => {
    const program = [
      'import importlib.util, json, sys',
      'spec = importlib.util.spec_from_file_location("extractor", sys.argv[1])',
      'extractor = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(extractor)',
      definitions,
      'print(json.dumps([extractor._signature(f, f.__name__, {})["text"] for f in functions]))',
    ].join('\n');
    const script = join(import.meta.dirname, 'extract-python-api.py');
    return JSON.parse(
      execFileSync(resolvePythonExecutable(), ['-I', '-c', program, script], { encoding: 'utf8' }),
    ) as string[];
  };

  it('marks positional-only and keyword-only parameters so the text stays valid Python', () => {
    const texts = render(
      [
        'def a(x, /, y, *, z=1): ...',
        'def b(self, x, *, y): ...',
        'def c(x, *rest, y): ...',
        'def d(x, /): ...',
        'functions = [a, b, c, d]',
      ].join('\n'),
    );
    expect(texts).toEqual(['a(x, /, y, *, z = 1)', 'b(x, *, y)', 'c(x, *rest, y)', 'd(x, /)']);
  });
});

describeWithPython('extractPythonApi(build123d)', () => {
  // Extract in a hook: a skipped describe still runs its body, which would throw without the runtime.
  let corpus: ApiCorpus;
  let entries: ApiEntry[];
  // A cold `import build123d` (OCP) on a CI runner outlasts Vitest's 10 s hook default.
  beforeAll(() => {
    corpus = extractPythonApi('build123d');
    entries = [...flattenEntries(corpus)];
  }, 120_000);
  const find = (name: string, from?: readonly ApiEntry[]): ApiEntry => {
    const entry = (from ?? corpus.entries).find((candidate) => candidate.name === name);
    expect(entry, `missing entry ${name}`).toBeDefined();
    return entry!;
  };

  it('reports CPython provenance and the installed package version', () => {
    expect(corpus.metadata.language).toBe('python');
    expect(corpus.metadata.packageName).toBe('build123d');
    expect(corpus.metadata.packageVersion).toMatch(/^\d+\.\d+/u);
    expect(corpus.metadata.extractor).toMatch(/^CPython 3\.\d+\.\d+ inspect\+ast$/u);
  });

  it('indexes `__all__` plus package-owned bases, without star-imported OCP names', () => {
    // R16: top-level names are the index tier; methods live under their class.
    expect(corpus.entries.length).toBeGreaterThan(150);
    expect(corpus.entries.length).toBeLessThan(400);
    expect(corpus.entries.some((entry) => entry.kind === 'method')).toBe(false);
    expect(entries.length).toBeGreaterThan(corpus.entries.length * 4);
    for (const name of ['TopoDS_Shape', 'gp_Pnt', 'BRepBuilderAPI_MakeEdge', 'datetime', 'Path']) {
      expect(corpus.entries.some((entry) => entry.name === name)).toBe(false);
    }
  });

  it('drops modules a star import leaked into the namespace', () => {
    for (const name of ['os', 'sys', 'json', 'math']) {
      expect(corpus.entries.some((entry) => entry.name === name)).toBe(false);
    }
  });

  it('serializes defaults as source text, not repr', () => {
    // `repr(Align.CENTER)` is `<Align.CENTER>`, which is not valid Python.
    const constructor = find('__init__', find('Box').members ?? []);
    const align = constructor.signatures?.[0]?.parameters.find((parameter) => parameter.name === 'align');
    expect(align?.defaultValue).toBe('(Align.CENTER, Align.CENTER, Align.CENTER)');
    expect(align?.type?.text).toBe('Align | tuple[Align, Align, Align]');
    for (const entry of entries) {
      for (const signature of entry.signatures ?? []) {
        for (const parameter of signature.parameters) {
          expect(parameter.defaultValue ?? '').not.toMatch(/^</u);
        }
      }
    }
  });

  it('parses Google-style Args into per-parameter descriptions', () => {
    const extrude = find('extrude');
    const amount = extrude.signatures?.[0]?.parameters.find((parameter) => parameter.name === 'amount');
    expect(amount?.description).toContain('distance to extrude');
    expect(extrude.docs?.summary).toBeTruthy();
    expect(extrude.docs?.summary).not.toContain('Args:');
  });

  it('records parameter kinds and package-relative sources', () => {
    const box = find('Box');
    expect(box.source?.file).toBe('build123d/objects_part.py');
    expect(box.source?.file.startsWith('/')).toBe(false);
    const constructor = find('__init__', box.members ?? []);
    expect(constructor.languageSpecific).toMatchObject({
      language: 'python',
      parameterKinds: { align: 'positional-or-keyword' },
    });
  });

  it('recovers overloads as multiple signatures on one entry', () => {
    const overloaded = entries.filter((entry) => (entry.signatures?.length ?? 0) > 1);
    expect(overloaded.length).toBeGreaterThan(30);
  });

  it('renders keyword-only markers in the signature text', () => {
    const texts = (find('__init__', find('Axis').members ?? []).signatures ?? []).map((signature) => signature.text);
    expect(texts).toContain('Axis(origin: VectorLike, *, end_point: VectorLike) -> None');
    expect(texts).toContain('Axis(origin: VectorLike, direction: VectorLike) -> None');
  });

  it('documents inherited members once, on the package-owned base the class line names', () => {
    expect(find('Solid').signatures?.[0]?.text).toBe('class Solid(Mixin3D)');
    expect(find('Mixin3D').signatures?.[0]?.text).toBe('class Mixin3D(Shape)');
    const mixin = find('Mixin3D').members ?? [];
    for (const name of ['fillet', 'chamfer', 'hollow', 'offset_3d']) {
      find(name, mixin);
    }
    find('position_at', find('Mixin1D').members ?? []);
    expect((find('Solid').members ?? []).some((member) => member.name === 'fillet')).toBe(false);
  });

  it('keeps context-manager and operator dunders as authoring syntax', () => {
    const builder = find('Builder').members ?? [];
    expect(find('__enter__', builder).signatures?.[0]?.text).toContain('# with Builder(...) as builder:');
    find('__exit__', builder);
    // `Builder + x` is a guard that raises, declared with an unused `_other` operand.
    expect(builder.some((member) => member.name === '__add__')).toBe(false);
    const shapeList = find('ShapeList').members ?? [];
    expect(find('__gt__', shapeList).signatures?.[0]?.text).toMatch(/# ShapeList > sort_by$/u);
    expect(find('__or__', shapeList).signatures?.[0]?.text).toMatch(/# ShapeList \| filter_by$/u);
    expect(find('__rmul__', find('Shape').members ?? []).signatures?.[0]?.text).toMatch(/# other \* Shape$/u);
    expect(find('__mul__', find('Location').members ?? []).signatures?.[0]?.text).toMatch(/# Location \* other$/u);
  });

  it('lists package metaclass properties as class attributes', () => {
    expect(find('X', find('Axis').members ?? []).kind).toBe('property');
    expect(find('XY', find('Plane').members ?? []).kind).toBe('property');
  });

  it('assigns every entry a unique id', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
