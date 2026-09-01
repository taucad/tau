import { describe, it, expect, afterEach, vi } from 'vitest';
import * as monaco from 'monaco-editor';
import { createHoverProvider } from '#lib/kcl-language/lsp/providers/hover-provider.js';
import type { KclLspClient } from '#lib/kcl-language/lsp/kcl-lsp-client.js';
import { createTestCancellationToken } from '#lib/testing/monaco-test-token.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';
import { codeLanguages } from '@taucad/types/constants';

describe('KCL hover provider', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }

    await drainMonacoPostTestWork();
  });

  it('forwards LSP markdown hover to Monaco', async () => {
    const client = {
      textDocumentHover: vi.fn().mockResolvedValue({
        contents: { kind: 'markdown', value: '**stdlib** symbol' },
      }),
      getFileManager: vi.fn().mockReturnValue(undefined),
    } as unknown as KclLspClient;

    const provider = createHoverProvider(monaco, client, undefined);
    const uri = monaco.Uri.parse('file:///hover/main.kcl');
    const model = monaco.editor.createModel('fn foo() {}\n', codeLanguages.kcl, uri);
    const hover = await provider.provideHover(model, new monaco.Position(1, 3), createTestCancellationToken());

    expect(client.textDocumentHover).toHaveBeenCalled();
    expect(hover?.contents.length).toBeGreaterThan(0);
    expect(hover?.contents.some((c) => 'value' in c && c.value.includes('stdlib'))).toBe(true);
  });
});
