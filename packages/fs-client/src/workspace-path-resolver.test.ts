import { describe, it, expect } from 'vitest';
import {
  WorkspacePathEscapeError,
  WorkspacePathResolver,
  WorkspaceScopeViolationError,
} from '#workspace-path-resolver.js';

const projectRoot = '/projects/abc';

describe('WorkspacePathResolver.toAbsoluteWorkspacePath', () => {
  it('should map root aliases to the normalized workspace root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    const expected = '/projects/abc';
    expect(paths.toAbsoluteWorkspacePath('')).toBe(expected);
    expect(paths.toAbsoluteWorkspacePath('.')).toBe(expected);
    expect(paths.toAbsoluteWorkspacePath('./')).toBe(expected);
    expect(paths.toAbsoluteWorkspacePath('/')).toBe(expected);
  });

  it('should map the workspace root path with or without trailing slash to the root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toAbsoluteWorkspacePath('/projects/abc')).toBe('/projects/abc');
    expect(paths.toAbsoluteWorkspacePath('/projects/abc/')).toBe('/projects/abc');
  });

  it('should resolve simple and dot-prefixed segments under the root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toAbsoluteWorkspacePath('src')).toBe('/projects/abc/src');
    expect(paths.toAbsoluteWorkspacePath('src/a.ts')).toBe('/projects/abc/src/a.ts');
    expect(paths.toAbsoluteWorkspacePath('./src')).toBe('/projects/abc/src');
    expect(paths.toAbsoluteWorkspacePath('.tau/cache')).toBe('/projects/abc/.tau/cache');
  });

  it('should treat a single leading-slash segment as workspace-root-relative', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toAbsoluteWorkspacePath('/src')).toBe('/projects/abc/src');
  });

  it('should preserve absolute paths already under the workspace', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toAbsoluteWorkspacePath('/projects/abc/src')).toBe('/projects/abc/src');
  });

  it('should throw when a multi-segment absolute path is outside the workspace', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(() => paths.toAbsoluteWorkspacePath('/projects/other/deep')).toThrow(WorkspacePathEscapeError);
    try {
      paths.toAbsoluteWorkspacePath('/projects/other/deep');
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('WorkspacePathEscapeError');
    }
  });

  it('should throw when path segments escape above the workspace root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(() => paths.toAbsoluteWorkspacePath('../foo')).toThrow(WorkspacePathEscapeError);
    expect(() => paths.toAbsoluteWorkspacePath('lib/../../etc')).toThrow(WorkspacePathEscapeError);
  });

  it('should normalize a trailing-slash root before resolving children', () => {
    const paths = new WorkspacePathResolver('/project/');
    expect(paths.toAbsoluteWorkspacePath('src')).toBe('/project/src');
    expect(paths.toAbsoluteWorkspacePath('.')).toBe('/project');
  });
});

describe('WorkspacePathResolver', () => {
  it('normalizes a trailing-slash root and still resolves children', () => {
    const paths = new WorkspacePathResolver('/project/');
    expect(paths.rootPrefix).toBe('/project/');
    expect(paths.toRelativePath('/project/a.ts')).toBe('a.ts');
  });

  it('maps the root directory itself to an empty relative path', () => {
    const paths = new WorkspacePathResolver('/project');
    expect(paths.toRelativePath('/project')).toBe('');
    expect(paths.toRelativePath('/project/')).toBe('');
  });

  it('returns undefined for paths outside the project root', () => {
    const paths = new WorkspacePathResolver('/project');
    expect(paths.toRelativePath('/other/file.ts')).toBeUndefined();
  });

  it('computes parentOf for nested paths and root-level files', () => {
    const paths = new WorkspacePathResolver('/project');
    expect(paths.parentOf('lib/sub/a.ts')).toBe('lib/sub');
    expect(paths.parentOf('a.ts')).toBe('');
  });

  it('reset swaps the root for subsequent resolution', () => {
    const paths = new WorkspacePathResolver('/project-a');
    expect(paths.toRelativePath('/project-a/x.ts')).toBe('x.ts');
    paths.reset('/project-b');
    expect(paths.toRelativePath('/project-a/x.ts')).toBeUndefined();
    expect(paths.toRelativePath('/project-b/x.ts')).toBe('x.ts');
  });

  it('joins toAbsolutePath using the current root', () => {
    const paths = new WorkspacePathResolver('/foo');
    expect(paths.toAbsolutePath('bar/baz.ts')).toBe('/foo/bar/baz.ts');
  });

  it('routes bundled typings under /node_modules to the global mount, not the project root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toAbsolutePath('node_modules/replicad/index.d.ts')).toBe('/node_modules/replicad/index.d.ts');
    expect(paths.toAbsolutePath('main.ts')).toBe('/projects/abc/main.ts');
    expect(paths.toRelativePath('/node_modules/replicad/index.d.ts')).toBe('node_modules/replicad/index.d.ts');
    expect(paths.toRelativePath('/projects/abc/main.ts')).toBe('main.ts');
  });
});

describe('WorkspacePathResolver global node_modules', () => {
  it('maps global /node_modules absolute paths via toRelativePath', () => {
    const paths = new WorkspacePathResolver('/projects/xyz');
    expect(paths.toRelativePath('/node_modules/pkg/index.d.ts')).toBe('node_modules/pkg/index.d.ts');
    expect(paths.toRelativePath('/node_modules')).toBe('node_modules');
  });

  it('resolves node_modules segments in toAbsoluteWorkspacePath', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toAbsoluteWorkspacePath('node_modules/replicad/index.d.ts')).toBe('/node_modules/replicad/index.d.ts');
    expect(paths.toAbsoluteWorkspacePath('/node_modules/replicad/index.d.ts')).toBe(
      '/node_modules/replicad/index.d.ts',
    );
  });
});

describe('WorkspacePathResolver.toWorkspaceRelativeKey', () => {
  it('normalizes relative inputs to themselves under a project root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toWorkspaceRelativeKey('write', 'main.ts')).toBe('main.ts');
    expect(paths.toWorkspaceRelativeKey('write', 'lib/util.ts')).toBe('lib/util.ts');
  });

  it('normalizes absolute-but-in-scope inputs to their workspace-relative form', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toWorkspaceRelativeKey('writeFiles', '/projects/abc/main.ts')).toBe('main.ts');
    expect(paths.toWorkspaceRelativeKey('writeFiles', '/projects/abc/lib/util.ts')).toBe('lib/util.ts');
  });

  it('throws WorkspaceScopeViolationError for absolute multi-segment paths foreign to root "/"', () => {
    const paths = new WorkspacePathResolver('/');
    expect(() => paths.toWorkspaceRelativeKey('writeFiles', '/projects/abc/main.ts')).toThrow(
      WorkspaceScopeViolationError,
    );
    try {
      paths.toWorkspaceRelativeKey('writeFiles', '/projects/abc/main.ts');
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceScopeViolationError);
      const violation = error as WorkspaceScopeViolationError;
      expect(violation.method).toBe('writeFiles');
      expect(violation.input).toBe('/projects/abc/main.ts');
      expect(violation.name).toBe('WorkspaceScopeViolationError');
    }
  });

  it('throws WorkspaceScopeViolationError for absolute paths foreign to a project root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(() => paths.toWorkspaceRelativeKey('write', '/projects/other/main.ts')).toThrow(
      WorkspaceScopeViolationError,
    );
  });

  it('throws WorkspaceScopeViolationError when ".." traversal escapes above root', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(() => paths.toWorkspaceRelativeKey('write', '../sibling.ts')).toThrow(WorkspaceScopeViolationError);
  });

  it('returns single-segment relative form for root-relative keys at root "/"', () => {
    const paths = new WorkspacePathResolver('/');
    expect(paths.toWorkspaceRelativeKey('write', 'a.ts')).toBe('a.ts');
    expect(paths.toWorkspaceRelativeKey('write', '/a.ts')).toBe('a.ts');
  });

  it('returns empty string for the workspace root itself', () => {
    const paths = new WorkspacePathResolver(projectRoot);
    expect(paths.toWorkspaceRelativeKey('write', '')).toBe('');
    expect(paths.toWorkspaceRelativeKey('write', '/')).toBe('');
    expect(paths.toWorkspaceRelativeKey('write', '.')).toBe('');
  });
});
