/**
 * The draft machine's image step (`resizeImageActor`), provided by both ownership sites: `active-chat-provider.tsx`
 * (the marketing and Home composers) and `ChatSessionStore` (session-backed chats).
 *
 * It applies the one storage policy, `normalizeImageAttachment`, to each queued image: a canonical image within the
 * limits passes through unchanged and starts nothing (I6); any other image the runtime has an edge for is converted to
 * JPEG through `client.transcode` in a worker (I3); everything else is refused with copy that names the format. A
 * generated capture (`preserveOriginal`) is kept byte for byte. Each outcome is counted once.
 *
 * The result is an `imageResized` event whose `resized` data URL the machine decodes and hands to `storing`; a refusal
 * rejects with {@link AttachmentRefusedError}, which the machine emits as `imageResizeFailed`.
 *
 * Both ownership sites are on Home's critical path, so the conversion service is imported on the first image that is
 * not kept byte for byte, never by this module's static graph.
 *
 * @module
 */

import { createAsyncLogic } from 'xstate';
import type { AsyncActorLogic } from 'xstate';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import type { AttachmentTranscodePort } from '@taucad/agent-host/wire';
import { loadAttachmentTranscodeSources } from '#services/attachment-transcode-sources-store.js';
import { recordAttachmentIntake } from '#telemetry/attachment-intake-telemetry.js';
import { AttachmentRefusedError } from '@taucad/chat-ui/utils/attachment-refusal';

/** The image step's input: the queued image as read, and what the file claimed to be. */
export type ResizeImageInput = {
  readonly image: string;
  readonly preserveOriginal: boolean;
  /** The file's declared `type`, for the intake counter only; it never decides anything (I1). */
  readonly declaredType?: string;
};

/** The image step's result, raised back into the draft machine. */
export type ResizeImageOutput = { readonly type: 'imageResized'; readonly resized: string };

/** What the image step converts with; the shared service and the derived source list by default. */
export type ResizeImageActorDependencies = {
  readonly transcode?: AttachmentTranscodePort;
  readonly loadTranscodeSources?: () => Promise<readonly string[]>;
};

const dataUrlPattern = /^data:([^,;]+)(?:;[^,;]+)*;base64,/u;

/**
 * Build the image step over the given conversion dependencies.
 *
 * @param dependencies - The transcode port and the convertible formats.
 * @returns The `resizeImageActor` logic.
 */
export const createResizeImageActor = (
  dependencies: ResizeImageActorDependencies = {},
): AsyncActorLogic<ResizeImageOutput, ResizeImageInput> =>
  createAsyncLogic<ResizeImageOutput, ResizeImageInput>({
    run: async ({ input }) => {
      if (input.preserveOriginal) {
        return { type: 'imageResized', resized: input.image };
      }
      const header = dataUrlPattern.exec(input.image);
      if (!header) {
        throw new Error('The image is not a base64 data URL.');
      }
      const bytes = base64ToUint8Array(input.image.slice(header[0].length));
      const { normalizeComposerImage } = await import('#services/attachment-image.service.js');
      const outcome = await normalizeComposerImage(bytes, {
        ...(dependencies.transcode === undefined ? {} : { transcode: dependencies.transcode }),
        loadTranscodeSources: dependencies.loadTranscodeSources ?? loadAttachmentTranscodeSources,
      });
      if (outcome.status === 'refused') {
        recordAttachmentIntake({
          outcome: 'refused',
          reason: outcome.reason,
          ...(outcome.format === undefined ? {} : { format: outcome.format }),
          ...(input.declaredType === undefined ? {} : { declaredType: input.declaredType }),
        });
        throw new AttachmentRefusedError({
          reason: outcome.reason,
          ...(outcome.format === undefined ? {} : { format: outcome.format }),
        });
      }
      recordAttachmentIntake({
        outcome: outcome.converted ? 'converted' : 'stored',
        format: outcome.format,
        ...(input.declaredType === undefined ? {} : { declaredType: input.declaredType }),
      });
      const unchanged = !outcome.converted && header[1]!.toLowerCase() === outcome.mediaType;
      return {
        type: 'imageResized',
        resized: unchanged ? input.image : `data:${outcome.mediaType};base64,${uint8ArrayToBase64(outcome.bytes)}`,
      };
    },
  });

/** The production image step: converts through the page's shared attachment image service. */
export const resizeImageActor = createResizeImageActor();
