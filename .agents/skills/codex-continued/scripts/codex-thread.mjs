#!/usr/bin/env node
// Recover the recent conversational history of one Codex thread from its rollout
// segments. Rollouts reach hundreds of megabytes, so every file is streamed by
// line and only `message` items are retained.

import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const usage = 'usage: codex-thread.mjs <codex://threads/ID | ID> [--messages N] [--out FILE]';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};
const positional = [];
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index].startsWith('--')) index += 1;
  else positional.push(argv[index]);
}
const target = positional[0];
const threadId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(target ?? '')?.[1];
if (!threadId) {
  console.error(`${usage}\nNo thread UUID found in: ${target ?? '(missing argument)'}`);
  process.exit(2);
}
const requested = Number(flag('--messages', '40'));
const limit = Number.isFinite(requested) && requested > 0 ? requested : 40;
const outPath = flag('--out', undefined);

// Harness-injected pseudo-user turns: skill bodies and plugin catalogues, tens of
// kilobytes each, never written by the operator.
const injected = /^<(skill|recommended_plugins|environment_context)>/u;

const walk = async (root, depth = 4) => {
  const found = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (depth > 0) found.push(...(await walk(path, depth - 1)));
    } else if (entry.name.includes(threadId) && entry.name.endsWith('.jsonl')) {
      found.push(path);
    }
  }
  return found;
};

const codex = join(homedir(), '.codex');
const segments = [...(await walk(join(codex, 'sessions'))), ...(await walk(join(codex, 'archived_sessions')))].sort(
  (left, right) => (basename(left) > basename(right) ? 1 : -1),
);
if (segments.length === 0) {
  console.error(`No rollout segments for thread ${threadId} under ${codex}.`);
  process.exit(1);
}

const messages = [];
const inventory = [];

for (const [index, path] of segments.entries()) {
  const stream = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let meta;
  let count = 0;
  let line = 0;
  for await (const raw of stream) {
    line += 1;
    let item;
    try {
      item = JSON.parse(raw);
    } catch {
      continue;
    }
    const payload = item.payload ?? {};
    if (item.type === 'session_meta') {
      meta = { timestamp: payload.timestamp, cwd: payload.cwd, forked: payload.history_base !== undefined };
    } else if (item.type === 'compacted') {
      messages.push({ segment: index + 1, line, kind: 'compacted' });
    } else if (item.type === 'response_item' && payload.type === 'message') {
      const role = payload.role;
      if (role !== 'user' && role !== 'assistant') continue;
      const text = (payload.content ?? []).map((part) => part?.text ?? '').join('');
      count += 1;
      messages.push({
        segment: index + 1,
        line,
        kind: 'message',
        role,
        timestamp: item.timestamp,
        text,
        injected: injected.test(text),
      });
    }
  }
  inventory.push(
    `${index + 1}. ${path}\n   started ${meta?.timestamp ?? 'unknown'}${meta?.forked ? ' (continues an earlier segment)' : ''} — ${count} messages — cwd ${meta?.cwd ?? 'unknown'}`,
  );
}

const conversational = messages.filter((entry) => entry.kind !== 'message' || !entry.injected);
const total = conversational.filter((entry) => entry.kind === 'message').length;
const kept = [];
let remaining = limit;
for (let index = conversational.length - 1; index >= 0 && remaining > 0; index -= 1) {
  const entry = conversational[index];
  kept.unshift(entry);
  if (entry.kind === 'message') remaining -= 1;
}

const body = [
  `# Codex thread ${threadId}`,
  '',
  `## Segments (oldest first)`,
  '',
  ...inventory,
  '',
  `## Recent history — last ${Math.min(limit, total)} of ${total} conversational messages`,
  '',
  '_Harness-injected `<skill>` / `<recommended_plugins>` / `<environment_context>` turns are omitted. Tool calls are not included._',
  '',
  ...kept.map((entry) =>
    entry.kind === 'compacted'
      ? `---\n\n**[Codex compacted its context here — segment ${entry.segment}, line ${entry.line}]**\n\n---\n`
      : `### ${entry.role} — ${entry.timestamp ?? 'no timestamp'} — segment ${entry.segment}, line ${entry.line}\n\n${entry.text}\n`,
  ),
].join('\n');

if (outPath) {
  await writeFile(outPath, body, 'utf8');
  console.log(
    `${segments.length} segment(s), ${total} conversational messages, last ${kept.filter((e) => e.kind === 'message').length} written to ${outPath}`,
  );
} else {
  console.log(body);
}
