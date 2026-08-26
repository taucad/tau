import { z } from 'zod';

/** Structural validation that works for modules received through structured clone. */
export const compiledWasmModuleSchema = z.custom<WebAssembly.Module>((value) => {
  try {
    WebAssembly.Module.customSections(value as WebAssembly.Module, '');
    return true;
  } catch {
    return false;
  }
});
