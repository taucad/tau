import { defineTranscoder } from '@taucad/runtime/transcoder';
import { lookupMimeType } from '@taucad/runtime/types';
import { createCadmpeg } from 'cadmpeg-ts';
import type { Cadmpeg } from 'cadmpeg-ts';
import { z } from 'zod';

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
  edges,

  async initialize(): Promise<{ cadmpeg: Cadmpeg }> {
    return { cadmpeg: await createCadmpeg() };
  },

  async transcode(input, services, context: { cadmpeg: Cadmpeg }) {
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
          { message: failureMessage(error), code: 'TRANSCODER_EXECUTION_FAILED', type: 'runtime', severity: 'error' },
        ],
      };
    }
  },
});
