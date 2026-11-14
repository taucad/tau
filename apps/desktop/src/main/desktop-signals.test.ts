/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import { describe, expect, it } from 'vitest';
import {
  appLoadFailureSignal,
  gitSubcommandOf,
  redactGitErrorLine,
  rendererGoneSignal,
  rendererHangSignal,
  rendererHangThreshold,
  revisionEngineFailureSignal,
  scrubFailureText,
  updaterFailureSignal,
} from '#main/desktop-signals.js';

describe('rendererGoneSignal', () => {
  it('should report the exits the SDK only leaves breadcrumbs for', () => {
    expect(rendererGoneSignal({ reason: 'oom', exitCode: 9 })).toStrictEqual({
      message: 'Renderer gone: oom',
      level: 'error',
      fingerprint: ['desktop-renderer-gone', 'oom'],
      tags: { reason: 'oom', exit_code: '9' },
    });
    expect(rendererGoneSignal({ reason: 'killed' })?.tags).toStrictEqual({ reason: 'killed' });
  });

  it('should leave clean exits and the reasons the SDK reports itself', () => {
    for (const reason of ['clean-exit', 'crashed', 'abnormal-exit', 'launch-failed', 'integrity-failure']) {
      expect(rendererGoneSignal({ reason })).toBeUndefined();
    }
    expect(rendererGoneSignal(undefined)).toBeUndefined();
  });
});

describe('rendererHangSignal', () => {
  it('should report a long hang with its duration and ignore a short one', () => {
    expect(rendererHangSignal(rendererHangThreshold)).toBeUndefined();
    expect(rendererHangSignal(12_400)).toStrictEqual({
      message: 'Renderer unresponsive',
      level: 'warning',
      fingerprint: ['desktop-renderer-hang'],
      tags: { hang_seconds: '12' },
      contexts: { hang: { milliseconds: 12_400 } },
    });
  });
});

describe('appLoadFailureSignal', () => {
  it('should report a failed main-frame load by error code and scheme, without the URL', () => {
    const signal = appLoadFailureSignal({
      errorCode: -6,
      errorDescription: 'ERR_FILE_NOT_FOUND',
      url: 'app://tau/w/home/secret',
      isMainFrame: true,
    });
    expect(signal).toStrictEqual({
      message: 'App document failed to load: ERR_FILE_NOT_FOUND',
      level: 'error',
      fingerprint: ['desktop-app-load-failed', '-6'],
      tags: { error_code: '-6', url_scheme: 'app' },
    });
    expect(JSON.stringify(signal)).not.toContain('secret');
  });

  it('should ignore subframes and aborted loads', () => {
    expect(appLoadFailureSignal({ errorCode: -6, errorDescription: 'x', url: 'app://tau/', isMainFrame: false })).toBe(
      undefined,
    );
    expect(
      appLoadFailureSignal({ errorCode: -3, errorDescription: 'ERR_ABORTED', url: 'app://tau/', isMainFrame: true }),
    ).toBeUndefined();
  });
});

describe('updaterFailureSignal', () => {
  const update = { channel: 'production', version: '1.2.3' };

  it('should report check, download and restart failures by stage', () => {
    expect(updaterFailureSignal('updater.error', { message: 'net::ERR_TIMED_OUT' }, update)).toStrictEqual({
      message: 'Update failed (check-or-download): net::ERR_TIMED_OUT',
      level: 'error',
      fingerprint: ['desktop-update-failed', 'check-or-download'],
      tags: { update_stage: 'check-or-download', update_channel: 'production', update_from_version: '1.2.3' },
    });
    expect(updaterFailureSignal('updater.restart-failed', {}, update)?.message).toBe(
      'Update failed (restart): unknown',
    );
  });

  it('should ignore every other updater line', () => {
    expect(updaterFailureSignal('updater.release-failed', { message: 'x' }, update)).toBeUndefined();
    expect(updaterFailureSignal('updater.checking', undefined, update)).toBeUndefined();
  });
});

describe('scrubFailureText', () => {
  it('should replace home directories and cap the length', () => {
    expect(scrubFailureText("EACCES: open '/Users/dana/Library/Caches/tau/update.zip'")).toBe(
      "EACCES: open '~/Library/Caches/tau/update.zip'",
    );
    expect(scrubFailureText(String.raw`EPERM C:\Users\dana\AppData\Local\tau`)).toBe(
      String.raw`EPERM ~\AppData\Local\tau`,
    );
    expect(scrubFailureText('/home/dana/.cache/tau')).toBe('~/.cache/tau');
    expect(scrubFailureText(String.raw`EPERM C:\Users\John Smith\AppData\Local\tau`)).toBe(
      String.raw`EPERM ~\AppData\Local\tau`,
    );
    expect(scrubFailureText('x'.repeat(500))).toHaveLength(200);
  });
});

describe('redactGitErrorLine', () => {
  it('should read the first fatal or error line, after git-lfs progress', () => {
    expect(
      redactGitErrorLine(
        'Downloading parts/bracket.step (5.0 MB)\nError downloading object: bracket (a1b2c3d): Smudge error\nfatal: later',
      ),
    ).toBe('error: git-lfs smudge failed');
  });

  it('should fall back to the first line, and say nothing when git wrote nothing', () => {
    expect(redactGitErrorLine('\n  hint: see the docs  \nmore')).toBe('unclassified');
    expect(redactGitErrorLine('')).toBe('');
  });

  it('should name the failure with a fixed sentence and none of the paths in it', () => {
    expect(redactGitErrorLine('fatal: /Users/someone/Library/Tau/checkouts/p1 already exists')).toBe(
      'fatal: path already exists',
    );
    expect(redactGitErrorLine(String.raw`fatal: C:\Users\someone\project is not a git repository`)).toBe(
      'fatal: not a git repository',
    );
    expect(redactGitErrorLine("fatal: 'feature-x' is already checked out at '/tmp/wt'")).toBe(
      'fatal: branch is already checked out in another worktree',
    );
    expect(redactGitErrorLine('error: bracket.step: smudge filter lfs failed')).toBe('error: git-lfs smudge failed');
    expect(redactGitErrorLine('fatal: Could not resolve host: api.tau.new')).toBe('fatal: could not resolve host');
  });

  it('should never forward an unquoted name, even one made of git words or digits', () => {
    expect(redactGitErrorLine('error: unable to create file Customer Plans: Permission denied')).toBe(
      'error: unable to create a file: permission denied',
    );
    expect(redactGitErrorLine('error: unable to create file work tree: Permission denied')).toBe(
      'error: unable to create a file: permission denied',
    );
    expect(redactGitErrorLine('fatal: invalid reference: 2026 plans')).toBe('fatal: reference not found');
    expect(redactGitErrorLine('fatal: Quarterly Review 7 went wrong')).toBe('fatal: unclassified');
  });

  it('should never forward a remote, credential, header or id', () => {
    expect(redactGitErrorLine('fatal: repository https://user:secret@git.example.com/o/r.git/ not found')).toBe(
      'fatal: remote repository not found',
    );
    expect(redactGitErrorLine('fatal: could not read from git@github.com:owner/repo.git')).toBe(
      'fatal: remote could not be reached',
    );
    expect(redactGitErrorLine('error: batch request failed. Authorization: Bearer abc.def.ghi')).toBe(
      'error: git-lfs batch request failed',
    );
    expect(redactGitErrorLine('error: object 4b825dc642cb6eb9a060e54bf8d69288fbee4904 missing')).toBe(
      'error: unclassified',
    );
    expect(redactGitErrorLine('fatal: bad object 4b825dc642cb6eb9a060e54bf8d69288fbee4904')).toBe(
      'fatal: object missing or corrupt',
    );
  });

  it('should read a line with control characters', () => {
    expect(redactGitErrorLine('fatal: not a git\u0007 repository')).toBe('fatal: unclassified');
    expect(redactGitErrorLine('fatal: Unable to create /p/.git/index.lock: File exists.')).toBe(
      'fatal: unable to write a file',
    );
  });
});

describe('gitSubcommandOf', () => {
  it('should read the subcommand from each sentence the engine writes', () => {
    expect(gitSubcommandOf('Native Git failed worktree.')).toBe('worktree');
    expect(gitSubcommandOf('Native Git stopped fetch: deadline.')).toBe('fetch');
    expect(gitSubcommandOf('Native Git could not start lfs.')).toBe('lfs');
    expect(gitSubcommandOf('Native Git failed the update-ref operation.')).toBe('update-ref');
  });

  it('should not read a subcommand from any other sentence', () => {
    expect(gitSubcommandOf('Native Git failed -c.')).toBe('unknown');
    expect(gitSubcommandOf('The remote could not be reached.')).toBe('unknown');
  });
});

describe('revisionEngineFailureSignal', () => {
  const worktreeFailure = (path: string): Record<string, unknown> => ({
    type: 'revision-engine-failed',
    code: 'ENGINE_FAILED',
    message: 'Native Git failed worktree.',
    detail: `Downloading big.step (5 MB)\nfatal: ${path} already exists\nhint: more`,
  });

  it('should report a forced worktree failure with its code, subcommand and redacted line', () => {
    expect(revisionEngineFailureSignal(worktreeFailure('/home/someone/.tau/checkouts/p1/b1'))).toEqual({
      message: 'Revision engine ENGINE_FAILED (git worktree): fatal: path already exists',
      level: 'error',
      fingerprint: ['desktop-revision-engine-failed', 'ENGINE_FAILED', 'worktree'],
      tags: { error_code: 'ENGINE_FAILED', git_subcommand: 'worktree' },
      contexts: {
        revision_engine: { code: 'ENGINE_FAILED', subcommand: 'worktree', git_error: 'fatal: path already exists' },
      },
    });
  });

  it('should group the same failure on different projects as one issue that names none of them', () => {
    const first = revisionEngineFailureSignal(worktreeFailure('/home/one/a'));
    const second = revisionEngineFailureSignal(worktreeFailure('/Users/two/b'));

    expect(first?.fingerprint).toEqual(second?.fingerprint);
    expect(first?.message).toBe(second?.message);
    expect(JSON.stringify(first)).not.toMatch(/one|two|big|home|Users/u);
  });

  it('should report an engine that could not start, without a detail', () => {
    expect(
      revisionEngineFailureSignal({
        type: 'revision-engine-failed',
        code: 'ENGINE_UNAVAILABLE',
        message: 'Native Git could not start status.',
      }),
    ).toEqual({
      message: 'Revision engine ENGINE_UNAVAILABLE (git status)',
      level: 'error',
      fingerprint: ['desktop-revision-engine-failed', 'ENGINE_UNAVAILABLE', 'status'],
      tags: { error_code: 'ENGINE_UNAVAILABLE', git_subcommand: 'status' },
      contexts: { revision_engine: { code: 'ENGINE_UNAVAILABLE', subcommand: 'status' } },
    });
  });

  it('should ignore any other frame or code', () => {
    expect(revisionEngineFailureSignal({ type: 'permission-answered' })).toBeUndefined();
    expect(revisionEngineFailureSignal({ type: 'revision-engine-failed', code: 'REMOTE_NOT_FOUND' })).toBeUndefined();
    expect(revisionEngineFailureSignal(undefined)).toBeUndefined();
  });
});
