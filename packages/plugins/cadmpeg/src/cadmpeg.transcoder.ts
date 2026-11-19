import { defineTranscoder } from '@taucad/runtime/transcoder';
import { lookupMimeType } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';
import type { Cadmpeg } from 'cadmpeg-ts/core';
import { z } from 'zod';

import { openCadmpeg } from '#cadmpeg-converter.js';
import { cadmpegOptionsSchema, engineIssue } from '#cadmpeg-engines.js';
import { failureMessage, lossIssue } from '#cadmpeg-issues.js';

const writerOptionsSchema = z
  .object({
    /** Refuse the export when cadmpeg reports any loss (charter Q8: off by default). */
    strict: z.boolean().default(false),
  })
  .strict();

/**
 * The cadmpeg writers, keyed by Tau extension. All are experimental: in cadmpeg
 * 0.6.12 Rhino, Fusion and SOLIDWORKS refuse a model read from STEP with
 * `UNSUPPORTED_FORMAT`, and FreeCAD with `REFUSED`; each surfaces as an error issue.
 */
const writers = { '3dm': 'rhino', sldprt: 'sldprt', f3d: 'f3d', fcstd: 'fcstd' } as const;

/**
 * A converter, or the issue that stopped one opening. The runtime reports a thrown transcoder
 * initialization as one untyped message, so an unprepared browser host is reported from
 * `transcode` with its own code instead.
 */
type CadmpegTranscoderContext = { readonly cadmpeg: Cadmpeg } | { readonly unprepared: KernelIssue };

const edges = [
  { from: 'step', to: '3dm', optionsSchema: writerOptionsSchema },
  { from: 'step', to: 'sldprt', optionsSchema: writerOptionsSchema },
  { from: 'step', to: 'f3d', optionsSchema: writerOptionsSchema },
  { from: 'step', to: 'fcstd', optionsSchema: writerOptionsSchema },
] as const;

/**
 * Native CAD export transcoder: STEP to the formats cadmpeg writes (charter
 * D5, EQ2 C). Losses become warning issues; refusals fail with cadmpeg's code.
 *
 * @public
 */
export const cadmpegTranscoder = defineTranscoder({
  id: 'cadmpeg',
  name: 'CadmpegTranscoder',
  version: '0.1.0',
  optionsSchema: cadmpegOptionsSchema,
  edges,

  async initialize(options): Promise<CadmpegTranscoderContext> {
    try {
      return { cadmpeg: await openCadmpeg(options.engines) };
    } catch (error) {
      const unprepared = engineIssue(error, 'TRANSCODER_INITIALIZATION_FAILED');
      if (unprepared === undefined) {
        throw error;
      }
      return { unprepared };
    }
  },

  async transcode(input, services, context: CadmpegTranscoderContext) {
    if ('unprepared' in context) {
      return { success: false, issues: [context.unprepared] };
    }
    const [file] = input.files;
    if (file === undefined) {
      return {
        success: false,
        issues: [
          { message: 'No input files provided for transcoding', code: 'RUNTIME', type: 'runtime', severity: 'error' },
        ],
      };
    }
    try {
      const result = await context.cadmpeg.convert(
        { name: file.name, bytes: file.bytes },
        { to: writers[input.to], strict: input.options.strict ?? false, signal: services.signal },
      );
      const data = result.files.map(({ bytes }) => ({
        name: `${file.name.replace(/\.[^.]+$/u, '')}.${input.to}`,
        bytes: new Uint8Array(bytes),
        mimeType: lookupMimeType(input.to),
      }));
      return { success: true, data, issues: result.losses.map((loss) => lossIssue(loss)) };
    } catch (error) {
      return {
        success: false,
        issues: [
          engineIssue(error, 'TRANSCODER_EXECUTION_FAILED') ?? {
            message: failureMessage(error),
            code: 'TRANSCODER_EXECUTION_FAILED',
            type: 'runtime',
            severity: 'error',
          },
        ],
      };
    }
  },
});
