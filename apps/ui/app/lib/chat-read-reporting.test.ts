// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { chatReadCodes, chatReadReportLimit, createChatReadReporter } from '#lib/chat-read-reporting.js';

vi.mock('#lib/error-reporting.js', () => ({ reportUiError: vi.fn() }));

describe('chat read reporting (HA0)', () => {
  it.each(chatReadCodes)('should report %s once per occurrence', (code) => {
    const report = vi.fn();
    const sink = createChatReadReporter(report);
    const session = {};

    sink.report(code, { chatId: 'chat', occurrence: session });
    sink.report(code, { chatId: 'chat', occurrence: session });
    sink.report(code, { chatId: 'chat', occurrence: 'run_1' });
    sink.report(code, { chatId: 'chat', occurrence: 'run_1' });
    sink.report(code, { chatId: 'chat', occurrence: 'run_2', tags: { reason: 'lost' } });

    expect(report).toHaveBeenCalledTimes(3);
    expect(report.mock.calls[2]).toEqual([
      expect.objectContaining({ name: 'ChatReadFailure', message: code }),
      {
        level: 'warning',
        tags: { 'chat.read': code, reason: 'lost' },
        contexts: { chat: { chatId: 'chat' } },
        fingerprint: ['chat-read', code],
      },
    ]);
  });

  it('should count occurrences per code, so one occurrence reports under each code', () => {
    const report = vi.fn();
    const sink = createChatReadReporter(report);

    for (const code of chatReadCodes) {
      sink.report(code, { chatId: 'chat', occurrence: 'shared' });
    }

    expect(report).toHaveBeenCalledTimes(chatReadCodes.length);
  });

  it('should cap each code per page load', () => {
    const report = vi.fn();
    const sink = createChatReadReporter(report);

    for (let index = 0; index < chatReadReportLimit + 3; index++) {
      sink.report('own.rewrite', { chatId: 'chat', occurrence: `reset_${String(index)}` });
    }
    sink.report('run.unsettled.own', { chatId: 'chat', occurrence: 'run_1' });

    expect(report).toHaveBeenCalledTimes(chatReadReportLimit + 1);
  });
});
