/**
 * `tau open` — the launcher (charter D29, C1 R3).
 *
 * One step from a terminal to a place a person can look at a project, as `code .` and `gh browse` do. A folder or
 * file is served with `tau serve` (local-first, loopback only) with the digest-pinned Tau UI from the payload store
 * (prepared on first use, W18) or `--ui <dir>`, and its URL opened in the browser, which is the default
 * hand-off because the same-origin served page needs no secret in its URL and no Local Network Access prompt (C1 R6).
 * A URL is opened as it is. `--print` prints the URL instead of opening it.
 *
 * `--desktop` hands a served folder to Tau Desktop (charter S32, ruling X54): the daemon is served with no UI of its own,
 * admits `app://tau`, and mints a single-use, short-lived code, and the OS scheme handler gets
 * `tau://host/<loopback origin>?code=<code>`. The desktop redeems the code at the daemon and lists it under Runs on.
 * `--ui-origin <origin>` does the same for the Tau UI on a website, such as https://tau.new, with the code in the
 * link's fragment. A `tau://` link the desktop admits (an invitation, a share, an import) goes to the scheme handler as
 * it is. Cloning a Tau Cloud project is `tau clone`.
 *
 * @module
 */
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { defineCommand, runCommand } from 'citty';
import type { CommandDef } from 'citty';
import { createConsola } from 'consola';

import { resolveProjectRoot } from '#project-root.js';
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
  return { kind: 'folder', folder: resolveProjectRoot({ file: path, cwd }).root };
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
      description:
        'Open in Tau Desktop: a served folder is handed over with a one-time code (tau://host/<origin>?code=…)',
      default: false,
    },
    uiOrigin: {
      type: 'string',
      description:
        'Hand a served folder to the Tau UI at this exact origin (e.g. https://tau.new) with a one-time code, instead of serving a UI',
      required: false,
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
    const uiOrigin = typeof args.uiOrigin === 'string' && args.uiOrigin !== '' ? args.uiOrigin : undefined;
    /* Handed over, the folder is shown by Tau Desktop or the website's own UI: the daemon serves agents only (X54). */
    const handOff = args.desktop ? 'desktop' : uiOrigin;
    if (handOff !== undefined) {
      await runCommand(serveCommand as CommandDef, {
        rawArgs: [
          target.folder,
          '--no-ui',
          `--hand-off=${handOff}`,
          ...(args.port === undefined || args.port === '' ? [] : [`--port=${String(args.port)}`]),
          ...(args.json ? ['--json'] : []),
          ...(args.print ? ['--print'] : []),
          ...(scripted ? ['--no-open'] : []),
        ],
      });
      return;
    }
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
