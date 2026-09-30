import { describe, expect, it } from 'vitest';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';

describe('document wire schema over a byte transport', () => {
  it('normalizes an absent kernel identity after MessagePack encodes undefined as null', () => {
    const described = {
      documentId: 'doc',
      intent: 0,
      evaluationId: 'evaluation',
      success: false,
      kernelId: undefined,
      issues: [],
    };
    const decoded = msgpackCodec.decode(msgpackCodec.encode(described));
    expect(runtimeDocumentProtocolSchemas.notifies.described.parse(decoded)).toMatchObject({
      documentId: 'doc',
      kernelId: undefined,
    });
    expect(
      runtimeDocumentProtocolSchemas.calls.describe.result.parse(
        msgpackCodec.decode(msgpackCodec.encode({ success: false, kernelId: undefined, issues: [] })),
      ),
    ).toMatchObject({ success: false, kernelId: undefined });
  });
});
