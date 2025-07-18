import type { Monaco } from '@monaco-editor/react';
// eslint-disable-next-line no-restricted-imports -- replicad types are not in the monorepo
import replicadTypes from '../../../../../node_modules/replicad/dist/replicad.d.ts?raw';

// Import zodTypes from '../../../../../node_modules/zod/v4/index.d.ts?raw';

export const registerMonaco = async (monaco: Monaco): Promise<void> => {
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
      content: `declare module 'replicad' { ${replicadTypes} }`,
      filePath: 'file:///node_modules/replicad/index.d.ts',
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
