import type { KernelConfig } from '#api/chat/prompts/kernel-prompt-configs/kernel.prompt.config.types.js';
import canonicalExample from '#api/chat/prompts/kernel-prompt-configs/manifold.prompt.example.tsx?raw';

export const manifoldConfig: KernelConfig = {
  fileExtension: '.tsx',
  languageName: 'Manifold (TSCircuit)',

  codeStandards: `Output TSX using TSCircuit intrinsic elements (for example: <board>, <resistor>, <capacitor>, <trace>). Keep units explicit (for example "10mm"). Prefer top-level \`circuit.add(...)\` with a single board root for stable rendering.`,

  commonErrorPatterns:
    'missing board root, invalid unit strings, dangling trace endpoints, unsupported footprint names, and JSX syntax errors',

  fileLayoutMode: 'full-nesting',
  canonicalExample,
};
