import type * as NodeFs from 'node:fs';
import type * as NodeOs from 'node:os';
import type * as NodePath from 'node:path';
import type * as NodeProcess from 'node:process';
import type * as NodeUrl from 'node:url';
import { nodeExecFilePrefix } from '#esbuild.constants.js';

let nodeExecuteCounter = 0;

const importNodeBuiltin = async <T>(specifier: string): Promise<T> =>
  import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    specifier
  ) as Promise<T>;

/**
 * Strip inline source map comments to prevent Node.js `--enable-source-maps`
 * from applying them before our own stack trace parser has a chance to.
 *
 * @param code - bundled JavaScript code
 * @returns bundled code without an inline source map comment
 */
const stripInlineSourceMap = (code: string): string => code.replace(/\/\/# sourceMappingURL=data:[^\n]+$/m, '');

/**
 * Execute bundled code in Node.js without statically importing Node built-ins.
 *
 * Browser/client bundlers still parse this file, so Node imports are intentionally
 * hidden behind an opaque dynamic importer and the caller keeps the runtime guard.
 *
 * @param code - bundled JavaScript module code to execute
 * @returns imported module value and the temporary entry URL used to run it
 */
export async function executeCodeInNode(code: string): Promise<{ value: unknown; entryUrl: string }> {
  const [fs, os, path, nodeProcess, url] = await Promise.all([
    importNodeBuiltin<typeof NodeFs>('node:fs'),
    importNodeBuiltin<typeof NodeOs>('node:os'),
    importNodeBuiltin<typeof NodePath>('node:path'),
    importNodeBuiltin<typeof NodeProcess>('node:process'),
    importNodeBuiltin<typeof NodeUrl>('node:url'),
  ]);

  // The name must be unique across WORKER THREADS, not just processes: pool
  // workers share the pid and each thread has its own module counter, so
  // `pid-counter` alone collides (one thread's unlink races another's import).
  const uniqueSuffix = Math.random().toString(36).slice(2, 10);
  const temporaryFile = path.join(
    os.tmpdir(),
    `${nodeExecFilePrefix}${nodeProcess.pid}-${++nodeExecuteCounter}-${uniqueSuffix}.mjs`,
  );
  const entryUrl = url.pathToFileURL(temporaryFile).href;
  fs.writeFileSync(temporaryFile, stripInlineSourceMap(code), 'utf8');
  try {
    const value: unknown = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      entryUrl
    );
    return { value, entryUrl };
  } finally {
    try {
      fs.unlinkSync(temporaryFile);
    } catch {
      // Best-effort cleanup; the OS will reclaim the temp file if unlink fails.
    }
  }
}
