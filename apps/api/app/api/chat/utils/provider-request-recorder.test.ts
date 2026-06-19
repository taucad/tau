import { HumanMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { ProviderRequestRecorder } from '#api/chat/utils/provider-request-recorder.js';

describe('ProviderRequestRecorder', () => {
  it('records chat model starts only when explicitly enabled', () => {
    const recorder = new ProviderRequestRecorder();
    const messages = [[new HumanMessage({ id: 'msg_1', content: 'hello' })]];

    recorder.handleChatModelStart({}, messages, 'run_disabled');
    expect(recorder.getRecords()).toEqual([]);

    recorder.enable();
    recorder.handleChatModelStart({}, messages, 'run_enabled');

    expect(recorder.getRecords()).toHaveLength(1);
    expect(recorder.getRecords()[0]?.runId).toBe('run_enabled');
    expect(recorder.getRecords()[0]?.messages).toBe(messages);
  });
});
