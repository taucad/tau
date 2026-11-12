import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { gatewayHostKinds, gatewayTurnGaps, gatewayTurnSteps } from '@taucad/agent-host/wire';
import { kernelIds } from '@taucad/telemetry';
import {
  assertNoQuery,
  invocationSignal,
  readHint,
  readHostLabels,
  readSingleHeader,
  readTurnTelemetry,
} from '#llm-gateway.headers.js';
import { gatewayModelRoutes } from '#providers/provider-gateway.js';

describe('funded invocation HTTP boundary', () => {
  it('rejects any query component before invocation', () => {
    expect(() => {
      assertNoQuery({ query: {} } as FastifyRequest);
    }).not.toThrow();
    expect(() => {
      assertNoQuery({ query: { ignored: 'value' } } as FastifyRequest);
    }).toThrow('Query parameters are not supported');
  });

  it('aborts when the response closes before it finishes', () => {
    // oxlint-disable-next-line unicorn/prefer-event-target -- Fastify wraps Node streams with EventEmitter.once
    const requestRaw = new EventEmitter();
    // oxlint-disable-next-line unicorn/prefer-event-target -- Fastify reply.raw is a Node ServerResponse
    const replyRaw = Object.assign(new EventEmitter(), { writableFinished: false });
    const signal = invocationSignal(
      { raw: requestRaw } as unknown as FastifyRequest,
      { raw: replyRaw } as unknown as FastifyReply,
    );

    replyRaw.emit('close');

    expect(signal.aborted).toBe(true);
  });
});

describe('readHint', () => {
  it.each([
    ['proj_01J8ZK4E', 'proj_01J8ZK4E'],
    ['chat_1', 'chat_1'],
    // The admitted identity class is `[A-Za-z0-9._:-]`, so a prefixed id, a
    // dotted one and a namespaced one all survive.
    ['workspace.project:main-2', 'workspace.project:main-2'],
    ['a'.repeat(128), 'a'.repeat(128)],
  ])('should keep %s, which the ledger admits unchanged', (value, expected) => {
    expect(readHint(value)).toBe(expected);
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['spaced', 'project one'],
    ['slashed', 'proj/1'],
    ['over the 128-character bound', 'a'.repeat(129)],
    ['non-ASCII', 'projekt-Ä'],
    ['newline-injected', 'proj_1\nx-tau-chat-id: other'],
  ])('should drop a %s hint rather than refuse the turn', (_name, value) => {
    expect(readHint(value)).toBeUndefined();
  });
});

describe('readTurnTelemetry', () => {
  const requestWith = (headers: Record<string, string>): FastifyRequest =>
    ({
      headers,
      raw: { rawHeaders: Object.entries(headers).flatMap(([name, value]) => [name, value]) },
    }) as unknown as FastifyRequest;

  it('should carry no turn labels when the caller asserted none', () => {
    expect(readTurnTelemetry(requestWith({}))).toEqual({});
  });

  it('should keep asserted step and gap labels', () => {
    expect(readTurnTelemetry(requestWith({ 'x-tau-turn-step': 'first', 'x-tau-turn-gap': '5m_60m' }))).toEqual({
      turn: { step: 'first', gap: '5m_60m' },
    });
  });

  /* The agent host's own vocabulary (`@taucad/agent-host/wire`) must read back as itself, never as `unknown`. */
  it.each(gatewayTurnSteps.flatMap((step) => gatewayTurnGaps.map((gap) => [step, gap] as const)))(
    'should keep every label the agent host sends (%s, %s)',
    (step, gap) => {
      expect(readTurnTelemetry(requestWith({ 'x-tau-turn-step': step, 'x-tau-turn-gap': gap }))).toEqual({
        turn: { step, gap },
      });
    },
  );

  it.each([
    [{ 'x-tau-turn-step': 'second' }, { step: 'unknown', gap: 'unknown' }],
    [
      { 'x-tau-turn-step': 'unknown', 'x-tau-turn-gap': 'lt_5m' },
      { step: 'unknown', gap: 'lt_5m' },
    ],
    [{ 'x-tau-turn-gap': '90m' }, { step: 'unknown', gap: 'unknown' }],
  ])('should turn a malformed label into unknown rather than refuse the turn (%o)', (headers, turn) => {
    expect(readTurnTelemetry(requestWith(headers))).toEqual({ turn });
  });
});

describe('readHostLabels', () => {
  const requestWith = (headers: Record<string, string>): FastifyRequest =>
    ({
      headers,
      raw: { rawHeaders: Object.entries(headers).flatMap(([name, value]) => [name, value]) },
    }) as unknown as FastifyRequest;
  const [{ routeId }] = gatewayModelRoutes() as unknown as [{ routeId: string }];

  it('should carry no host labels when the caller sent none, a helper or direct call', () => {
    expect(readHostLabels(requestWith({}))).toEqual({});
  });

  it('should keep the labels the agent host sends', () => {
    expect(
      readHostLabels(
        requestWith({
          'x-tau-host-kind': 'browser',
          'x-tau-host-build': '0123456789ab',
          'x-tau-kernel': 'replicad',
          'x-tau-model': routeId,
        }),
      ),
    ).toEqual({ hostLabels: { host: 'browser', build: '0123456789ab', kernel: 'replicad', model: routeId } });
  });

  /* The agent host's own vocabulary (`@taucad/agent-host/wire`) must read back as itself, never as `unknown`. */
  it.each(gatewayHostKinds)('should keep every host kind the agent host sends (%s)', (kind) => {
    expect(readHostLabels(requestWith({ 'x-tau-host-kind': kind }))).toEqual({ hostLabels: { host: kind } });
  });

  it.each(kernelIds)('should keep every product kernel id (%s)', (kernel) => {
    expect(readHostLabels(requestWith({ 'x-tau-kernel': kernel }))).toEqual({ hostLabels: { kernel } });
  });

  it.each(['abcdef1', 'abcdef012345', '0123456789abcdef0123456789abcdef01234567', '1.24.0', '0.1.0-beta.9'])(
    'should keep the release label %s',
    (build) => {
      expect(readHostLabels(requestWith({ 'x-tau-host-build': build }))).toEqual({ hostLabels: { build } });
    },
  );

  it.each([
    [{ 'x-tau-host-kind': 'toaster' }, { host: 'unknown' }],
    [{ 'x-tau-host-build': 'not-a-build' }, { build: 'unknown' }],
    [{ 'x-tau-host-build': 'ABCDEF012345' }, { build: 'unknown' }],
    [{ 'x-tau-host-build': 'a'.repeat(41) }, { build: 'unknown' }],
    [{ 'x-tau-host-build': '1.2.3-' }, { build: 'unknown' }],
    [{ 'x-tau-host-build': `1.2.3-${'a'.repeat(33)}` }, { build: 'unknown' }],
    [{ 'x-tau-kernel': 'cadquery' }, { kernel: 'unknown' }],
    [{ 'x-tau-model': 'a-model-the-catalog-does-not-route' }, { model: 'unknown' }],
    [
      { 'x-tau-host-kind': 'desktop', 'x-tau-kernel': 'x'.repeat(512) },
      { host: 'desktop', kernel: 'unknown' },
    ],
  ])('should turn a value outside its vocabulary into unknown rather than refuse the call (%o)', (headers, labels) => {
    expect(readHostLabels(requestWith(headers))).toEqual({ hostLabels: labels });
  });

  it('should refuse a duplicated label header as every gateway header is refused', () => {
    const request = {
      headers: { 'x-tau-kernel': 'replicad' },
      raw: { rawHeaders: ['x-tau-kernel', 'replicad', 'x-tau-kernel', 'openscad'] },
    } as unknown as FastifyRequest;
    expect(() => readHostLabels(request)).toThrow('Duplicate x-tau-kernel headers are not allowed.');
    expect(() => readSingleHeader(request, 'x-tau-kernel')).toThrow('Duplicate');
  });
});
