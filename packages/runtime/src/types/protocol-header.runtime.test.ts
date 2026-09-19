// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  protocolVersion,
  validateProtocolHeader,
  createSequenceCounter,
  TransportProtocolVersionError,
  isTransportProtocolVersionError,
} from '#types/protocol-header.types.js';
import type { ProtocolHeader, WireMessage } from '#types/protocol-header.types.js';

describe('protocolVersion', () => {
  it('should expose the current wire protocol version as a literal', () => {
    expect(protocolVersion).toBe(3);
  });
});

describe('validateProtocolHeader', () => {
  it('should accept a header carrying the current protocol version', () => {
    const header: ProtocolHeader = { v: 3, seq: 0 };
    expect(() => {
      validateProtocolHeader(header);
    }).not.toThrow();
  });

  it('should throw TransportProtocolVersionError when the version mismatches', () => {
    // The current wire protocol is `v: 3`. Older or newer envelopes coming
    // over a remote channel must surface as a typed error so the runtime
    // client can distinguish "wire shape changed" from "kernel produced an
    // error".
    const stale = { v: 2, seq: 0 } as unknown as ProtocolHeader;

    try {
      validateProtocolHeader(stale);
      expect.fail('validateProtocolHeader should throw on mismatched version');
    } catch (error) {
      expect(error).toBeInstanceOf(TransportProtocolVersionError);
      expect((error as Error).message).toContain('3');
      expect((error as Error).message).toContain('2');
      expect((error as TransportProtocolVersionError).expected).toBe(3);
      expect((error as TransportProtocolVersionError).received).toBe(2);
      expect((error as TransportProtocolVersionError).code).toBe('TRANSPORT_PROTOCOL_VERSION_MISMATCH');
    }
  });

  it('should expose a realm-safe isTransportProtocolVersionError type guard', () => {
    const error = new TransportProtocolVersionError(3, 2);
    expect(isTransportProtocolVersionError(error)).toBe(true);
    expect(isTransportProtocolVersionError(new Error('plain'))).toBe(false);
    expect(error.name).toBe('TransportProtocolVersionError');
  });
});

describe('createSequenceCounter', () => {
  it('should produce a monotonic 0-indexed sequence', () => {
    const next = createSequenceCounter();
    expect(next()).toBe(0);
    expect(next()).toBe(1);
    expect(next()).toBe(2);
  });

  it('should be independent between counter instances', () => {
    const a = createSequenceCounter();
    const b = createSequenceCounter();
    expect(a()).toBe(0);
    expect(a()).toBe(1);
    expect(b()).toBe(0);
    expect(a()).toBe(2);
    expect(b()).toBe(1);
  });
});

describe('WireMessage', () => {
  it('should be the structural intersection of a payload and a ProtocolHeader', () => {
    type SamplePayload = { type: 'ping' };
    const wire: WireMessage<SamplePayload> = { type: 'ping', v: 3, seq: 0 };

    expect(wire.type).toBe('ping');
    expect(wire.v).toBe(3);
    expect(wire.seq).toBe(0);
  });

  it('should accept optional cid and rgen correlation fields', () => {
    type SamplePayload = { type: 'render' };
    const wire: WireMessage<SamplePayload> = {
      type: 'render',
      v: 3,
      seq: 7,
      cid: 'cmd_abc123',
      rgen: 4,
    };

    expect(wire.cid).toBe('cmd_abc123');
    expect(wire.rgen).toBe(4);
  });
});
