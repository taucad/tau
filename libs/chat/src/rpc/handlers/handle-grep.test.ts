import { describe, it, expect, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { MockProxy } from 'vitest-mock-extended';
import type { RpcDirectoryEntry, RpcFileStat, RpcFileSystem } from '#rpc/rpc-dependencies.js';
import { rpcClientErrorCode } from '#schemas/rpc.schema.js';
import { handleGrep } from '#rpc/handlers/handle-grep.js';

const textStat = (size: number, lineCount = 1): RpcFileStat => ({
  size,
  isDirectory: false,
  contentKind: 'text',
  lineCount,
  createdAt: '2026-05-12T00:00:00.000Z',
  modifiedAt: '2026-05-12T00:00:00.000Z',
});

const textEntry = (name: string, size: number, lineCount = 1): RpcDirectoryEntry => ({
  name,
  type: 'file',
  size,
  contentKind: 'text',
  lineCount,
});

/** A host with no index: the optional index calls are absent until a test gives them. */
const hostFileSystem = (): MockProxy<RpcFileSystem> => {
  const fileSystem = mock<RpcFileSystem>();
  fileSystem.indexedFiles = undefined;
  fileSystem.contentKinds = undefined;
  return fileSystem;
};

describe('handleGrep', () => {
  /* W3 a3: grep reads every file it finds, so its walk asks the listing for no content facts. */
  it('should walk the project without asking the listing for content facts', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockResolvedValue([{ name: 'app.ts', type: 'file', size: 20 }]);
    fileSystem.readFile.mockResolvedValue('const marker = 1;');

    const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

    expect(fileSystem.readdir).toHaveBeenCalledWith('', { contentFacts: false });
    expect(result).toMatchObject({ success: true, totalMatches: 1 });
  });

  it('should return matches when pattern matches file contents in a directory walk', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.stat.mockResolvedValue({
      size: 0,
      isDirectory: true,
      createdAt: '2026-05-12T00:00:00.000Z',
      modifiedAt: '2026-05-12T00:00:00.000Z',
    });
    fileSystem.readdir.mockResolvedValue([textEntry('app.ts', 20, 1)]);
    fileSystem.readFile.mockResolvedValue("const x = 'hello world'\n");

    const result = await handleGrep({ pattern: 'hello', path: '' }, fileSystem);

    expect(result).toMatchObject({
      success: true,
      totalMatches: 1,
      truncated: false,
      appliedOffset: 0,
    });
    expect(result.success && result.matches).toEqual([expect.objectContaining({ file: 'app.ts', line: 1 })]);
    expect(result.success && result.matches[0]?.content).toContain('hello');
  });

  it('should recursively read the canonical project root', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.stat.mockResolvedValue({
      size: 0,
      isDirectory: true,
      createdAt: '2026-05-12T00:00:00.000Z',
      modifiedAt: '2026-05-12T00:00:00.000Z',
    });
    fileSystem.readdir.mockImplementation(async (path) => {
      if (path === '') {
        return [{ name: 'checks', type: 'dir', size: 0 }];
      }
      if (path === 'checks') {
        return [textEntry('existing.geospec.ts', 24, 1)];
      }
      throw new Error(`Unexpected non-canonical project path: ${path}`);
    });
    fileSystem.readFile.mockImplementation(async (path) => {
      if (path === 'checks/existing.geospec.ts') {
        return "it('should retain this check')";
      }
      throw new Error(`Unexpected non-canonical project path: ${path}`);
    });

    const result = await handleGrep({ pattern: 'retain', path: '' }, fileSystem);

    expect(result).toEqual({
      success: true,
      matches: [
        {
          file: 'checks/existing.geospec.ts',
          line: 1,
          content: "it('should retain this check')",
        },
      ],
      totalMatches: 1,
      truncated: false,
      appliedHeadLimit: 50,
      appliedOffset: 0,
    });
  });

  it('should skip explicit-only system resources unless the search is scoped to skills', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockImplementation(async (path) => {
      if (path === '') {
        return [
          {
            name: '.agents',
            type: 'dir',
            size: 0,
            traverseOnImplicitSearch: false,
          },
          textEntry('main.ts', 12),
        ];
      }
      if (path === '.agents/skills/cad-demo') {
        return [textEntry('api-index.md', 20, 2)];
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    fileSystem.stat.mockResolvedValue({
      size: 0,
      isDirectory: true,
      createdAt: '1970-01-01T00:00:00.000Z',
      modifiedAt: '1970-01-01T00:00:00.000Z',
    });
    fileSystem.readFile.mockImplementation(async (path) => (path === 'main.ts' ? 'project needle' : 'system needle'));

    const unscoped = await handleGrep({ pattern: 'needle', path: '' }, fileSystem);
    expect(unscoped.success && unscoped.matches.map(({ file }) => file)).toEqual(['main.ts']);
    expect(fileSystem.readFile).toHaveBeenCalledTimes(1);

    fileSystem.readFile.mockClear();
    const scoped = await handleGrep({ pattern: 'needle', path: '.agents/skills/cad-demo' }, fileSystem);
    expect(scoped.success && scoped.matches.map(({ file }) => file)).toEqual(['.agents/skills/cad-demo/api-index.md']);
    expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
  });

  it.each(['.', './', '/'] as const)('should reject noncanonical root alias %j', async (path) => {
    const fileSystem = hostFileSystem();

    const result = await handleGrep({ pattern: 'retain', path }, fileSystem);

    expect(result).toMatchObject({
      success: false,
      errorCode: rpcClientErrorCode.validationError,
    });
    expect(fileSystem.stat).not.toHaveBeenCalled();
  });

  it('should reject paths outside the project before filesystem access', async () => {
    const fileSystem = hostFileSystem();

    const result = await handleGrep({ pattern: 'x', path: '../secret' }, fileSystem);

    expect(result).toMatchObject({
      success: false,
      errorCode: rpcClientErrorCode.validationError,
    });
    expect(fileSystem.stat).not.toHaveBeenCalled();
    expect(fileSystem.readdir).not.toHaveBeenCalled();
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  it('should return FILE_NOT_FOUND when the path stat fails with ENOENT', async () => {
    const fileSystem = hostFileSystem();
    const error = new Error('ENOENT: no such file');
    (error as NodeJS.ErrnoException).code = 'ENOENT';
    fileSystem.stat.mockRejectedValue(error);

    const result = await handleGrep({ pattern: 'foo', path: 'missing-dir' }, fileSystem);

    expect(result).toMatchObject({
      success: false,
      errorCode: rpcClientErrorCode.fileNotFound,
    });
  });

  // ===========================================================================
  // Phase 0 contracts — see docs/research/tool-result-offloading-and-context-prevention.md
  //
  // The transcript at Downloads/involute_gear_profiles_2026-05-12T07-18.md (lines
  // 1015, 1030, 1405) shows three back-to-back `grep` calls with `path` set to a
  // FILE (`node_modules/libcascade/index.d.ts`). Each crashed with
  // `[Error: Grep search failed]` because `collectFilePaths` calls `readdir` on
  // what is actually a regular file. The model recovered with three large
  // `read_file` calls instead, leaking ~34 KB of OCCT type bindings into the
  // prompt cache.
  //
  // Phase 0 fix: detect file-vs-directory via `stat` and either restrict the
  // walk to that single file, or return a clean ValidationError directing the
  // model to retry with `path: parentDir` + `glob: 'fileName'`.
  // ===========================================================================
  describe('Phase 0 — file-as-path handling', () => {
    it('should search a single file directly when `path` points to a regular file (no readdir)', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(30, 3));
      fileSystem.readFile.mockResolvedValue('alpha\nfoo bar\ngamma');

      const result = await handleGrep({ pattern: 'foo', path: 'src/app.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 1,
      });
      expect(result.success && result.matches[0]).toEqual(
        expect.objectContaining({
          file: 'src/app.ts',
          line: 2,
          content: 'foo bar',
        }),
      );
      expect(fileSystem.readdir).not.toHaveBeenCalled();
    });

    it('should return FILE_NOT_FOUND when `path` does not exist', async () => {
      const fileSystem = hostFileSystem();
      const enoent = new Error('ENOENT: no such file');
      (enoent as NodeJS.ErrnoException).code = 'ENOENT';
      fileSystem.stat.mockRejectedValue(enoent);

      const result = await handleGrep({ pattern: 'foo', path: 'does/not/exist.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: false,
        errorCode: rpcClientErrorCode.fileNotFound,
      });
      expect(!result.success && result.message).toContain('does/not/exist.ts');
    });
  });

  describe('Phase 0 — server-side caps', () => {
    it('should default headLimit to 50 matches when omitted on the wire', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(200_000, 1000));
      const lines = Array.from({ length: 1000 }, (_, lineIndex) => `match line ${lineIndex}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));

      const result = await handleGrep({ pattern: 'match', path: 'big.ts' }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 1000,
        truncated: true,
        appliedHeadLimit: 50,
        appliedOffset: 0,
      });
      expect(result.success ? result.matches.length : 0).toBe(50);
    });

    it('should honour an explicit headLimit override up to 1000', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(200_000, 800));
      const lines = Array.from({ length: 800 }, (_, lineIndex) => `match line ${lineIndex}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));

      const result = await handleGrep({ pattern: 'match', path: 'big.ts', headLimit: 500 }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 800,
        truncated: true,
        appliedHeadLimit: 500,
      });
      expect(result.success ? result.matches.length : 0).toBe(500);
    });

    it('should paginate via offset (skip the first N matches before applying headLimit)', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(200_000, 100));
      const lines = Array.from({ length: 100 }, (_, lineIndex) => `match line ${lineIndex}`);
      fileSystem.readFile.mockResolvedValue(lines.join('\n'));

      const result = await handleGrep({ pattern: 'match', path: 'big.ts', headLimit: 5, offset: 10 }, fileSystem);

      expect(result).toMatchObject({
        success: true,
        totalMatches: 100,
        appliedHeadLimit: 5,
        appliedOffset: 10,
      });
      expect(result.success && result.matches[0]?.content).toBe('match line 10');
      expect(result.success && result.matches.at(-1)?.content).toBe('match line 14');
    });

    it('should keep the first 500 characters of long matching lines while preserving file/line', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(5000, 3));
      const longLine = `${'a'.repeat(2000)}foo${'b'.repeat(3000)}`;
      fileSystem.readFile.mockResolvedValue(`short line\n${longLine}\nanother`);

      const result = await handleGrep({ pattern: 'foo', path: 'big.ts' }, fileSystem);

      expect(result.success && result.matches[0]).toEqual({
        file: 'big.ts',
        line: 2,
        // CL6 adopts head truncation so the model retains useful match context.
        content: longLine.slice(0, 500),
      });
    });
  });

  it('should let a recursive glob match files under dot-directories such as .agents/skills', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.stat.mockResolvedValue({
      size: 0,
      isDirectory: true,
      createdAt: '1970-01-01T00:00:00.000Z',
      modifiedAt: '1970-01-01T00:00:00.000Z',
    });
    fileSystem.readdir.mockImplementation(async (path) => {
      if (path === '.agents/skills/cad-picogk') {
        return [textEntry('api-index.md', 20), textEntry('SKILL.ts', 20)];
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    fileSystem.readFile.mockResolvedValue('Voxels needle');

    const result = await handleGrep(
      { pattern: 'needle', path: '.agents/skills/cad-picogk', glob: '**/*.md' },
      fileSystem,
    );

    expect(result.success && result.matches.map(({ file }) => file)).toEqual([
      '.agents/skills/cad-picogk/api-index.md',
    ]);
  });

  describe('context lines', () => {
    const kcl = '// Leading doc.\nfn box(\n  width: number,\n\n  depth: number,\n)\n';

    it('should omit before/after when context is not requested', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(kcl.length, 6));
      fileSystem.readFile.mockResolvedValue(kcl);

      const result = await handleGrep({ pattern: '^fn box', path: 'box.kcl' }, fileSystem);

      expect(result.success && result.matches).toEqual([{ file: 'box.kcl', line: 2, content: 'fn box(' }]);
    });

    it('should return surrounding lines, including blank ones, clipped at file edges', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue(textStat(kcl.length, 6));
      fileSystem.readFile.mockResolvedValue(kcl);

      const result = await handleGrep({ pattern: '^fn box', path: 'box.kcl', context: 4 }, fileSystem);

      expect(result.success && result.matches).toEqual([
        {
          file: 'box.kcl',
          line: 2,
          content: 'fn box(',
          before: ['// Leading doc.'],
          // The trailing newline does not add a phantom empty line.
          after: ['  width: number,', '', '  depth: number,', ')'],
        },
      ]);
    });

    it('should cap context lines at 500 characters', async () => {
      const fileSystem = hostFileSystem();
      const longLine = 'x'.repeat(2000);
      fileSystem.stat.mockResolvedValue(textStat(3000, 2));
      fileSystem.readFile.mockResolvedValue(`needle\n${longLine}`);

      const result = await handleGrep({ pattern: 'needle', path: 'big.ts', context: 1 }, fileSystem);

      expect(result.success && result.matches[0]?.after).toEqual([longLine.slice(0, 500)]);
    });

    it('should bound context to 0-20 lines at the schema layer', async () => {
      const { grepInputSchema } = await import('#schemas/tools/grep.tool.schema.js');

      expect(grepInputSchema.safeParse({ pattern: 'foo', context: 20 }).success).toBe(true);
      expect(grepInputSchema.safeParse({ pattern: 'foo', context: 21 }).success).toBe(false);
      expect(grepInputSchema.safeParse({ pattern: 'foo', context: -1 }).success).toBe(false);
    });
  });

  it('should reject headLimit > 1000 via schema validation', async () => {
    const { grepInputSchema } = await import('#schemas/tools/grep.tool.schema.js');

    expect(grepInputSchema.safeParse({ pattern: 'foo', headLimit: 1001 }).success).toBe(false);
  });

  /* Slice (a): a pending file was not searched, so it is named, never reported as having no matches. */
  it('should name a pending file as not searched, and keep an unreadable file silent', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockResolvedValue([
      textEntry('a.ts', 20),
      { name: 'part.step', type: 'file', size: 130 },
      textEntry('broken.ts', 20),
    ]);
    fileSystem.readFile.mockImplementation(async (path) => {
      if (path === 'a.ts') {
        return 'const marker = 1;';
      }
      if (path === 'part.step') {
        throw Object.assign(new Error('The large object of part.step is not on this device yet.'), {
          code: 'PENDING',
        });
      }
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    });

    const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

    expect(result).toMatchObject({ success: true, totalMatches: 1, pendingFiles: ['part.step'] });
    expect(result.success && result.matches).toEqual([expect.objectContaining({ file: 'a.ts', line: 1 })]);
  });

  /* A grep during a cold open asks the index first: a pending file is named at once, its object never fetched. */
  it('should name the files the index holds as pending without reading them', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockResolvedValue([textEntry('a.ts', 20), { name: 'part.step', type: 'file', size: 130 }]);
    const pendingPaths = vi.fn<NonNullable<RpcFileSystem['pendingPaths']>>(async () => ['part.step']);
    fileSystem.pendingPaths = pendingPaths;
    fileSystem.readFile.mockResolvedValue('const marker = 1;');

    const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

    expect(pendingPaths).toHaveBeenCalledWith(['a.ts', 'part.step']);
    expect(fileSystem.readFile).toHaveBeenCalledTimes(1);
    expect(fileSystem.readFile).toHaveBeenCalledWith('a.ts');
    expect(result).toMatchObject({ success: true, totalMatches: 1, pendingFiles: ['part.step'] });
  });

  it('should fail without reading a file when the index cannot say which files are pending', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockResolvedValue([textEntry('a.ts', 20), { name: 'part.step', type: 'file', size: 130 }]);
    fileSystem.pendingPaths = async () => {
      throw new Error('The project index could not open.');
    };
    fileSystem.readFile.mockResolvedValue('const marker = 1;');

    const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

    expect(result.success).toBe(false);
    expect(fileSystem.readFile).not.toHaveBeenCalled();
  });

  /* A relayed host that predates the call cannot say either: its reads answer `PENDING`, so the grep reads. */
  it('should read every file when the host cannot answer which are pending', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockResolvedValue([textEntry('a.ts', 20), { name: 'part.step', type: 'file', size: 130 }]);
    fileSystem.pendingPaths = async () => {
      throw Object.assign(new Error('This workspace bridge cannot say which files are pending.'), {
        code: 'PENDING_PATHS_UNSUPPORTED',
      });
    };
    fileSystem.readFile.mockImplementation(async (path) => {
      if (path === 'part.step') {
        throw Object.assign(new Error('The large object of part.step is not on this device yet.'), { code: 'PENDING' });
      }
      return 'const marker = 1;';
    });

    const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

    expect(result).toMatchObject({ success: true, totalMatches: 1, pendingFiles: ['part.step'] });
  });

  it('should read at most 16 files at once, keeping the walk order', async () => {
    const fileSystem = hostFileSystem();
    const names = Array.from({ length: 40 }, (_, index) => `f${String(index).padStart(2, '0')}.ts`);
    fileSystem.readdir.mockResolvedValue(names.map((name) => textEntry(name, 20)));
    fileSystem.pendingPaths = async () => [];
    let inFlight = 0;
    let most = 0;
    fileSystem.readFile.mockImplementation(async (path) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, path.endsWith('0.ts') ? 5 : 1);
      });
      inFlight -= 1;
      return `marker in ${path}`;
    });

    const result = await handleGrep({ pattern: 'marker', path: '', headLimit: 100 }, fileSystem);

    expect(most).toBe(16);
    expect(result.success && result.matches.map(({ file }) => file)).toStrictEqual(names);
  });

  it('should carry no pendingFiles when every file was searched', async () => {
    const fileSystem = hostFileSystem();
    fileSystem.readdir.mockResolvedValue([textEntry('a.ts', 20)]);
    fileSystem.readFile.mockResolvedValue('nothing here');

    const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

    expect(result).toMatchObject({ success: true, totalMatches: 0 });
    expect(result.success && 'pendingFiles' in result).toBe(false);
  });

  describe('over the Project Index (D13)', () => {
    it('should search the index rows with no walk and leave binaries and oversized files unread', async () => {
      const fileSystem = hostFileSystem();
      const indexedFiles = vi.fn<NonNullable<RpcFileSystem['indexedFiles']>>(async () => [
        { path: 'main.ts', size: 20, contentKind: 'text', lineCount: 1 },
        { path: 'models/part.step', size: 4096, contentKind: 'binary' },
        { path: 'dist/bundle.js', size: 5 * 1024 * 1024, contentKind: 'text' },
        { path: 'src/new.ts', size: 30 },
        { path: 'src/blob.bin', size: 900 },
      ]);
      fileSystem.indexedFiles = indexedFiles;
      const contentKinds = vi.fn<NonNullable<RpcFileSystem['contentKinds']>>(
        async () =>
          new Map([
            ['src/new.ts', 'text'],
            ['src/blob.bin', 'binary'],
          ]),
      );
      fileSystem.contentKinds = contentKinds;
      fileSystem.readFile.mockImplementation(async (path) => `marker in ${path}\n`);

      const result = await handleGrep({ pattern: 'marker', path: '' }, fileSystem);

      expect(fileSystem.readdir).not.toHaveBeenCalled();
      expect(contentKinds).toHaveBeenCalledWith(['src/new.ts', 'src/blob.bin']);
      expect(fileSystem.readFile.mock.calls.map(([path]) => path)).toStrictEqual(['main.ts', 'src/new.ts']);
      expect(result.success && result.matches.map(({ file }) => file)).toStrictEqual(['main.ts', 'src/new.ts']);
      expect(result).toMatchObject({ oversizedFiles: ['dist/bundle.js'] });
    });

    it('should filter the index rows by the glob before asking for kinds', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue({
        size: 0,
        isDirectory: true,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const indexedFiles = vi.fn<NonNullable<RpcFileSystem['indexedFiles']>>(async () => [
        { path: 'src/a.ts', size: 10 },
        { path: 'src/b.md', size: 10 },
      ]);
      fileSystem.indexedFiles = indexedFiles;
      const contentKinds = vi.fn<NonNullable<RpcFileSystem['contentKinds']>>(async () => new Map());
      fileSystem.contentKinds = contentKinds;
      fileSystem.readFile.mockResolvedValue('marker');

      await handleGrep({ pattern: 'marker', path: 'src', glob: '*.ts' }, fileSystem);

      expect(indexedFiles).toHaveBeenCalledWith('src');
      expect(contentKinds).toHaveBeenCalledWith(['src/a.ts']);
      expect(fileSystem.readFile.mock.calls.map(([path]) => path)).toStrictEqual(['src/a.ts']);
    });

    it('should walk a directory the index cannot answer for', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue({
        size: 0,
        isDirectory: true,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const indexedFiles = vi.fn<NonNullable<RpcFileSystem['indexedFiles']>>(async () => undefined);
      fileSystem.indexedFiles = indexedFiles;
      fileSystem.readdir.mockResolvedValue([textEntry('index.d.ts', 20)]);
      fileSystem.readFile.mockResolvedValue('marker');

      const result = await handleGrep({ pattern: 'marker', path: 'node_modules' }, fileSystem);

      expect(fileSystem.readdir).toHaveBeenCalledWith('node_modules', { contentFacts: false });
      expect(result.success && result.matches.map(({ file }) => file)).toStrictEqual(['node_modules/index.d.ts']);
    });

    it('should leave binaries and oversized files unread on a walk too, and name the oversized ones', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue({
        size: 0,
        isDirectory: true,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      fileSystem.indexedFiles = vi.fn<NonNullable<RpcFileSystem['indexedFiles']>>(async () => undefined);
      const contentKinds = vi.fn<NonNullable<RpcFileSystem['contentKinds']>>(
        async () => new Map([['node_modules/dep/addon.node', 'binary']]),
      );
      fileSystem.contentKinds = contentKinds;
      fileSystem.readdir.mockResolvedValue([
        textEntry('index.d.ts', 20),
        { name: 'bundle.js', type: 'file', size: 5 * 1024 * 1024, contentKind: 'text' },
        { name: 'icon.png', type: 'file', size: 300, contentKind: 'binary' },
        { name: 'addon.node', type: 'file', size: 900 },
      ]);
      fileSystem.readFile.mockResolvedValue('marker');

      const result = await handleGrep({ pattern: 'marker', path: 'node_modules/dep' }, fileSystem);

      expect(contentKinds).toHaveBeenCalledWith(['node_modules/dep/addon.node']);
      expect(fileSystem.readFile.mock.calls.map(([path]) => path)).toStrictEqual(['node_modules/dep/index.d.ts']);
      expect(result).toMatchObject({ success: true, oversizedFiles: ['node_modules/dep/bundle.js'] });
    });

    it('should walk an explicit skills scope, whose composed skills no index holds', async () => {
      const fileSystem = hostFileSystem();
      fileSystem.stat.mockResolvedValue({
        size: 0,
        isDirectory: true,
        createdAt: '2026-05-12T00:00:00.000Z',
        modifiedAt: '2026-05-12T00:00:00.000Z',
      });
      const indexedFiles = vi.fn<NonNullable<RpcFileSystem['indexedFiles']>>(async () => []);
      fileSystem.indexedFiles = indexedFiles;
      fileSystem.readdir.mockResolvedValue([textEntry('SKILL.md', 20)]);
      fileSystem.readFile.mockResolvedValue('marker');

      await handleGrep({ pattern: 'marker', path: '.agents/skills' }, fileSystem);

      expect(indexedFiles).not.toHaveBeenCalled();
      expect(fileSystem.readdir).toHaveBeenCalledWith('.agents/skills', { contentFacts: false });
    });
  });
});
