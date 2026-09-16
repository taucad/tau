import { describe, expect, it } from 'vitest';
import type { Chat } from '#types/chat.types.js';
import { chatRecordSchema, parseChatRecord, serializeChatRecord } from '#schemas/chat-record.schema.js';

const chat: Chat = {
  id: 'chat_one',
  resourceId: 'proj_abcdefghijklmnopqrstu',
  name: 'Bracket',
  messages: [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  createdAt: 1,
  updatedAt: 2,
  recencyAt: 2,
};

describe('chat record', () => {
  it('round-trips a chat through its file bytes', () => {
    const parsed = parseChatRecord(serializeChatRecord(chat));
    expect(parsed).toEqual({
      id: 'chat_one',
      resourceId: 'proj_abcdefghijklmnopqrstu',
      name: 'Bracket',
      createdAt: 1,
      updatedAt: 2,
      recencyAt: 2,
    });
  });

  /* P26/D25: the transcript is the log's, and a copy in the record would be a
   * second history of the same turns — over the one path two devices both
   * claim, where the loser's copy overwrites the winner's. */
  it('never writes the derived transcript', () => {
    expect(serializeChatRecord(chat)).not.toContain('messages');
  });

  it('drops keys whose value is undefined rather than writing them', () => {
    expect(serializeChatRecord({ ...chat, activeKernel: undefined })).not.toContain('activeKernel');
  });

  /* D14: an older reader reads a newer writer's record, and saving it back does
   * not delete what it did not understand. */
  it('carries a field it does not know through the round trip', () => {
    const forward = JSON.stringify({ ...chat, futureField: { kept: true } });
    const parsed = parseChatRecord(forward);
    expect(parsed).toMatchObject({ futureField: { kept: true } });
    expect(serializeChatRecord(parsed!)).toContain('futureField');
  });

  /* W8: `draft`, `messageEdits` and `hasUnreadTurn` left `Chat` for the
   * device's composer records, but a record written before that — on disk here
   * or fetched from another device — still carries them. Reading it must not
   * fail, and neither the read nor the next save may carry them on. */
  it('reads a pre-W8 record and drops its composer keys on read and write', () => {
    const legacy = JSON.stringify({
      id: 'chat_one',
      resourceId: 'proj_abcdefghijklmnopqrstu',
      name: 'Bracket',
      createdAt: 1,
      updatedAt: 2,
      draft: { id: 'draft', role: 'user', parts: [{ type: 'text', text: 'half a thought' }] },
      messageEdits: Object.fromEntries([['msg_1', { id: 'edit_1', role: 'user', parts: [] }]]),
      hasUnreadTurn: true,
    });
    const parsed = parseChatRecord(legacy);
    expect(parsed).toEqual({
      id: 'chat_one',
      resourceId: 'proj_abcdefghijklmnopqrstu',
      name: 'Bracket',
      createdAt: 1,
      updatedAt: 2,
    });
    const bytes = serializeChatRecord(JSON.parse(legacy) as Chat);
    for (const field of ['draft', 'messageEdits', 'hasUnreadTurn']) {
      expect(bytes).not.toContain(field);
    }
  });

  it('reports bytes that are not a chat record rather than throwing', () => {
    expect(parseChatRecord('not json')).toBeUndefined();
    expect(parseChatRecord('{"id":"chat_one"}')).toBeUndefined();
    expect(chatRecordSchema.safeParse({ ...chat, createdAt: -1 }).success).toBe(false);
  });

  it('ends the file with a newline so a diff reads as one record', () => {
    expect(serializeChatRecord(chat).endsWith('}\n')).toBe(true);
  });
});
