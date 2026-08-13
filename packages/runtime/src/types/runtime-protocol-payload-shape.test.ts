/**
 * Conformance test C18: every wire-protocol Zod schema accepts the
 * runtime payload shape that production code actually sends.
 *
 * C15 already locks the *existence* of a schema per call/notify, but
 * an existence check does not catch a schema/runtime mismatch — for
 * example, `runtimeCleanupArgsSchema = z.null()` would pass C15 even
 * though `runtime-worker-client.ts` sends `undefined`. C18 closes
 * that gap by parsing concrete payload shapes through each schema.
 */

import { describe, it, expect } from 'vitest';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';
import { abortReason } from '#types/runtime-protocol.types.js';

const renderId = '550e8400-e29b-41d4-a716-446655440000';
const stagePath = '/main.ts';

describe('runtime-protocol payload-shape coverage (C18)', () => {
  describe('initialize call', () => {
    it('should accept an arbitrary runtime boot config payload', () => {
      expect(() =>
        runtimeProtocolSchemas.calls.initialize.args.parse({
          config: { endpoint: 'https://api.example.test', retries: 2 },
        }),
      ).not.toThrow();
    });

    it('should reject unrelated initialize fields', () => {
      expect(() =>
        runtimeProtocolSchemas.calls.initialize.args.parse({
          config: {},
          unexpected: true,
        }),
      ).toThrow();
    });
  });

  describe('cleanup call', () => {
    it('should accept the `null` wire payload produced by the channel layer', () => {
      // `runtime-worker-client.ts` calls `this.channel.call('cleanup', undefined)`
      // with no args. The channel wire layer normalises a missing/undefined
      // arg to `null` (`createChannel`/`createChannelServer`:
      // `a: value ?? null`), so the schema validates `null` on the receive
      // side. Asserting this exact pairing prevents future regressions
      // where someone "fixes" the schema to `z.undefined()` and silently
      // rejects every cleanup call before acknowledged worker cleanup runs.
      expect(() => runtimeProtocolSchemas.calls.cleanup.args.parse(null)).not.toThrow();
      expect(() => runtimeProtocolSchemas.calls.cleanup.result.parse(null)).not.toThrow();
    });

    it('should reject `undefined` to keep the wire/application boundary explicit', () => {
      // The application calls `call('cleanup', undefined)`,
      // but the wire never carries `undefined` — only `null`. Locking
      // the schema to reject `undefined` documents the contract.
      expect(() => runtimeProtocolSchemas.calls.cleanup.args.parse(undefined)).toThrow();
    });
  });

  describe('abort notify', () => {
    it('should accept the targeted timeout payload published by the abort channel', () => {
      expect(() =>
        runtimeProtocolSchemas.notifies.abort.parse({
          renderId,
          reason: abortReason.timeout,
        }),
      ).not.toThrow();
    });

    it.each([abortReason.none, abortReason.superseded] as const)(
      'should reject non-timeout wire reason %i',
      (reason) => {
        expect(() => runtimeProtocolSchemas.notifies.abort.parse({ renderId, reason })).toThrow();
      },
    );

    it('should reject the legacy untargeted timeout payload', () => {
      expect(() => runtimeProtocolSchemas.notifies.abort.parse({ reason: abortReason.timeout })).toThrow();
    });

    it('should reject transport-local generation on the timeout wire (T16)', () => {
      expect(() =>
        runtimeProtocolSchemas.notifies.abort.parse({ renderId, abortGeneration: 1, reason: abortReason.timeout }),
      ).toThrow();
    });
  });

  describe('preview command identity', () => {
    it.each([
      ['openFile', { file: { path: '/', filename: 'main.ts' }, parameters: {} }],
      [
        'stage-and-render',
        { stage: { [stagePath]: new Uint8Array([1]) }, file: { path: '/', filename: 'main.ts' }, parameters: {} },
      ],
      ['updateParameters', { parameters: {} }],
      ['setOptions', { options: {} }],
    ] as const)('should reject %s without an explicit render identity (T6, T24)', (name, payload) => {
      expect(runtimeProtocolSchemas.notifies[name].safeParse(payload).success).toBe(false);
    });

    it('should require a resolved generation on worker state (T13, T24)', () => {
      expect(runtimeProtocolSchemas.notifies.stateChanged.safeParse({ renderId, state: 'idle' }).success).toBe(false);
      expect(
        runtimeProtocolSchemas.notifies.stateChanged.safeParse({ renderId, abortGeneration: 0, state: 'idle' }).success,
      ).toBe(true);
    });
  });
});
