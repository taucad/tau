import type * as NodeFs from 'node:fs/promises';
import type * as NodeOs from 'node:os';
import type * as NodePath from 'node:path';
import type * as NodeUrl from 'node:url';

let nodeExecuteCounter = 0;

const importNodeBuiltin = async <T>(specifier: string): Promise<T> =>
  import(
    /* webpackIgnore: true */
    /* @vite-ignore */
    specifier
  ) as Promise<T>;

/**
 * Execute generated ESM through a unique temporary file and remove it.
 * @internal
 * @param code - Generated ESM source.
 * @param signal - Operation cancellation signal.
 * @returns Imported module value and its temporary entry URL.
 */
export const executeCodeInNode = async <T>(
  code: string,
  signal: AbortSignal,
): Promise<{ readonly value: T; readonly entryUrl: string }> => {
  const [fs, os, path, url] = await Promise.all([
    importNodeBuiltin<typeof NodeFs>('node:fs/promises'),
    importNodeBuiltin<typeof NodeOs>('node:os'),
    importNodeBuiltin<typeof NodePath>('node:path'),
    importNodeBuiltin<typeof NodeUrl>('node:url'),
  ]);
  signal.throwIfAborted();

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'taucad-rolldown-'));
  const modulePath = path.join(directory, 'module.mjs');
  try {
    await fs.writeFile(modulePath, code, 'utf8');
    const entryUrl = `${url.pathToFileURL(modulePath).href}?v=${++nodeExecuteCounter}-${Math.random().toString(36).slice(2)}`;
    const value = (await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      entryUrl
    )) as T;
    signal.throwIfAborted();
    return { value, entryUrl };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};
