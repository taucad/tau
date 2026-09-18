import { afterEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import process from 'node:process';
import {
  detectWorktree,
  localDatabaseName,
  worktreeDatabaseName,
  worktreeDatabaseUrl,
} from '#worktree-database.utils.js';

const main = { gitDirectory: '/repo/.git', gitCommonDirectory: '/repo/.git' };
const linked = { gitDirectory: '/repo/.git/worktrees/tau-chat-admission-closeout', gitCommonDirectory: '/repo/.git' };

describe('worktreeDatabaseName', () => {
  it('keeps the base name in the main worktree', () => {
    expect(worktreeDatabaseName('tau_dev', main)).toBe('tau_dev');
  });

  it('keeps the base name outside a git repository', () => {
    expect(detectWorktree(tmpdir())).toBeUndefined();
    expect(worktreeDatabaseName('tau_dev', undefined)).toBe('tau_dev');
  });

  it('suffixes a linked worktree with its git worktree id', () => {
    expect(worktreeDatabaseName('tau_dev', linked)).toBe('tau_dev_tau_chat_admission_closeout');
  });

  it('sanitises the id to a postgres identifier and caps the length', () => {
    const name = worktreeDatabaseName('tau_dev', {
      ...linked,
      gitDirectory: `/repo/.git/worktrees/Feature.Branch--${'x'.repeat(80)}`,
    });
    expect(name).toMatch(/^tau_dev_feature_branch_x+$/u);
    expect(name).toHaveLength(63);
  });
});

describe('worktreeDatabaseUrl', () => {
  const url = 'postgresql://dev_user:dev_password@localhost:5432/tau_dev';

  it('rewrites only the database of a local url in a linked worktree', () => {
    expect(worktreeDatabaseUrl(url, linked)).toBe(
      'postgresql://dev_user:dev_password@localhost:5432/tau_dev_tau_chat_admission_closeout',
    );
    expect(worktreeDatabaseUrl(url, main)).toBe(url);
  });

  it('never forks a remote database', () => {
    const remote = 'postgresql://app:secret@db.internal:5432/tau';
    expect(worktreeDatabaseUrl(remote, linked)).toBe(remote);
  });
});

describe('localDatabaseName', () => {
  const configured = process.env['DATABASE_URL'];
  afterEach(() => {
    if (configured === undefined) {
      delete process.env['DATABASE_URL'];
    } else {
      process.env['DATABASE_URL'] = configured;
    }
  });

  it('prefers the database named by DATABASE_URL over the compose default', () => {
    process.env['DATABASE_URL'] = 'postgresql://dev_user:dev_password@localhost:5432/tau_dev_closeout';
    expect(localDatabaseName()).toMatch(/^tau_dev_closeout/u);
    delete process.env['DATABASE_URL'];
    expect(localDatabaseName()).toMatch(/^tau_dev/u);
  });
});
