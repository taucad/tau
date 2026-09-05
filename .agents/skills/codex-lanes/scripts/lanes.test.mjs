import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertRedispatchable, changedPaths, classify, cmdRedispatch, snapshot } from './lanes.mjs';

test('should guard redispatch ownership and preserve native model selection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-lanes-guard-'));
  const companion = join(directory, 'companion.mjs');
  const spawned = join(directory, 'unexpected-dispatch');
  const request = { prompt: 'Owned unfinished task', cwd: directory, write: true };
  try {
    for (const job of [
      { status: 'running', pid: process.pid, request },
      { status: 'failed', pid: process.pid, request },
      { status: 'cancelled', request },
      { status: 'running', pid: null, request },
      { status: 'completed', pid: 2147483647, request },
      null,
    ]) {
      writeFileSync(
        companion,
        `import {writeFileSync} from 'node:fs';\nif(process.argv[2]==='status') console.log(${JSON.stringify(JSON.stringify({ job }))});\nelse writeFileSync(${JSON.stringify(spawned)}, 'duplicate writer');\n`,
      );
      await assert.rejects(cmdRedispatch(['task-fixture-test', '--cwd', directory], companion), /Redispatch refused/);
      assert.throws(() => readFileSync(spawned), { code: 'ENOENT' });
    }
    const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
    const deadPid = child.pid;
    await new Promise((resolve, reject) => {
      child.once('exit', resolve);
      child.once('error', reject);
    });
    for (const status of ['failed', 'cancelled', 'running']) {
      assert.doesNotThrow(() => assertRedispatchable({ status, pid: deadPid, request }));
    }
    assert.throws(() => assertRedispatchable({ status: 'completed', pid: deadPid, request }), /Redispatch refused/);
    for (const status of ['failed', 'cancelled']) {
      assert.doesNotThrow(() => assertRedispatchable({ status, pid: null, request }));
      assert.equal(classify({ status, pid: null }), status);
      assert.equal(classify({ status, pid: process.pid }), 'running');
      assert.equal(classify({ status }), 'unknown');
    }
    const invocation = join(directory, 'dispatch.json');
    for (const [storedModel, override] of [
      [undefined, undefined],
      ['saved-model', undefined],
      ['saved-model', 'operator-model'],
    ]) {
      writeFileSync(
        companion,
        `import {writeFileSync} from 'node:fs';
const command=process.argv[2];
if(command==='status') console.log(JSON.stringify({job: process.argv[3]==='task-fixture-test' ? ${JSON.stringify({ status: 'failed', pid: null, request: { ...request, model: storedModel } })} : {status:'completed',summary:'done'}}));
else if(command==='task') { writeFileSync(${JSON.stringify(invocation)}, JSON.stringify(process.argv.slice(2))); console.log('task-next-test'); }
else if(command==='result') console.log(JSON.stringify({job:{status:'completed',summary:'done'}}));
`,
      );
      const runner = join(directory, 'retry.mjs');
      writeFileSync(
        runner,
        `import {cmdRedispatch} from ${JSON.stringify(new URL('./lanes.mjs', import.meta.url).href)}; await cmdRedispatch(${JSON.stringify(['task-fixture-test', '--cwd', directory, '--no-section', ...(override ? ['--model', override] : [])])}, ${JSON.stringify(companion)});`,
      );
      execFileSync(process.execPath, [runner], { stdio: 'pipe' });
      const dispatched = JSON.parse(readFileSync(invocation, 'utf8'));
      const expectedModel = override ?? storedModel;
      assert.deepEqual(dispatched, [
        'task',
        '--background',
        '--write',
        ...(expectedModel ? ['--model', expectedModel] : []),
        request.prompt,
      ]);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('should detect same-status dirty edits, additions, deletions and symlink retargeting without staging', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tau-lanes-bytes-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  try {
    git('init', '--quiet');
    writeFileSync(join(directory, 'dirty.txt'), 'original');
    git('add', '--', 'dirty.txt');
    writeFileSync(join(directory, 'dirty.txt'), 'first dirty edit');
    writeFileSync(join(directory, 'removed.txt'), 'untracked before dispatch');
    symlinkSync('dirty.txt', join(directory, 'link'));
    const before = await snapshot(directory);
    const status = git('status', '--porcelain');
    const index = readFileSync(join(directory, '.git/index'));
    writeFileSync(join(directory, 'dirty.txt'), 'second dirty edit');
    assert.equal(git('status', '--porcelain'), status);
    assert.deepEqual(changedPaths(before, await snapshot(directory)), ['dirty.txt']);
    rmSync(join(directory, 'removed.txt'));
    rmSync(join(directory, 'link'));
    symlinkSync('missing-outside-target', join(directory, 'link'));
    writeFileSync(join(directory, 'added.txt'), 'new');
    assert.deepEqual(changedPaths(before, await snapshot(directory)), [
      'added.txt',
      'dirty.txt',
      'link',
      'removed.txt',
    ]);
    assert.deepEqual(readFileSync(join(directory, '.git/index')), index);
    assert.deepEqual(changedPaths(before, before), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
