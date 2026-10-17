/**
 * `tau open` — the launcher (charter D29, C1 R3).
 *
 * One step from a terminal to a place a person can look at a project, as `code .` and `gh browse` do. A folder or
 * file is served with `tau serve` (local-first, loopback only) with the digest-pinned Tau UI from the payload store
 * (prepared on first use, W18) or `--ui <dir>`, and its URL opened in the browser, which is the default
 * hand-off because the same-origin served page needs no secret in its URL and no Local Network Access prompt (C1 R6).
 * A URL is opened as it is. `--print` prints the URL instead of opening it.
 *
 * `--desktop` is best effort. A `tau://` link the desktop admits (an invitation, a share, an import) goes to the OS
 * scheme handler. A served folder cannot reach the desktop yet: the daemon-naming `tau://host/<origin>?code=` link
 * arrives with the serve UI hand-off after spike S32 (W18), so until then the browser opens and the CLI says why.
 * Cloning a Tau Cloud project is `tau clone`.
 *
 * @module
 */
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand, runCommand } from 'citty';
import type { CommandDef } from 'citty';
import { createConsola } from 'consola';

import { findProjectRoot } from '#project-root.js';
import { cliError, emit, exitCodes, writeStdout } from '#output.js';

const consola = createConsola({ stdout: process.stderr });

/** What `tau open` was given: a URL to open as it is, or a folder to serve. */
export type OpenTarget = Readonly<{ kind: 'url'; url: string }> | Readonly<{ kind: 'folder'; folder: string }>;

/**
 * Classify the launcher's argument.
 *
 * @internal
 * @param target - A path or URL; the current directory when absent.
 * @param cwd - The directory a relative path resolves from.
 * @returns The URL, or the project folder a path belongs to (a file's nearest `tau.json` folder).
 * @throws {CliError} `INPUT_NOT_FOUND` (exit 3) for a path that does not exist.
 */
export const openTarget = async (target: string | undefined, cwd: string): Promise<OpenTarget> => {
  if (target !== undefined && /^(?:https?|tau):\/\//iu.test(target)) {
    return { kind: 'url', url: new URL(target).href };
  }
  const path = resolve(cwd, target ?? '.');
  let entry: Awaited<ReturnType<typeof stat>>;
  try {
    entry = await stat(path);
  } catch {
    throw cliError('INPUT_NOT_FOUND', `Nothing to open at ${path}.`, exitCodes.refused);
  }
  if (entry.isDirectory()) {
    return { kind: 'folder', folder: path };
  }
  return { kind: 'folder', folder: findProjectRoot(path) };
};

/**
 * Hand a URL to the platform's opener: the default browser, or the scheme handler for a `tau://` link.
 *
 * @param url - What to open.
 * @returns Whether the opener started.
 */
const launch = async (url: string): Promise<boolean> => {
  const [command, ...prefix] =
    process.platform === 'darwin'
      ? ['open']
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '""']
        : ['xdg-open'];
  return new Promise((resolve) => {
    const child = spawn(command, [...prefix, url], { detached: true, stdio: 'ignore' });
    child.once('error', () => {
      resolve(false);
    });
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
};

/** `tau open [path|url]`. */
export const openCommand = defineCommand({
  meta: {
    name: 'open',
    description: 'Open a project folder, file or Tau link in the browser',
  },
  args: {
    target: {
      type: 'positional',
      description: 'Folder, file or URL to open (defaults to the current directory)',
      required: false,
    },
    desktop: {
      type: 'boolean',
      description: 'Prefer Tau Desktop; best effort, the browser opens when the desktop cannot take this target',
      default: false,
    },
    print: {
      type: 'boolean',
      description: 'Print the URL on stdout instead of opening it',
      default: false,
    },
    json: {
      type: 'boolean',
      description: 'Print one versioned JSON record with the URL on stdout instead of opening it',
      default: false,
    },
    ui: {
      type: 'string',
      description:
        'Directory of a prebuilt Tau UI to serve the folder with instead of the pinned one from the payload store (TAU_HOST_UI_DIR)',
      required: false,
      default: process.env['TAU_HOST_UI_DIR'],
    },
    port: {
      type: 'string',
      description: 'Loopback port to serve a folder on (see tau serve --port)',
      required: false,
    },
  },
  async run({ args }) {
    const target = await openTarget(typeof args.target === 'string' ? args.target : undefined, process.cwd());
    const scripted = args.print || args.json;

    if (target.kind === 'url') {
      if (args.json) {
        await emit({ kind: 'open', ok: true, url: target.url, opened: false });
        return;
      }
      if (args.print) {
        await writeStdout(`${target.url}\n`);
        return;
      }
      if (args.desktop && !target.url.startsWith('tau://')) {
        consola.warn('Tau Desktop opens only tau:// links from a terminal; opening the browser.');
      }
      if (!(await launch(target.url))) {
        throw cliError('OPEN_FAILED', `Could not open ${target.url}. Open it yourself.`, exitCodes.refused);
      }
      return;
    }

    const { prepareStoreUi, serveCommand } = await import('#commands/serve.js');
    let ui = typeof args.ui === 'string' ? args.ui : '';
    if (ui === '') {
      const storeUi = await prepareStoreUi();
      if (storeUi.status !== 'ready') {
        throw cliError(
          'UI_NOT_AVAILABLE',
          `No Tau UI to open ${target.folder} in: ${storeUi.message} Pass --ui=<directory of a Tau UI build> (or set TAU_HOST_UI_DIR); \`tau serve\` serves the folder to agents without one.`,
          exitCodes.refused,
        );
      }
      ui = storeUi.root;
    }
    if (args.desktop) {
      consola.warn('Tau Desktop cannot open a served folder from the terminal yet; opening it in the browser instead.');
    }
    await runCommand(serveCommand as CommandDef, {
      rawArgs: [
        target.folder,
        `--ui=${ui}`,
        ...(args.port === undefined || args.port === '' ? [] : [`--port=${String(args.port)}`]),
        ...(args.json ? ['--json'] : []),
        ...(args.print ? ['--print'] : []),
        scripted ? '--no-open' : '--open',
      ],
    });
  },
});
