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

  it('accepts additive fields in known calls, notifications, and nested delivery descriptors', () => {
    expect(
      runtimeDocumentProtocolSchemas.calls.export.args.parse({
        documentId: 'doc',
        operationId: 'export-1',
        target: 'bom',
        futureHint: 'safe-to-ignore',
      }),
    ).toMatchObject({ documentId: 'doc', operationId: 'export-1', target: 'bom' });

    const rendered = runtimeDocumentProtocolSchemas.notifies.rendered.parse({
      success: true,
      documentId: 'doc',
      subscriptionId: 'view-1',
      requestId: 'request-1',
      evaluationId: 'evaluation-1',
      intent: 0,
      view: 'model',
      artifact: {
        mimeType: 'model/gltf-binary',
        content: { delivery: 'inline', bytes: new Uint8Array([1]), futureEncoding: 'none' },
        futureArtifactField: true,
      },
      hash: 'hash',
      transient: false,
      issues: [],
      futureNotifyField: 42,
    });
    expect(rendered).toMatchObject({
      success: true,
      requestId: 'request-1',
      artifact: { content: { delivery: 'inline', bytes: new Uint8Array([1]) } },
    });

    expect(() =>
      runtimeDocumentProtocolSchemas.notifies.evaluating.parse({
        documentId: 'doc',
        intent: 0,
        evaluationId: 'evaluation-1',
        transient: 'yes',
        futureHint: 1,
      }),
    ).toThrow();
    expect(() =>
      runtimeDocumentProtocolSchemas.notifies.rendered.parse({
        ...rendered,
        artifact: { mimeType: 'model/gltf-binary', content: { delivery: 'future', bytes: new Uint8Array([1]) } },
      }),
    ).toThrow();
  });
});
