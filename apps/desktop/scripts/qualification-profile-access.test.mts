#!/usr/bin/env node
/**
 * Purpose: On a Linux clean host the orchestrator (the administrator account) cannot read the consumer's 0750/0700
 * home. Prove that the consumer profile access reaches every profile path only through the consumer's agent, and that
 * the orchestrator touches its profile and the consumer's paths only through that access. Synthetic; nothing native.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// oxlint-disable-next-line no-restricted-imports -- Exercise the orchestrator's actual profile access.
import { consumerProfile } from './qualification-profile-access.mjs';

const calls: string[] = [];
/** A consumer-agent operation that only records its call and answers `value`. */
function record<T>(name: string, value: T): (...args: unknown[]) => Promise<T> {
  return async (...args) => {
    calls.push(`${name}:${args.map(String).join(',')}`);
    return value;
  };
}
// A path that does not exist here: any local filesystem call on it would throw ENOENT or EACCES.
const profile = '/home/qualification-consumer-absent/.config/Tau Staging';
const files = consumerProfile({
  mkdir: record('mkdir', undefined),
  mkdirOne: record('mkdirOne', undefined),
  readFile: async (path) => {
    calls.push(`readFile:${path}`);
    return path.endsWith('absent.json') ? undefined : new Uint8Array(Buffer.from('{"ok":true}'));
  },
  writeFile: record('writeFile', undefined),
  stat: async (path) => {
    calls.push(`stat:${path}`);
    return path.endsWith('absent.json') ? undefined : { size: 11, mode: 0o600, uid: 1001 };
  },
  readdir: async (path) => {
    calls.push(`readdir:${path}`);
    return undefined;
  },
  realpath: record('realpath', profile),
  rm: record('rm', undefined),
  sha256: record('sha256', 'a'.repeat(64)),
  alive: record('alive', true),
  signal: record('signal', undefined),
});
assert.equal(await files.realpath(profile), profile);
await files.mkdir(profile, true);
await files.mkdir(`${profile}/x`, false);
assert.equal(Buffer.from(await files.read(`${profile}/route-qualification.ready.json`)).toString(), '{"ok":true}');
await assert.rejects(files.read(`${profile}/absent.json`), { code: 'ENOENT' });
await files.writeJson(`${profile}/route-qualification.request.json`, { profile });
assert.equal(await files.size(`${profile}/logs/desktop.log`), 11);
assert.equal(await files.size(`${profile}/absent.json`), undefined);
assert.deepEqual(await files.readdir(`${profile}/closures/sha256`), []);
await files.rm(`${profile}/DevToolsActivePort`);
assert.equal(await files.sha256(`${profile}/route-qualification.sentinel`), 'a'.repeat(64));
assert.equal(await files.alive(42), true);
await files.terminate(42);
assert.deepEqual(
  calls.map((entry) => entry.split(':')[0]),
  [
    'realpath',
    'mkdir',
    'mkdirOne',
    'readFile',
    'readFile',
    'writeFile',
    'stat',
    'stat',
    'readdir',
    'rm',
    'sha256',
    'alive',
    'signal',
  ],
);
assert.ok(calls.includes('signal:42,SIGTERM'));

// The orchestrator's own source: no administrator-side filesystem call takes the profile (or a path under it). The
// request's canonical profile in particular comes from `files.realpath`, so the agent resolves the consumer's home.
const source = await readFile(fileURLToPath(new URL('qualify-desktop-route.mts', import.meta.url)), 'utf8');
const direct =
  /(?<![.\w])(?:readFile|writeFile|stat|lstat|realpath|readdir|rm|mkdir|rename|access|open|createReadStream)\(\s*(?:join\(\s*)?profile\b/gu;
assert.deepEqual(
  [...source.matchAll(direct)].map((match) => match[0]),
  [],
);
assert.match(source, /profile: await files\.realpath\(profile\)/u);
assert.doesNotMatch(source, /(?<!files\.)\brealpath\(profile\)/u);
console.log(
  'PASS consumer profile access reaches the consumer home only through its agent; orchestrator never reads it directly',
);
