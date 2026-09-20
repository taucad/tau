import { defineCommand, runCommand } from 'citty';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { exportCommand } from '#commands/export.js';
import { cliError, createOutput, exitCodes, sanitize, writeStdout } from '#output.js';

/*
 * P8 bounds a terminal preview at 1 MiB encoded. Reported, not enforced by truncation:
 * the artifact the caller asked for is already on disk, and only the caller can decide
 * whether smaller dimensions or a different frame is the fix.
 */
const previewByteCeiling = 1024 * 1024;

/*
 * The webp route defaults to quality 1 — lossless — which a busy scene can push past the
 * ceiling. A preview asks for lossy bytes; `tau export --ext=webp` stays the exact route.
 */
const previewQuality = 0.8;

/**
 * Whether this run can draw the preview inside the terminal itself.
 *
 * Shaped like the runtime's `{ type: 'unsupported', reason }` scene capability, because a
 * silently skipped preview is indistinguishable from a broken one. `tau` writes no
 * terminal graphics escape sequences at all, so every run is unsupported today and the
 * written artifact is the answer; the reason names the wall the run hit first.
 *
 * ponytail: no emulator detection until a graphics-escape encoder exists — that decision
 * is gated on the kitty/iTerm2/sixel evidence, not on this command.
 *
 * @returns The unsupported verdict and its reason.
 */
const inlinePreviewSupport = (): {
  readonly type: 'unsupported';
  readonly reason: string;
} =>
  process.stdout.isTTY
    ? { type: 'unsupported', reason: 'tau does not encode terminal graphics' }
    : { type: 'unsupported', reason: 'stdout is not a terminal' };

const parseDimension = (flag: string, input: string | undefined): number | undefined => {
  if (input === undefined) {
    return undefined;
  }

  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) {
    throw cliError('ARG_DIMENSION_INVALID', `${flag} must be a positive integer of pixels`, exitCodes.usage);
  }

  return value;
};

/**
 * `tau view` command.
 *
 * Renders a bounded WebP preview through the ordinary `export('webp', …)` route — the
 * image transcoder is already a CLI built-in — writes it beside the model, and prints the
 * artifact path on stdout. Inline terminal display is reported as unsupported rather than
 * attempted, so stdout stays free of escape sequences in every environment.
 *
 * @example <caption>Preview a model</caption>
 * ```bash
 * tau view model.ts
 * tau view model.ts --output=/tmp/preview.webp
 * tau view gear.ts --width=1024 --height=576 --params='{"teeth":24}'
 * ```
 */
export const viewCommand = defineCommand({
  meta: {
    name: 'view',
    description: 'Render a bounded WebP preview of a CAD file and print its path',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Input CAD file path (e.g. model.ts)',
      required: true,
    },
    output: {
      type: 'string',
      description: 'Preview file path (defaults to <input-basename>.webp beside the input)',
      required: false,
    },
    width: {
      type: 'string',
      description: 'Preview width in pixels (defaults to the image route frame)',
      required: false,
    },
    height: {
      type: 'string',
      description: 'Preview height in pixels (defaults to the image route frame)',
      required: false,
    },
    params: {
      type: 'string',
      description: 'JSON-encoded parameters for the model (e.g. \'{"width":100}\')',
      required: false,
    },
  },
  async run({ args }) {
    if (args.output === '-') {
      throw cliError(
        'OUTPUT_STREAM_UNSUPPORTED',
        'tau view writes a preview file and prints its path. Use `tau export --ext=webp --output -` to stream bytes.',
        exitCodes.usage,
      );
    }

    const width = parseDimension('--width', args.width);
    const height = parseDimension('--height', args.height);
    const inputPath = resolve(args.file);
    const outputPath = args.output
      ? resolve(args.output)
      : resolve(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.webp`);

    // One export path for every surface: view adds a frame and a ceiling, never a second route.
    await runCommand(exportCommand, {
      rawArgs: [
        inputPath,
        '--ext=webp',
        `--output=${outputPath}`,
        `--export-options=${JSON.stringify({
          quality: previewQuality,
          ...(width === undefined ? {} : { width }),
          ...(height === undefined ? {} : { height }),
        })}`,
        ...(args.params === undefined ? [] : [`--params=${args.params}`]),
      ],
    });

    const output = await createOutput();
    const { size } = await stat(outputPath);
    if (size > previewByteCeiling) {
      output.warn(
        `Preview is ${size} bytes, above the ${previewByteCeiling}-byte terminal preview ceiling; lower --width and --height.`,
      );
    }
    output.info(`No inline preview: ${inlinePreviewSupport().reason}. Open the file to view it.`);

    // The path is this command's result, so it is the only thing on stdout — and never an escape.
    await writeStdout(`${sanitize(outputPath)}\n`);
  },
});
