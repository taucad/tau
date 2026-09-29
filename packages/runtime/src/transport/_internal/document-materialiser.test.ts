import { describe, expect, it } from 'vitest';
import { materialiseDocumentExport, materialiseRendering } from '#transport/_internal/document-materialiser.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import { documentProtocolCallNames, documentProtocolNotifyNames } from '#types/runtime-document-protocol.types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { SharedPool } from '@taucad/memory';
import { materialiseBinaryContent } from '#transport/_internal/export-materialiser.js';

describe('document wire', () => {
  it('has exactly six calls and twenty notifies with checked export cardinality', () => {
    expect(Object.keys(runtimeDocumentProtocolSchemas.calls)).toEqual(documentProtocolCallNames);
    expect(Object.keys(runtimeDocumentProtocolSchemas.notifies)).toEqual(documentProtocolNotifyNames);
    expect(
      runtimeDocumentProtocolSchemas.calls.export.result.safeParse({
        success: true,
        exportId: 'board',
        evaluationId: 'eval-1',
        files: [],
        issues: [],
      }).success,
    ).toBe(false);
    expect(
      runtimeDocumentProtocolSchemas.notifies.rendered.safeParse({
        subscriptionId: 'sub-1',
        intent: 1,
        success: true,
        view: 'svg',
        requestId: 'req-1',
        evaluationId: 'eval-1',
        transient: false,
        issues: [],
        hash: 'hash',
        artifact: { mimeType: 'application/vnd.example.custom', content: '<svg />' },
      }).success,
    ).toBe(true);
    expect(
      runtimeDocumentProtocolSchemas.notifies.update.safeParse({
        documentId: 'doc-1',
        intent: 1,
        transient: true,
        stage: { '/entry.ts': new Uint8Array([1]) },
      }).success,
    ).toBe(false);
    expect(
      runtimeDocumentProtocolSchemas.notifies.evaluated.safeParse({
        documentId: 'doc-1',
        intent: 1,
        success: true,
        id: 'eval-1',
        transient: false,
        views: [
          { id: 'board', title: 'Board', mimeType: 'image/svg+xml', options: { schema: { type: 42 }, defaults: {} } },
        ],
        exports: [],
        issues: [],
      }).success,
    ).toBe(false);
    const cyclicSchema: Record<string, unknown> = { type: 'object' };
    cyclicSchema['properties'] = { self: cyclicSchema };
    const evaluated = {
      documentId: 'doc-1',
      intent: 1,
      success: true,
      id: 'eval-1',
      transient: false,
      views: [
        { id: 'board', title: 'Board', mimeType: 'image/svg+xml', options: { schema: cyclicSchema, defaults: {} } },
      ],
      exports: [],
      issues: [],
    };
    expect(runtimeDocumentProtocolSchemas.notifies.evaluated.safeParse(evaluated).success).toBe(false);
    evaluated.views[0]!.options.schema = { type: 'object' };
    evaluated.views[0]!.options.defaults = { bad: Number.NaN };
    expect(runtimeDocumentProtocolSchemas.notifies.evaluated.safeParse(evaluated).success).toBe(false);
  });

  it('drops a stale result only after a genuine transport materialises its bytes', async () => {
    const client = inProcessTransport({ runtime: defineRuntime({}), fileSystem: fromMemoryFs() }).materialize();
    let current = true;
    const rendering = await materialiseRendering(
      {
        success: true,
        view: 'model',
        requestId: 'req-1',
        evaluationId: 'eval-1',
        transient: false,
        issues: [],
        hash: 'hash',
        artifact: { mimeType: 'model/gltf-binary', content: { delivery: 'inline', bytes: new Uint8Array([1]) } },
      },
      async (content) => {
        const bytes = await client.resolveBinary?.(content);
        current = false;
        if (!bytes) {
          throw new Error('Transport lacks binary materialisation.');
        }
        return bytes;
      },
      () => current,
    );
    expect(rendering).toBeUndefined();
    await client.close();
  });

  it('preserves a nonempty export and admits unknown media after materialisation', async () => {
    const client = inProcessTransport({ runtime: defineRuntime({}), fileSystem: fromMemoryFs() }).materialize();
    const result = await materialiseDocumentExport(
      {
        success: true,
        exportId: 'board',
        evaluationId: 'eval-1',
        issues: [],
        files: [
          {
            name: 'board.custom',
            mimeType: 'application/vnd.example.custom',
            bytes: { delivery: 'inline', bytes: new Uint8Array([2]) },
          },
        ],
      },
      async (content) => {
        const bytes = await client.resolveBinary?.(content);
        if (!bytes) {
          throw new Error('Transport lacks binary materialisation.');
        }
        return bytes;
      },
      () => true,
    );
    expect(result).toMatchObject({ success: true, files: [{ bytes: new Uint8Array([2]) }] });
    await client.close();
  });

  it('releases every export payload before discarding a superseded result', async () => {
    const pool = new SharedPool(new SharedArrayBuffer(4096), { maxEntries: 2 });
    expect(pool.publish('first', new Uint8Array([1]))).toBe(true);
    expect(pool.publish('second', new Uint8Array([2]))).toBe(true);
    let current = true;
    const result = await materialiseDocumentExport(
      {
        success: true,
        exportId: 'bom',
        evaluationId: 'eval-1',
        issues: [],
        files: [
          { name: 'first.csv', mimeType: 'text/csv', bytes: { delivery: 'pooled', key: 'first' } },
          { name: 'second.csv', mimeType: 'text/csv', bytes: { delivery: 'pooled', key: 'second' } },
        ],
      },
      async (content) => {
        const bytes = materialiseBinaryContent(content, pool, (key) => {
          pool.acknowledge(key);
        });
        await Promise.resolve();
        current = false;
        return bytes;
      },
      () => current,
    );
    expect(result).toBeUndefined();
    expect(pool.has('first')).toBe(false);
    expect(pool.has('second')).toBe(false);
  });

  it('releases later pooled files when an earlier file fails', async () => {
    const pool = new SharedPool(new SharedArrayBuffer(4096), { maxEntries: 2 });
    expect(pool.publish('second', new Uint8Array([2]))).toBe(true);
    await expect(
      materialiseDocumentExport(
        {
          success: true,
          exportId: 'bom',
          evaluationId: 'eval-1',
          issues: [],
          files: [
            { name: 'missing.csv', mimeType: 'text/csv', bytes: { delivery: 'pooled', key: 'missing' } },
            { name: 'second.csv', mimeType: 'text/csv', bytes: { delivery: 'pooled', key: 'second' } },
          ],
        },
        async (content) =>
          materialiseBinaryContent(content, pool, (key) => {
            pool.acknowledge(key);
          }),
        () => true,
      ),
    ).rejects.toThrow();
    expect(pool.has('second')).toBe(false);
  });
});
