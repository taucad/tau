import { describe, it, expect, vi, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { createExtraLibsFileSystemProvider } from '#lib/monaco-workspace-fs/extra-libs-file-system-provider.js';

import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

describe('createExtraLibsFileSystemProvider', () => {
  afterEach(async () => {
    for (const model of monaco.editor.getModels()) {
      model.dispose();
    }
    monaco.typescript.typescriptDefaults.setExtraLibs([]);
    monaco.typescript.javascriptDefaults.setExtraLibs([]);
    await drainMonacoPostTestWork();
  });

  it('readText resolves from typescriptDefaults extra libs', async () => {
    const key = 'file:///node_modules/@tau/replicad/index.d.ts';
    monaco.typescript.typescriptDefaults.addExtraLib('declare const x: 1;', key);
    const provider = createExtraLibsFileSystemProvider(monaco);
    const uri = monaco.Uri.file('/node_modules/@tau/replicad/index.d.ts').with({ scheme: 'extraLibs' });
    await expect(provider.readText(uri)).resolves.toContain('declare const x');
  });

  it('findFiles filters keys by substring pattern', async () => {
    monaco.typescript.typescriptDefaults.addExtraLib('{}', 'file:///node_modules/a/index.d.ts');
    monaco.typescript.javascriptDefaults.addExtraLib('{}', 'file:///node_modules/b/index.d.ts');
    const provider = createExtraLibsFileSystemProvider(monaco);
    const hits = await Promise.resolve(provider.findFiles?.('/node_modules/a', { maxResults: 50 }));
    expect(hits?.some((u) => u.path.includes('node_modules/a'))).toBe(true);
    expect(hits?.some((u) => u.path.includes('node_modules/b'))).toBe(false);
  });

  it('onDidChange fires when matching extra lib is added', async () => {
    const provider = createExtraLibsFileSystemProvider(monaco);
    const uri = monaco.Uri.file('/node_modules/watch/me.d.ts').with({ scheme: 'extraLibs' });
    const function_ = vi.fn();
    const sub = provider.onDidChange(uri, function_);
    monaco.typescript.typescriptDefaults.addExtraLib('x', 'file:///node_modules/watch/me.d.ts');
    await vi.waitFor(
      () => {
        expect(function_).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
    sub.dispose();
  });
});
