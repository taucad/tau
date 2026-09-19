import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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

describeWithPython('extractPythonApi(build123d)', () => {
  const corpus: ApiCorpus = extractPythonApi('build123d');
  const entries = [...flattenEntries(corpus)];
  const find = (name: string, from: readonly ApiEntry[] = corpus.entries): ApiEntry => {
    const entry = from.find((candidate) => candidate.name === name);
    expect(entry, `missing entry ${name}`).toBeDefined();
    return entry!;
  };

  it('reports CPython provenance and the installed package version', () => {
    expect(corpus.metadata.language).toBe('python');
    expect(corpus.metadata.packageName).toBe('build123d');
    expect(corpus.metadata.packageVersion).toMatch(/^\d+\.\d+/u);
    expect(corpus.metadata.extractor).toMatch(/^CPython 3\.\d+\.\d+ inspect\+ast$/u);
  });

  it('indexes the public top level without flattening class methods into it', () => {
    // R16: top-level names are the index tier; methods live under their class.
    expect(corpus.entries.length).toBeGreaterThan(400);
    expect(corpus.entries.some((entry) => entry.kind === 'method')).toBe(false);
    expect(entries.length).toBeGreaterThan(corpus.entries.length * 5);
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
    expect(overloaded.length).toBeGreaterThan(50);
  });

  it('survives OCP pybind11 classes that expose no inspectable signature', () => {
    const shape = find('TopoDS_Shape');
    expect(shape.kind).toBe('class');
    expect(shape.members?.length ?? 0).toBeGreaterThan(0);
    const move = find('Move', shape.members ?? []);
    expect(move.signatures?.[0]?.text).toContain('thePosition');
  });

  it('assigns every entry a unique id', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
