/** Print the vendored srt-win.exe path for this arch, resolved the same way the harness resolves
 * the sandbox runtime. Used by the Windows CI job to locate the broker without a brittle inline
 * require. Prints nothing (exit 1) off Windows or when the binary is absent. */
import { existsSync } from 'node:fs';

import { sandboxRuntime } from './lib.mts';

const path = sandboxRuntime().srtWin?.path;
if (!path || !existsSync(path)) {
  process.stderr.write(`vendored srt-win.exe not found (${String(path)})\n`);
  process.exit(1);
}
process.stdout.write(path);
