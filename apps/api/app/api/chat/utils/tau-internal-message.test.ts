import { HumanMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import {
  createTauInternalHumanMessage,
  getTauInternalMetadata,
  isTauInternalKind,
  isTauInternalMessage,
} from '#api/chat/utils/tau-internal-message.js';

const additionalKwargsKey = 'additional_kwargs';

describe('tau internal message metadata', () => {
  it('marks server-only HumanMessages with stable internal metadata', () => {
    const message = createTauInternalHumanMessage({
      id: 'tau:snapshot-context:chat_1',
      content: '<system-reminder>snapshot</system-reminder>',
      kind: 'snapshot-context',
      metadata: { anchorId: 'chat_1', pruning: 'replace-by-id' },
    });

    expect(message.id).toBe('tau:snapshot-context:chat_1');
    expect(isTauInternalMessage(message)).toBe(true);
    expect(isTauInternalKind(message, 'snapshot-context')).toBe(true);
    expect(getTauInternalMetadata(message)).toEqual({
      kind: 'snapshot-context',
      anchorId: 'chat_1',
      pruning: 'replace-by-id',
    });
  });

  it('recognizes existing compaction source metadata as internal for legacy checkpoints', () => {
    const message = new HumanMessage({
      id: 'data_1-summary-0',
      content: '[Compacted conversation history]',
      [additionalKwargsKey]: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
        lc_source: 'compaction',
      },
    });

    expect(isTauInternalMessage(message)).toBe(true);
    expect(isTauInternalKind(message, 'compaction-summary')).toBe(true);
  });
});
