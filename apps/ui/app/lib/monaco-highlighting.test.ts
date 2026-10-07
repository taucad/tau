import { afterEach, describe, expect, it } from 'vitest';
import { configureMonaco } from '#lib/monaco.lib.client.js';
import { getMonacoLanguage } from '#lib/monaco.constants.js';
import { drainMonacoPostTestWork } from '#lib/testing/monaco-async-drain.js';

afterEach(drainMonacoPostTestWork);

describe('configured file syntax highlighting', () => {
  it.each(['main.tsx', 'main.jsx', 'main.ts', 'main.js'])(
    'should retain the language and color tokens for %s',
    async (path) => {
      const monaco = (await configureMonaco())!;
      const language = getMonacoLanguage(path)!;
      const source = 'export default () => (<box name="example" />);';
      const model = monaco.editor.createModel(source, language, monaco.Uri.file(`/${path}`));
      try {
        expect(model.getLanguageId()).toBe(language);
        const [tokens] = monaco.editor.tokenize(source, model.getLanguageId());
        expect(tokens?.find((token) => token.offset === 0)?.type).toContain('keyword');
      } finally {
        model.dispose();
      }
    },
  );
});
