// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UIMessageStreamError } from 'ai';
import { ChannelClosedError } from '@taucad/agent-host/channel-client';
import {
  isTransientPresentationFailure,
  logFacts,
  presentationErrorFacts,
  warnPresentation,
} from '#services/chat-presentation-diagnostics.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('presentationErrorFacts', () => {
  it('should keep a coded channel close with its name, code, message and the cause it names', () => {
    const error = new ChannelClosedError({ origin: 'remote', code: 'PEER_GONE' });
    Object.defineProperty(error, 'cause', {
      value: Object.assign(new Error('port payload'), { name: 'DataCloneError', code: 'PORT_DROPPED' }),
    });
    expect(presentationErrorFacts(error)).toEqual({
      errorName: 'ChannelClosedError',
      errorCode: 'PEER_GONE',
      errorMessage: 'Channel closed',
      errorCause: 'DataCloneError (PORT_DROPPED)',
    });
  });

  it('should keep a stream decode failure with the frame the SDK named', () => {
    const error = new UIMessageStreamError({
      chunkType: 'tool-invocation',
      chunkId: 'call-1',
      message: 'No tool invocation found for tool call ID "call-1".',
    });
    expect(presentationErrorFacts(error)).toEqual({
      errorName: 'AI_UIMessageStreamError',
      errorMessage: 'No tool invocation found for tool call ID "call-1".',
      chunkId: 'call-1',
      chunkType: 'tool-invocation',
    });
  });

  it('should withhold an uncoded message and a cause message, which may carry payload text', () => {
    const error = new Error('private payload', { cause: new TypeError('private cause') });
    const facts = presentationErrorFacts(error);
    expect(facts).toEqual({ errorName: 'Error', errorCause: 'TypeError' });
    expect(JSON.stringify(facts)).not.toContain('private');
  });

  it('should name a thrown non-error without reading it', () => {
    expect(presentationErrorFacts({ detail: 'private' })).toEqual({ errorName: 'UnknownError' });
  });
});

describe('warnPresentation', () => {
  it('should log its facts as JSON text, which a flattened console line keeps', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnPresentation('[ChatSessionStore] projected run could not be watched', {
      runId: 'run_1',
      errorCode: 'PEER_GONE',
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[ChatSessionStore] projected run could not be watched',
      '{"runId":"run_1","errorCode":"PEER_GONE"}',
    );
    expect(warn.mock.calls[0]?.map(String).join(' ')).not.toContain('[object Object]');
  });
});

describe('logFacts', () => {
  it('should log a host cancel at info level as JSON text, which a flattened console line keeps', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    logFacts('info', '[ChatSessionStore] host cancel', {
      chatId: 'chat',
      runId: 'run_1',
      commandId: 'req_1',
      origin: 'stop-button',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith(
      '[ChatSessionStore] host cancel',
      '{"chatId":"chat","runId":"run_1","commandId":"req_1","origin":"stop-button"}',
    );
    expect(info.mock.calls[0]?.map(String).join(' ')).not.toContain('[object Object]');
  });

  it('should log a failure at warning level with its facts, never the raw error object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logFacts('warn', '[ChatSessionStore] handoff metadata could not be prepared', {
      chatId: 'chat',
      ...presentationErrorFacts(new ChannelClosedError({ origin: 'remote', code: 'PEER_GONE' })),
    });
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      '[ChatSessionStore] handoff metadata could not be prepared',
      '{"chatId":"chat","errorName":"ChannelClosedError","errorCode":"PEER_GONE","errorMessage":"Channel closed"}',
    );
  });
});

describe('isTransientPresentationFailure', () => {
  it.each(['PEER_GONE', 'PEER_CLOSED', 'PEER_UNRESPONSIVE', 'CHANNEL_CLOSED'] as const)(
    'should retry a channel closed with %s',
    (code) => {
      expect(isTransientPresentationFailure(new ChannelClosedError({ origin: 'remote', code }))).toBe(true);
    },
  );

  it.each([
    ['a client closed under it', Object.assign(new Error('closed'), { code: 'CLIENT_CLOSED' })],
    ['a lost leadership', Object.assign(new Error('fenced'), { code: 'LEADERSHIP_LOST' })],
    ['an aborted wait', new DOMException('The wait was aborted.', 'AbortError')],
  ])('should retry %s', (_name, error) => {
    expect(isTransientPresentationFailure(error)).toBe(true);
  });

  it.each([
    [
      'a stream decode failure',
      new UIMessageStreamError({ chunkType: 'text-delta', chunkId: 'text-1', message: 'missing text part' }),
    ],
    ['an uncoded error', new Error('private reconstruction payload')],
    ['a host refusal', Object.assign(new Error('refused'), { code: 'COMMAND_UNREADABLE' })],
    ['a thrown value', 'private'],
  ])('should latch %s', (_name, error) => {
    expect(isTransientPresentationFailure(error)).toBe(false);
  });
});
