import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/buerli.prompt.example.ts?raw';

export const buerliConfig: KernelConfig = {
  fileExtension: '.ts',
  languageName: 'Buerli (ClassCAD)',

  codeStandards: `Output TypeScript with ES module imports. Import from \`@buerli.io/classcad\`. Use \`BuerliCadFacade\` to connect to the WASM engine. Access the API via \`bcf.api.v1\` which provides Part, Solid, Assembly, Sketch, and Curve APIs. Export \`defaultParams\` object and default \`main(params)\` async function returning geometry from \`createBufferGeometry()\`. The WASM client runs entirely in the browser — no server connection required.`,

  commonErrorPatterns:
    'missing await on async API calls, incorrect part/solid IDs, invalid geometry dimensions, forgetting to call bcf.connect() before API usage',

  fileLayoutMode: 'full-nesting',
  canonicalExample,
};
