/**
 * Purpose: Give every browser build the same Emscripten environment.
 * Why: Emscripten's entry point runs Python with `-E`, which discards `PYTHONDONTWRITEBYTECODE`, so
 *   a build otherwise leaves `__pycache__` files inside the workload pack and changes the toolchain
 *   identity the archive receipts pin. The entry point reads `EMSDK_PYTHON` before `-E` applies, so
 *   a wrapper that adds `-B` keeps the installed SDK bytes unchanged without patching the SDK.
 * Environment: Node 24+, a POSIX shell for the wrapper.
 */
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Write the byte-code-free Python wrapper and return the environment a build runs under.
 *
 * @param outputRoot - The build's own output directory, which holds the wrapper.
 * @returns The process environment with `EMSDK_PYTHON` pointed at the wrapper.
 */
export const emscriptenEnvironment = async (outputRoot: string): Promise<NodeJS.ProcessEnv> => {
  const wrapper = join(outputRoot, 'emsdk-python');
  await writeFile(wrapper, `#!/bin/sh\nexec ${process.env['EMSDK_PYTHON'] ?? 'python3'} -B "$@"\n`);
  await chmod(wrapper, 0o755);
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Emscripten's own environment variable name.
  return { ...process.env, EMSDK_PYTHON: wrapper };
};
