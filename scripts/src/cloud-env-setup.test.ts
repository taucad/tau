/* eslint-disable @typescript-eslint/naming-convention -- Subprocess environment keys must match the cloud host variables. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = readFileSync(resolve(import.meta.dirname, '../cloud-env-setup.sh'), 'utf8');
const temporaryDirectories: string[] = [];

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'tau cloud bootstrap-'));
  temporaryDirectories.push(root);
  const workspace = join(root, 'workspace');
  const userHome = join(root, 'user');
  const cache = join(root, 'cache');
  for (const directory of [workspace, userHome, cache]) {
    mkdirSync(directory, { recursive: true });
  }
  const environment = {
    ...process.env,
    TAU_CLOUD_AGENT: '',
    CLAUDE_CODE_REMOTE: '',
    CODEX_CI: '',
    CODEX_ENVIRONMENT_ID: '',
    TAU_CLOUD_WORKSPACE: workspace,
    TAU_CLOUD_USER_HOME: userHome,
    XDG_CACHE_HOME: cache,
  };
  const run = (overrides: Record<string, string> = {}) =>
    spawnSync('bash', ['--noprofile', '--norc'], {
      input: script,
      encoding: 'utf8',
      env: { ...environment, ...overrides },
    });
  const checkout = (name: string, exitCode = 0) => {
    const directory = join(workspace, name);
    mkdirSync(join(directory, 'scripts'), { recursive: true });
    const initialized = spawnSync('git', ['init', '-q', directory]);
    expect(initialized.status).toBe(0);
    writeFileSync(join(directory, 'package.json'), '{"packageManager":"pnpm@11.7.0"}\n');
    writeFileSync(
      join(directory, 'scripts/agent-env.sh'),
      '#!/usr/bin/env bash\nif [[ $# -eq 0 ]]; then set -- start; fi\nprintf "%s\\n" "$1" >> calls.txt\nexit ' +
        String(exitCode) +
        '\n',
    );
    return directory;
  };
  const pnpmDirectory = join(cache, 'tau/pnpm/11.7.0/node_modules/.bin');
  mkdirSync(pnpmDirectory, { recursive: true });
  writeFileSync(join(pnpmDirectory, 'pnpm'), '#!/usr/bin/env bash\nprintf "11.7.0\\n"\n', { mode: 0o755 });
  return { workspace, userHome, environment, run, checkout, pnpmDirectory };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('cloud environment bootstrap on stdin', () => {
  it('should detect Codex and persist the pinned tool and proxy settings without duplicating profiles', () => {
    const context = fixture();
    const checkout = context.checkout('tau');
    const profile = join(context.userHome, '.profile');
    writeFileSync(profile, '# existing user settings\n');
    const first = context.run({ CODEX_CI: '1' });
    expect(first.status, first.stderr).toBe(0);
    expect(readFileSync(join(checkout, 'calls.txt'), 'utf8')).toBe('setup\n');
    const settings = readFileSync(profile, 'utf8');
    expect(settings).toContain('# existing user settings\n');
    expect(settings).toContain('export NODE_USE_ENV_PROXY=1');
    expect(settings).toContain('export NX_NO_CLOUD=true');
    expect(settings).toContain('export PNPM_CONFIG_STORE_DIR=');
    const second = context.run({ CODEX_CI: 'true' });
    expect(second.status, second.stderr).toBe(0);
    expect(readFileSync(profile, 'utf8')).toBe(settings);
    expect(existsSync(join(context.userHome, '.claude'))).toBe(false);
    const shell = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-c', 'source "$1"; command -v pnpm', 'bootstrap', profile],
      {
        encoding: 'utf8',
      },
    );
    expect(shell.status).toBe(0);
    expect(shell.stdout.trim()).toBe(join(context.pnpmDirectory, 'pnpm'));
  });

  it('should detect the Codex environment marker when the CI marker is absent', () => {
    const context = fixture();
    const checkout = context.checkout('tau');
    const result = context.run({ CODEX_ENVIRONMENT_ID: 'test-environment' });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(checkout, 'calls.txt'), 'utf8')).toBe('setup\n');
  });

  it('should accept a checkout as the workspace root', () => {
    const context = fixture();
    const checkout = context.checkout('tau');
    const result = context.run({ CODEX_CI: '1', TAU_CLOUD_WORKSPACE: checkout });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(checkout, 'calls.txt'), 'utf8')).toBe('setup\n');
  });

  it('should report a failed Codex checkout and still prepare the next checkout', () => {
    const context = fixture();
    context.checkout('a-fails', 17);
    const successful = context.checkout('b-succeeds');
    const result = context.run({ CODEX_CI: '1' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('setup failed in');
    expect(readFileSync(join(successful, 'calls.txt'), 'utf8')).toBe('setup\n');
  });

  it('should leave an empty Codex workspace without hooks or profile changes', () => {
    const context = fixture();
    const result = context.run({ CODEX_CI: '1' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('nothing to install');
    expect(existsSync(join(context.userHome, '.profile'))).toBe(false);
    expect(existsSync(join(context.userHome, '.claude'))).toBe(false);
  });

  it.each(['direct', 'symlink'] as const)(
    'should preserve Claude settings and skip the repository hook via %s',
    (pathKind) => {
      const context = fixture();
      const first = context.checkout('tau');
      const second = context.checkout('tau-second');
      const projectDirectory = pathKind === 'symlink' ? join(context.userHome, 'tau-link') : first;
      if (pathKind === 'symlink') {
        symlinkSync(first, projectDirectory, 'dir');
      }
      const claudeDirectory = join(context.userHome, '.claude');
      mkdirSync(claudeDirectory);
      const settingsPath = join(claudeDirectory, 'settings.json');
      writeFileSync(settingsPath, '{"permissions":{"allow":["Read"]},"hooks":{"SessionStart":[]}}\n');
      const initial = context.run({ CLAUDE_CODE_REMOTE: 'true' });
      expect(initial.status, initial.stderr).toBe(0);
      const settings = readFileSync(settingsPath, 'utf8');
      expect(settings).toContain('"Read"');
      const repeat = context.run({ CLAUDE_CODE_REMOTE: 'true' });
      expect(repeat.status, repeat.stderr).toBe(0);
      expect(readFileSync(settingsPath, 'utf8')).toBe(settings);
      expect((settings.match(/tau-session-start\.sh/gu) ?? []).length).toBe(1);
      const hook = spawnSync('bash', [join(claudeDirectory, 'tau-session-start.sh')], {
        env: { ...context.environment, CLAUDE_CODE_REMOTE: 'true', CLAUDE_PROJECT_DIR: projectDirectory },
        encoding: 'utf8',
      });
      expect(hook.status, hook.stderr).toBe(0);
      expect(readFileSync(join(first, 'calls.txt'), 'utf8')).toBe('setup\nsetup\n');
      expect(readFileSync(join(second, 'calls.txt'), 'utf8')).toBe('setup\nsetup\nstart\n');
      expect(existsSync(join(context.userHome, '.profile'))).toBe(false);
    },
  );

  it('should install the Claude hook before any repositories exist', () => {
    const context = fixture();
    const result = context.run({ CLAUDE_CODE_REMOTE: 'true' });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(context.userHome, '.claude/tau-session-start.sh'))).toBe(true);
  });

  it('should preserve Claude best-effort warm-up and hook failure behavior', () => {
    const context = fixture();
    context.checkout('a-fails', 17);
    const second = context.checkout('b-succeeds');
    const result = context.run({ CLAUDE_CODE_REMOTE: 'true' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('warm-up failed');
    const hook = spawnSync('bash', [join(context.userHome, '.claude/tau-session-start.sh')], {
      env: context.environment,
      encoding: 'utf8',
    });
    expect(hook.status).toBe(0);
    expect(hook.stderr).toContain('agent-env failed');
    expect(readFileSync(join(second, 'calls.txt'), 'utf8')).toBe('setup\nstart\n');
  });

  it('should refuse invalid Claude settings without overwriting them', () => {
    const context = fixture();
    mkdirSync(join(context.userHome, '.claude'));
    const path = join(context.userHome, '.claude/settings.json');
    writeFileSync(path, '{invalid existing settings');
    const result = context.run({ CLAUDE_CODE_REMOTE: 'true' });
    expect(result.status).toBe(2);
    expect(readFileSync(path, 'utf8')).toBe('{invalid existing settings');
    expect(existsSync(join(context.userHome, '.claude/tau-session-start.sh'))).toBe(false);
  });

  it('should refuse conflicting cloud markers without creating agent configuration', () => {
    const context = fixture();
    const result = context.run({ CLAUDE_CODE_REMOTE: 'true', CODEX_CI: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cloud agent is ambiguous');
    expect(existsSync(join(context.userHome, '.claude'))).toBe(false);
    expect(existsSync(join(context.userHome, '.profile'))).toBe(false);
  });

  it('should honor an explicit host override before automatic markers', () => {
    const context = fixture();
    const result = context.run({ TAU_CLOUD_AGENT: 'claude', CODEX_CI: '1' });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(context.userHome, '.claude/tau-session-start.sh'))).toBe(true);
  });

  it('should reject invalid host overrides', () => {
    const result = fixture().run({ TAU_CLOUD_AGENT: 'unknown' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('TAU_CLOUD_AGENT must be claude or codex');
  });
});
