/**
 * Run a command that may rewrite JavaScript under a built client directory, with every file the build copied
 * verbatim moved out of its reach.
 *
 * Deploy steps add debug ids to compiled chunks: PostHog's and Sentry's injectors append a snippet to every
 * JavaScript file they can pair with a source map, and each decides that differently (a sibling `.map`, or a
 * `sourceMappingURL` comment that a .NET runtime file carries for a map it also ships). A file the build copied
 * verbatim (the PicoGK browser host, the C# language server, any runtime added later) is checked against its own
 * manifest in the browser, so one appended byte makes its loader refuse it. Rather than rely on each tool's own
 * selection rules, this hides every file `tau-asset-receipt.json` does not mark as compiled, runs the command,
 * and puts the files back, whatever the command did. `verify-shipped-assets.mts` then proves they are unchanged.
 *
 * Usage: node apps/ui/scripts/with-verbatim-assets-aside.mts <client-dir> '<shell command>'
 * Exit codes: the command's own, 1 if files could not be moved, or 2 for usage.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';

const receiptSchema = z.object({
  schema: z.literal('tau-ui-asset-receipt-v1'),
  assets: z.array(z.object({ path: z.string().min(1), sourceMap: z.literal(true).optional() })),
});

const run = async (command: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });

/**
 * Run `command` while the files the build copied verbatim are moved beside `client`, then move them back.
 * @param client - The built client directory, such as `apps/ui/build/client`.
 * @param command - A shell command, run from the current directory.
 * @returns The command's exit status.
 */
export const withVerbatimAssetsAside = async (client: string, command: string): Promise<number> => {
  const receipt = receiptSchema.parse(JSON.parse(await readFile(path.join(client, 'tau-asset-receipt.json'), 'utf8')));
  const aside = `${path.resolve(client)}.verbatim-aside`;
  if (existsSync(aside)) {
    throw new Error(`${aside} already exists: an earlier run did not put its files back.`);
  }
  const verbatim = receipt.assets
    .filter((entry) => !entry.sourceMap)
    .map((entry) => entry.path)
    .filter((file) => existsSync(path.join(client, file)));
  const moved: string[] = [];
  try {
    /* oxlint-disable no-await-in-loop -- Move one file at a time so a failure leaves a clear, recoverable state. */
    for (const file of verbatim) {
      await mkdir(path.dirname(path.join(aside, file)), { recursive: true });
      await rename(path.join(client, file), path.join(aside, file));
      moved.push(file);
    }
    /* oxlint-enable no-await-in-loop */
    console.log(`Moved ${String(moved.length)} file(s) the build copied verbatim aside while running: ${command}`);
    return await run(command);
  } finally {
    /* oxlint-disable no-await-in-loop -- Move one file at a time so a failure leaves a clear, recoverable state. */
    for (const file of moved) {
      await mkdir(path.dirname(path.join(client, file)), { recursive: true });
      await rename(path.join(aside, file), path.join(client, file));
    }
    /* oxlint-enable no-await-in-loop */
    await rm(aside, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [client, command, ...extra] = process.argv.slice(2);
  if (!client || !command || extra.length > 0) {
    console.error("Usage: node apps/ui/scripts/with-verbatim-assets-aside.mts <client-dir> '<shell command>'");
    process.exit(2);
  }
  process.exit(await withVerbatimAssetsAside(client, command));
}
