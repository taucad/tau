import { describe, it, expect, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import {
  tauPrepareCallHierarchy,
  tauProvideCallHierarchyIncomingCalls,
  tauProvideCallHierarchyOutgoingCalls,
} from '#lib/monaco-typescript-extras/tau-call-hierarchy-bridge.client.js';
import type { TauTypeScriptLanguageServiceWorker } from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('tau call hierarchy bridge', () => {
  afterEach(async () => {
    for (const m of monaco.editor.getModels()) {
      m.dispose();
    }
    await drainMonacoPostTestWork();
  });

  it('maps prepare / incoming / outgoing to Monaco-shaped results with existing models', async () => {
    const childText = 'export function f() {}\n';
    const parentText = 'import { f } from "./child.ts"; f();\n';
    const childUri = monaco.Uri.file('/child.ts');
    const parentUri = monaco.Uri.file('/parent.ts');
    monaco.editor.createModel(childText, 'typescript', childUri);
    monaco.editor.createModel(parentText, 'typescript', parentUri);

    const worker = {
      prepareCallHierarchy: async () => ({
        file: childUri.toString(),
        name: 'f',
        span: { start: childText.indexOf('f'), length: 1 },
      }),
      provideCallHierarchyIncomingCalls: async (): Promise<unknown> => [
        {
          from: {
            file: parentUri.toString(),
            name: 'f',
            span: { start: parentText.indexOf('f'), length: 1 },
          },
          fromSpans: [{ start: parentText.lastIndexOf('f'), length: 1 }],
        },
      ],
      provideCallHierarchyOutgoingCalls: async (): Promise<unknown> => [
        {
          to: {
            file: childUri.toString(),
            name: 'f',
            span: { start: childText.indexOf('f'), length: 1 },
          },
          fromSpans: [{ start: parentText.indexOf('f'), length: 1 }],
        },
      ],
    } as unknown as TauTypeScriptLanguageServiceWorker;

    const items = await tauPrepareCallHierarchy(worker, childUri.toString(), 0);
    expect(items?.[0]!.uri.path).toBe('/child.ts');

    const incoming = await tauProvideCallHierarchyIncomingCalls(worker, childUri.toString(), 0);
    expect(incoming[0]!.from.uri.path).toBe('/parent.ts');

    const outgoing = await tauProvideCallHierarchyOutgoingCalls(worker, parentUri.toString(), 0);
    expect(outgoing[0]!.to.uri.path).toBe('/child.ts');
  });
});
