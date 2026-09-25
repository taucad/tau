import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureChatLogs, chatLogDestination, writeChatLogs } from '#capture.js';

const roots: string[] = [];
const temporaryRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'formal-capture-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const writeLog = (file: string, text: string): void => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

describe('captureChatLogs', () => {
  it('should copy every chat log under the root and its project directories verbatim', async () => {
    const root = temporaryRoot();
    writeLog(path.join(root, 'home/.tau/chats/chat-a/events.jsonl'), '{"a":1}\n');
    writeLog(path.join(root, 'home/projects/hexnut/.tau/chats/chat-b/events.jsonl'), '{"b":null}\n');
    writeLog(path.join(root, 'home/projects/hexnut/.tau/chats/chat-c/summary.json'), '{}');
    const destination = chatLogDestination('desktop-e2e', '/repo/apps/desktop-e2e/src/chat.spec.ts', root);

    const copied = await captureChatLogs(path.join(root, 'home'), destination);

    expect(copied).toEqual(['chat-a', 'chat-b']);
    expect(destination).toBe(path.join(root, 'out/test-results/chat-logs/desktop-e2e/chat.spec.ts'));
    expect(readFileSync(path.join(destination, 'chat-b.0.jsonl'), 'utf8')).toBe('{"b":null}\n');
  });

  it('should keep both logs when two tests of one spec reuse a chat id', async () => {
    const root = temporaryRoot();
    const destination = path.join(root, 'out');
    writeLog(path.join(root, 'first/.tau/chats/chat-1/events.jsonl'), '{"first":1}\n');
    writeLog(path.join(root, 'second/.tau/chats/chat-1/events.jsonl'), '{"second":1}\n');

    await Promise.all([
      captureChatLogs(path.join(root, 'first'), destination),
      captureChatLogs(path.join(root, 'second'), destination),
    ]);
    await writeChatLogs(destination, [{ chatId: 'chat-1', text: '{"third":1}\n' }]);

    expect(
      ['chat-1.0.jsonl', 'chat-1.1.jsonl', 'chat-1.2.jsonl']
        .map((file) => readFileSync(path.join(destination, file), 'utf8'))
        .sort(),
    ).toEqual(['{"first":1}\n', '{"second":1}\n', '{"third":1}\n']);
  });

  it('should write logs read through a page', async () => {
    const destination = path.join(temporaryRoot(), 'out');

    await writeChatLogs(destination, [{ chatId: 'chat-z', text: '{"z":1}\n' }]);

    expect(readFileSync(path.join(destination, 'chat-z.0.jsonl'), 'utf8')).toBe('{"z":1}\n');
  });
});
