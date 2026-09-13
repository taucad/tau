import { describe, expect, it } from 'vitest';
import type { Chat } from '#types/chat.types.js';
import { chatRecordSchema, parseChatRecord, serializeChatRecord } from '#schemas/chat-record.schema.js';

const chat: Chat = {
  id: 'chat_one',
  resourceId: 'proj_abcdefghijklmnopqrstu',
  name: 'Bracket',
  messages: [{ id: 'msg_1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
  draft: { id: 'draft', role: 'user', parts: [{ type: 'text', text: 'half a thought' }] },
  messageEdits: Object.fromEntries([
    ['msg_1', { id: 'edit_1', role: 'user', parts: [{ type: 'text', text: 'editing' }] }],
  ]),
  createdAt: 1,
  updatedAt: 2,
  recencyAt: 2,
  hasUnreadTurn: true,
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
   * claim, where the loser's copy overwrites the winner's. A half-written
   * message and an unread badge are this device's, not the chat's (A36/I26). */
  it('never writes the derived or per-device fields', () => {
    const bytes = serializeChatRecord(chat);
    for (const field of ['messages', 'draft', 'messageEdits', 'hasUnreadTurn']) {
      expect(bytes).not.toContain(field);
    }
  });

  it('drops keys whose value is undefined rather than writing them', () => {
    expect(serializeChatRecord({ ...chat, activeKernel: undefined })).not.toContain('activeKernel');
  });

  /* D14: an older reader reads a newer writer's record, and saving it back does
   * not delete what it did not understand. */
  it('carries a field it does not know through the round trip', () => {
    const forward = JSON.stringify({ ...chat, hasUnreadTurn: undefined, futureField: { kept: true } });
    const parsed = parseChatRecord(forward);
    expect(parsed).toMatchObject({ futureField: { kept: true } });
    expect(serializeChatRecord(parsed!)).toContain('futureField');
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
