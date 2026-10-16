// `tau serve --ui` hands the browser a prebuilt UI whose `window.ENV` was baked at build time. A value the daemon's own
// environment decides at run time (the managed acquisition profile, `TAU_ACQUISITION`) must reach the page too, or the
// served SPA keeps acquiring types from a CDN on a locked machine. The UI's environment contract already admits this:
// any host that sets `window.ENV` before app-module evaluation wins every key it supplies over the build-time values
// (`apps/ui/app/lib/client-env-script.ts`). So the daemon serves a view of the build in which each top-level HTML shell
// carries one leading `<script>` that sets those keys, and every other entry is a link to the build's own file.
import { lstat, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The client environment keys a daemon decides at run time, with the value it injects. */
export type DaemonClientEnvironment = Readonly<Partial<Record<'TAU_ACQUISITION', string>>>;

/** A served view of a UI build; `dispose` removes the view, never the build. */
export type StagedUi = {
  /** The directory to serve. */
  readonly root: string;
  dispose(): Promise<void>;
};

/**
 * The script a shell gains: the injected keys over whatever an earlier host set, so the build-time script after it
 * keeps them (it spreads `window.ENV` last). `<` is escaped so no value can close the element.
 * @param environment - Keys and values to set.
 * @returns One `<script>` element.
 */
export const clientEnvironmentScript = (environment: DaemonClientEnvironment): string =>
  `<script>window.ENV = { ...(window.ENV ?? {}), ...${JSON.stringify(environment).replaceAll('<', String.raw`<`)} }</script>`;

/**
 * Insert the environment script as the first element of the document's `<head>`, or before everything when the
 * document has none.
 * @param html - The shell's text.
 * @param environment - Keys and values to set.
 * @returns The shell with the script.
 */
export const injectClientEnvironment = (html: string, environment: DaemonClientEnvironment): string => {
  const script = clientEnvironmentScript(environment);
  const head = /<head(?:\s[^>]*)?>/iu.exec(html);
  return head === null
    ? `${script}${html}`
    : `${html.slice(0, head.index + head[0].length)}${script}${html.slice(head.index + head[0].length)}`;
};

/**
 * Stage the UI build for serving with the daemon's client environment: a temporary directory whose top-level `.html`
 * shells carry {@link clientEnvironmentScript} and whose other entries are links to the build. With no key to set,
 * the build itself is served, byte-identical.
 * @param uiRoot - Absolute directory of the prebuilt UI.
 * @param environment - Keys the daemon decides; keys whose value is undefined are left to the build.
 * @returns The directory to serve and its cleanup.
 */
export const stageUiEnvironment = async (uiRoot: string, environment: DaemonClientEnvironment): Promise<StagedUi> => {
  const defined: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === 'string') {
      defined[key] = value;
    }
  }
  if (Object.keys(defined).length === 0) {
    return { root: uiRoot, dispose: async () => undefined };
  }
  const root = await mkdtemp(join(tmpdir(), 'tau-serve-ui-'));
  const stage = async (name: string): Promise<void> => {
    const source = join(uiRoot, name);
    const entry = await lstat(source);
    await (entry.isFile() && name.toLowerCase().endsWith('.html')
      ? writeFile(join(root, name), injectClientEnvironment(await readFile(source, 'utf8'), defined))
      : symlink(source, join(root, name), entry.isDirectory() ? 'dir' : 'file'));
  };
  try {
    const names = await readdir(uiRoot);
    await Promise.all(names.map(async (name) => stage(name)));
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return { root, dispose: async () => rm(root, { recursive: true, force: true }) };
};
