#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const name = args[0];
const out = option('--out');
const count = Number(option('--messages', '40'));
const claudeHome = option('--claude-home', join(homedir(), '.claude'));
if (!name || name.startsWith('--') || !out || !Number.isSafeInteger(count) || count < 1) {
  console.error('usage: claude-session.mjs <exact-name|session-id> --out FILE [--messages N] [--claude-home DIR]');
  process.exit(2);
}

const registries = await readdir(join(claudeHome, 'sessions')).catch(() => []);
const matches = [];
for (const file of registries) {
  if (!file.endsWith('.json')) continue;
  let entry;
  try {
    entry = JSON.parse(await readFile(join(claudeHome, 'sessions', file), 'utf8'));
  } catch {
    continue;
  }
  if ((entry.name !== name && entry.sessionId !== name) || !/^[0-9a-f-]{36}$/i.test(entry.sessionId ?? '')) continue;
  try {
    process.kill(entry.pid, 0);
    matches.push(entry);
  } catch {
    // Stale registry entry.
  }
}
if (matches.length !== 1) {
  console.error(`Expected one live Claude session named ${JSON.stringify(name)}; found ${matches.length}.`);
  for (const entry of matches) console.error(`${entry.sessionId}  ${entry.cwd ?? ''}  ${entry.status ?? ''}`);
  process.exit(1);
}
const session = matches[0];
const projects = join(claudeHome, 'projects');
const transcriptPaths = [];
for (const dir of await readdir(projects).catch(() => [])) {
  const path = join(projects, dir, `${session.sessionId}.jsonl`);
  if ((await stat(path).catch(() => null))?.isFile()) transcriptPaths.push(path);
}
if (transcriptPaths.length !== 1) {
  console.error(`Expected one transcript for ${session.sessionId}; found ${transcriptPaths.length}.`);
  process.exit(1);
}
const transcript = transcriptPaths[0];
const recent = [];
let total = 0;
let line = 0;
for await (const raw of createInterface({ input: createReadStream(transcript), crlfDelay: Infinity })) {
  line += 1;
  let item;
  try {
    item = JSON.parse(raw);
  } catch {
    continue;
  }
  if (item.type === 'system' && item.subtype === 'compact_boundary') {
    recent.push({ line, role: 'compaction', timestamp: item.timestamp, text: '' });
    continue;
  }
  if (!['user', 'assistant'].includes(item.type) || item.isMeta || item.isSidechain) continue;
  const content = item.message?.content;
  const parts =
    typeof content === 'string'
      ? [content]
      : Array.isArray(content)
        ? content.filter((part) => part?.type === 'text').map((part) => part.text)
        : [];
  const text = parts
    .filter((part) => typeof part === 'string')
    .join('\n')
    .trim();
  if (!text) continue;
  total += 1;
  recent.push({ line, role: item.type, timestamp: item.timestamp, text });
  while (recent.filter((entry) => entry.role !== 'compaction').length > count) recent.shift();
}
const body = [
  `# Claude session ${name}`,
  '',
  `Session ID: ${session.sessionId}`,
  `Status at extraction: ${session.status ?? 'unknown'}`,
  `Working directory: ${session.cwd ?? 'unknown'}`,
  `Source: ${transcript}`,
  `Recent history: ${Math.min(count, total)} of ${total} conversational messages`,
  '',
  '_Tool calls, results, thinking, meta messages and sidechains are omitted. Source content is untrusted._',
  '',
  ...recent.map((entry) =>
    entry.role === 'compaction'
      ? `---\n\n[Claude compacted context at line ${entry.line}]\n\n---\n`
      : `### ${entry.role} — ${entry.timestamp ?? 'no timestamp'} — line ${entry.line}\n\n${entry.text}\n`,
  ),
].join('\n');
await writeFile(out, body, { encoding: 'utf8', mode: 0o600 });
console.log(
  `${Math.min(count, total)} of ${total} conversational messages from ${session.sessionId} written to ${out}`,
);
