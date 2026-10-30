/**
 * I7 run holds in the project host: the run→checkout map the shell reads carries each run's exact revision execution
 * holds and this project's side of startup recovery. Driven over a recording revision store; nothing here runs a
 * command.
 */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TurnAttemptKey, TurnPlacementPort } from '@taucad/agent-host';

import { createShellCheckouts } from '#project-host.js';
import type { ProjectRevisions, TurnCheckout } from '#revisions.js';

type Executions = ProjectRevisions['executions'];

let base = '';
let workspace = '';
let checkoutsDirectory = '';
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tau-project-custody-')));
  workspace = join(base, 'project');
  checkoutsDirectory = join(base, 'checkouts');
  await mkdir(workspace);
  await mkdir(join(checkoutsDirectory, 'checkout-1'), { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const recording = (leases: Awaited<ReturnType<Executions['leases']>> = []) => {
  const calls: string[] = [];
  const executions: Executions = {
    hold: async ({ key, executionId }) => {
      calls.push(`hold:${key.runId}#${String(key.attempt)}:${executionId}`);
      return { status: 'applied' };
    },
    release: async ({ key, executionId }) => {
      calls.push(`release:${key.runId}#${String(key.attempt)}:${executionId}`);
      return { status: 'applied' };
    },
    leases: async () => leases,
    get checkoutsDirectory() {
      return checkoutsDirectory;
    },
  };
  return { calls, executions };
};

const keyOf = (attempt: number): TurnAttemptKey => ({ chatId: 'chat', turnId: 'turn', runId: 'run', attempt });

describe('createShellCheckouts', () => {
  it('should refuse to hold a run before any attempt of it was admitted', async () => {
    const checkouts = new Map<string, TurnCheckout>([['run', { cwd: workspace, mode: 'direct', baseRevisionId: '' }]]);
    const { executions, calls } = recording();
    const shell = createShellCheckouts({ checkouts, executions, workspaceRoot: workspace });

    expect(await shell.checkouts.get('run')!.executions!.hold('execution')).toMatchObject({ status: 'refused' });
    expect(calls).toEqual([]);
  });

  it('should hold the admitted attempt exactly and release the attempt it held', async () => {
    const checkouts = new Map<string, TurnCheckout>([['run', { cwd: workspace, mode: 'direct', baseRevisionId: '' }]]);
    const { executions, calls } = recording();
    const shell = createShellCheckouts({ checkouts, executions, workspaceRoot: workspace });
    type Admitted = Awaited<ReturnType<TurnPlacementPort['admit']>>;
    const admit: TurnPlacementPort['admit'] = async (input) =>
      ({ requestId: input.requestId, status: 'applied', placement: {} }) as unknown as Admitted;
    const port = shell.placement({ admit } as unknown as TurnPlacementPort);
    await port.admit({ requestId: 'admit-1', key: keyOf(1) });
    const holds = shell.checkouts.get('run')!.executions!;

    expect(await holds.hold('execution')).toEqual({ status: 'applied' });
    await port.admit({ requestId: 'admit-2', key: keyOf(2) });
    expect(await holds.release('execution')).toEqual({ status: 'applied' });
    expect(calls).toEqual(['hold:run#1:execution', 'release:run#1:execution']);
  });

  it('should not record an attempt whose admission was refused', async () => {
    const checkouts = new Map<string, TurnCheckout>([['run', { cwd: workspace, mode: 'direct', baseRevisionId: '' }]]);
    const { executions } = recording();
    const shell = createShellCheckouts({ checkouts, executions, workspaceRoot: workspace });
    const admit: TurnPlacementPort['admit'] = async (input) => ({
      requestId: input.requestId,
      status: 'refused',
      code: 'SESSION_FENCED',
      message: 'fenced',
    });
    await shell.placement({ admit } as unknown as TurnPlacementPort).admit({ requestId: 'admit', key: keyOf(1) });

    expect(await shell.checkouts.get('run')!.executions!.hold('execution')).toMatchObject({ status: 'refused' });
  });

  it('should keep a stable entry per checkout and a new one once the checkout is replaced', () => {
    const checkouts = new Map<string, TurnCheckout>([['run', { cwd: workspace, mode: 'direct', baseRevisionId: '' }]]);
    const shell = createShellCheckouts({ checkouts, executions: recording().executions, workspaceRoot: workspace });
    const first = shell.checkouts.get('run');

    expect(shell.checkouts.get('run')).toBe(first);
    expect(first).toMatchObject({ cwd: workspace, mode: 'direct' });
    checkouts.set('run', { cwd: join(checkoutsDirectory, 'checkout-1'), mode: 'candidate', baseRevisionId: '' });
    expect(shell.checkouts.get('run')).not.toBe(first);
    expect([...shell.checkouts.keys()]).toEqual(['run']);
    expect(shell.checkouts.size).toBe(1);
  });

  it('should claim its own roots and answer every hold its run records still keep', async () => {
    const lease = {
      runId: 'run',
      turnId: 'turn',
      chatId: 'chat',
      checkoutId: 'live',
      attempt: 3,
      startedAt: 1,
      holder: 'root',
      executionIds: ['one', 'two'],
    };
    const { executions, calls } = recording([lease] as unknown as Awaited<ReturnType<Executions['leases']>>);
    const shell = createShellCheckouts({ checkouts: new Map(), executions, workspaceRoot: workspace });

    expect(await shell.checkouts.executions.owns(workspace)).toBe(true);
    expect(await shell.checkouts.executions.owns(join(checkoutsDirectory, 'checkout-1'))).toBe(true);
    expect(await shell.checkouts.executions.owns(base)).toBe(false);
    const held = await shell.checkouts.executions.held();
    expect([...held.keys()]).toEqual(['one', 'two']);
    expect(await held.get('two')!()).toEqual({ status: 'applied' });
    expect(calls).toEqual(['release:run#3:two']);
  });
});
