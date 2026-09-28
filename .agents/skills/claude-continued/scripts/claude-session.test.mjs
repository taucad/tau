import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('selects the live exact title and keeps only conversational text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-continued-'));
  try {
    const sessions = join(root, 'sessions');
    const project = join(root, 'projects', 'tau');
    await mkdir(sessions, { recursive: true });
    await mkdir(project, { recursive: true });
    const id = '11111111-1111-1111-1111-111111111111';
    const old = '22222222-2222-2222-2222-222222222222';
    const name = '⤵️ GeoSpec Closeout';
    await writeFile(join(sessions, 'live.json'), JSON.stringify({ name, sessionId: id, pid: process.pid }));
    await writeFile(join(sessions, 'stale.json'), JSON.stringify({ name, sessionId: old, pid: 99999999 }));
    await writeFile(
      join(project, `${id}.jsonl`),
      [
        { type: 'user', timestamp: 't1', message: { content: 'Continue the task' } },
        {
          type: 'assistant',
          timestamp: 't2',
          message: {
            content: [
              { type: 'thinking', thinking: 'secret' },
              { type: 'text', text: 'Done' },
            ],
          },
        },
        { type: 'user', timestamp: 't3', message: { content: [{ type: 'tool_result', content: 'tool output' }] } },
        { type: 'user', timestamp: 't4', isMeta: true, message: { content: 'meta' } },
        { type: 'system', subtype: 'compact_boundary', timestamp: 't5' },
      ]
        .map(JSON.stringify)
        .join('\n'),
    );
    const out = join(root, 'extract.md');
    const script = join(import.meta.dirname, 'claude-session.mjs');
    const result = spawnSync(process.execPath, [script, name, '--out', out, '--claude-home', root], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const extract = await readFile(out, 'utf8');
    assert.match(extract, /Session ID: 11111111-/);
    assert.match(extract, /Continue the task/);
    assert.match(extract, /Done/);
    assert.match(extract, /compacted context at line 5/);
    assert.doesNotMatch(extract, /secret|tool output|\nmeta\n/);
    await writeFile(join(sessions, 'second.json'), JSON.stringify({ name, sessionId: old, pid: process.pid }));
    const ambiguous = spawnSync(process.execPath, [script, name, '--out', out, '--claude-home', root], {
      encoding: 'utf8',
    });
    assert.equal(ambiguous.status, 1);
    assert.match(ambiguous.stderr, /found 2/);
    const byId = spawnSync(process.execPath, [script, id, '--out', out, '--claude-home', root], { encoding: 'utf8' });
    assert.equal(byId.status, 0, byId.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
