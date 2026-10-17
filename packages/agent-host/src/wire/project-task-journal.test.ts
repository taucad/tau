import { describe, expect, it } from 'vitest';
import { projectTaskLineageFromJournal } from '#wire/project-task-journal.js';

const task = (id: string, chatId: string, parentTaskId?: string) => ({
  id,
  projectId: 'project',
  chatId,
  ...(parentTaskId ? { parentTaskId } : {}),
  depth: parentTaskId ? 1 : 0,
  title: id,
  prompt: id,
  provider: { id: 'codex' },
  createdAt: 1,
  closed: false,
  attempts: [
    {
      id: `attempt-${id}`,
      number: 1,
      status: 'running',
      source: { revisionId: 'revision', checkoutId: 'checkout' },
      toolGrant: { toolChoice: 'none', allowedTools: [] },
      createdAt: 1,
    },
  ],
});
const row = (sequence: number, tasks: unknown[]) =>
  `${JSON.stringify({ version: 1, projectId: 'project', sequence, tasks })}\n`;
const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

describe('portable task journal lineage projection', () => {
  it('folds latest durable tasks, omits roots and tolerates only an incomplete final row', () => {
    const journal = `${row(1, [task('root', 'root-chat')])}${row(2, [task('child', 'child-chat', 'root')])}${row(3, [])}{"partial":`;
    expect(projectTaskLineageFromJournal(bytes(journal), 'project')).toEqual([
      {
        chatId: 'child-chat',
        taskLineage: {
          taskId: 'child',
          parentTaskId: 'root',
          parentChatId: 'root-chat',
          rootChatId: 'root-chat',
        },
      },
    ]);
  });

  it('rejects corrupt complete rows, gaps and missing ancestry', () => {
    expect(() => projectTaskLineageFromJournal(bytes('{"invalid":true}\n'), 'project')).toThrow();
    expect(() => projectTaskLineageFromJournal(bytes(row(2, [])), 'project')).toThrow();
    expect(() =>
      projectTaskLineageFromJournal(bytes(row(1, [task('orphan', 'orphan-chat', 'missing')])), 'project'),
    ).toThrow('missing parent');
  });
});
