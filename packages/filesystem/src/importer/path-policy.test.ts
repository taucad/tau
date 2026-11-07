import { describe, expect, it } from 'vitest';
import { tauPathPolicy } from '#path-registry.js';
import { ImportMeter, ImportRefusedError, importLimits } from '#importer/limits.js';
import { ImportPathAdmission, normalizeImportPath, sharedLeadingFolders } from '#importer/path-policy.js';

const reasonOf = (work: () => unknown): string | undefined => {
  try {
    work();
  } catch (error) {
    return error instanceof ImportRefusedError ? error.reason : 'other';
  }
  return undefined;
};

describe('normalizeImportPath', () => {
  it('should fold backslashes, dot and empty segments, and a trailing slash', () => {
    expect(normalizeImportPath(String.raw`src\parts\.\a.ts`)).toBe('src/parts/a.ts');
    expect(normalizeImportPath('./src//b.ts/')).toBe('src/b.ts');
  });

  it.each(['../evil.sh', 'a/../../evil', '/etc/passwd', 'C:/Windows/x', 'c:evil', 'a/b\u0000c', String.raw`a\..\..\x`])(
    'should refuse %j as unsafe (zip-slip)',
    (raw) => {
      expect(reasonOf(() => normalizeImportPath(raw))).toBe('unsafePath');
    },
  );
});

describe('ImportPathAdmission', () => {
  const admission = (limits = importLimits, stripSegments = 0) =>
    new ImportPathAdmission(tauPathPolicy, new ImportMeter(limits), { stripSegments });

  it('should keep authored paths and skip what the project never versions, at any depth', () => {
    const admit = admission();

    expect(admit.admit('src/a.ts')).toEqual({ kind: 'keep', path: 'src/a.ts' });
    expect(admit.admit('.git/HEAD')).toEqual({ kind: 'skip', path: '.git/HEAD', why: 'excluded' });
    expect(admit.admit('vendor/dep/.git/config').kind).toBe('skip');
    expect(admit.admit('node_modules/x/index.js').kind).toBe('skip');
    expect(admit.admit('.tau-staging/import-x/tree/a').kind).toBe('skip');
  });

  it('should leave the manifest and identity to the commit', () => {
    const admit = admission();

    expect(admit.admit('tau.json')).toEqual({ kind: 'skip', path: 'tau.json', why: 'reserved' });
    expect(admit.admit('sub/tau.json').kind).toBe('skip');
    expect(admit.admit('.tau/project.json').kind).toBe('skip');
  });

  it('should prune a left-behind directory so a walk never enters it', () => {
    const admit = admission();

    expect(admit.prunes('.git')).toBe(true);
    expect(admit.prunes('packages/a/node_modules')).toBe(true);
    expect(admit.prunes('src')).toBe(false);
  });

  it('should refuse two paths one filesystem would merge, and a file where a folder is (I12)', () => {
    const cased = admission();
    cased.admit('Readme.md');

    expect(reasonOf(() => cased.admit('README.md'))).toBe('collision');

    const accented = admission();
    accented.admit('caf\u00E9.txt');

    expect(reasonOf(() => accented.admit('cafe\u0301.txt'))).toBe('collision');

    const nested = admission();
    nested.admit('a');

    expect(reasonOf(() => nested.admit('a/b.txt'))).toBe('collision');

    const parent = admission();
    parent.admit('a/b.txt');

    expect(reasonOf(() => parent.admit('A'))).toBe('collision');
  });

  it('should refuse a path past the byte limit and an entry past the count limit', () => {
    const limits = { ...importLimits, maximumPathBytes: 8, maximumEntries: 2 };
    const admit = admission(limits);

    expect(reasonOf(() => admit.admit('abcdefghi'))).toBe('pathTooLong');
    expect(admit.admit('ok').kind).toBe('keep');
    expect(reasonOf(() => admit.admit('ok2'))).toBe('tooManyEntries');
  });

  it('should strip the shared leading folders', () => {
    const admit = admission(importLimits, 1);

    expect(admit.admit('project/src/a.ts')).toEqual({ kind: 'keep', path: 'src/a.ts' });
  });
});

describe('sharedLeadingFolders', () => {
  it('should count the folders every path shares, never a file name', () => {
    expect(sharedLeadingFolders(['p/src/a.ts', 'p/src/b.ts'])).toBe(2);
    expect(sharedLeadingFolders(['p/src/a.ts', 'p/b.ts'])).toBe(1);
    expect(sharedLeadingFolders(['a.ts', 'p/b.ts'])).toBe(0);
    expect(sharedLeadingFolders([])).toBe(0);
  });
});

describe('ImportMeter', () => {
  it('should refuse by declared size before any decode', () => {
    const meter = new ImportMeter({ ...importLimits, maximumFileBytes: 10, maximumExpandedBytes: 15 });

    expect(
      reasonOf(() => {
        meter.declared('big', 11);
      }),
    ).toBe('fileTooLarge');

    meter.declared('a', 10);

    expect(
      reasonOf(() => {
        meter.declared('b', 6);
      }),
    ).toBe('expandedTooLarge');
  });

  it('should refuse an entry or an archive that expands past the ratio', () => {
    const entry = new ImportMeter();

    expect(
      reasonOf(() => {
        entry.declared('bomb', 50 * 1024 * 1024, 1024);
      }),
    ).toBe('ratioTooHigh');

    const small = new ImportMeter();
    small.declared('tiny', 100_000, 10);

    expect(small.declaredBytes).toBe(100_000);

    const archive = new ImportMeter();
    archive.archive(10_000);

    expect(
      reasonOf(() => {
        archive.declared('a', 2 * 1024 * 1024, 2 * 1024 * 1024);
      }),
    ).toBe('ratioTooHigh');
  });

  it('should refuse an archive past its limit', () => {
    expect(
      reasonOf(() => {
        new ImportMeter().archive(importLimits.maximumArchiveBytes + 1);
      }),
    ).toBe('archiveTooLarge');
  });
});
