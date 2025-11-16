import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { registerCompletion } from 'monacopilot';
import type { CompletionRegistration, Monaco, StandaloneCodeEditor, CompletionCopilot } from 'monacopilot';
import type { Monaco as MonacoEditor } from '@monaco-editor/react';
import { replicadTypesOriginal } from '@taucad/api-extractor';
import { ENV } from '#config.js';
import { registerOpenScadLanguage } from '#lib/openscad-language/openscad-register-language.js';
import { registerKclLanguage } from '#lib/kcl-language/kcl-register-language.js';

/**
 * Configure the Monaco editor.
 *
 * This custom loader supports Vite bundling and ensures a minimal
 * bundle size.
 */
export const configureMonaco = async (): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be undefined in SSR
  if (globalThis.self !== undefined) {
    globalThis.self.MonacoEnvironment = {
      getWorker(_, label) {
        if (label === 'json') {
          return new JsonWorker();
        }

        if (label === 'typescript' || label === 'javascript') {
          return new TsWorker();
        }

        return new EditorWorker();
      },
    };

    const monaco = await import('monaco-editor/esm/vs/editor/editor.api');

    loader.config({
      monaco,
    });

    // Core Editor features, like auto-completion.
    // @ts-expect-error -- no declaration file
    await import('monaco-editor/esm/vs/editor/edcore.main');

    // Languages
    await import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution');
    await import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution');
    await import('monaco-editor/esm/vs/language/json/monaco.contribution');
    await import('monaco-editor/esm/vs/language/typescript/monaco.contribution');

    registerOpenScadLanguage(monaco);
    registerKclLanguage(monaco);
  }
};

/**
 * Register completions for the Monaco editor.
 *
 * @param editor - The editor instance.
 * @param monaco - The Monaco instance.
 * @returns The completion registration.
 */
export const registerCompletions = (editor: StandaloneCodeEditor, monaco: Monaco): CompletionRegistration => {
  return registerCompletion(monaco, editor, {
    endpoint: `${ENV.TAU_API_URL}/v1/code-completion`,
    language: 'typescript',
    trigger: 'onTyping',
    async requestHandler(request) {
      const response = await fetch(`${ENV.TAU_API_URL}/v1/code-completion`, {
        method: 'POST',
        body: JSON.stringify(request.body),
        credentials: 'include',
      });
      const data = (await response.json()) as Awaited<ReturnType<CompletionCopilot['complete']>>;

      return data;
    },
  });
};

export const registerMonaco = async (monaco: MonacoEditor): Promise<void> => {
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    experimentalDecorators: true,
    allowSyntheticDefaultImports: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    noLib: false,
    allowNonTsExtensions: true,
    noEmit: true,
    baseUrl: './',
  });
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.typescriptDefaults.setExtraLibs([
    {
      content: `declare module 'replicad' { ${replicadTypesOriginal} }`,
      filePath: 'file:///node_modules/replicad/index.d.ts',
    },
    {
      content: `declare module '@jscad/modeling' { ${replicadTypesOriginal} }`,
      filePath: 'file:///node_modules/@jscad/modeling/index.d.ts',
    },
    {
      content: `
    import * as replicadAll from 'replicad';
    declare global {
    declare var replicad = replicadAll;
    }
  `,
    },
    //   {
    //     content: `declare module 'zod' { ${zodTypes} }`,
    //     filePath: 'file:///node_modules/zod/index.d.ts',
    //   },
    //   {
    //     content: `
    //   import {z as zAll} from 'zod';
    //   declare global {
    //   declare var z = zAll;
    //   }
    // `,
    //   },
  ]);
};
