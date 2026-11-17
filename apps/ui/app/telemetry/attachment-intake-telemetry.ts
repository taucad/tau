/**
 * The composer's one attachment intake counter (blueprint R7): what happened to each picked, dropped or pasted file,
 * the format its bytes hold and the type the file declared. It never carries a file name, a size or any byte.
 *
 * Intake runs outside the React tree (the draft machine's image step) as well as inside it, so the counter reports
 * through a capture the analytics boundary connects while it admits analytics, as the onboarding baseline does.
 * Nothing is captured while analytics are not admitted.
 *
 * @module
 */

import type { AttachmentRefusalReason } from '@taucad/agent-host/wire';
import { imageFormats } from '@taucad/utils/image-probe';
import type { ImageFormat } from '@taucad/utils/image-probe';

/* eslint-disable @typescript-eslint/naming-convention -- event and property names are analytics wire names. */

/** The counter's event name. */
export const attachmentIntakeEventName = 'chat_attachment_intake';

/**
 * What happened to one file: stored as it was, converted to a stored type, or refused for a reason in the storage
 * policy's vocabulary.
 */
export type AttachmentIntakeOutcome = 'stored' | 'converted' | 'refused';

/** One counted intake. */
export type AttachmentIntakeRecord = {
  readonly outcome: AttachmentIntakeOutcome;
  /** Why it was refused; present only for `refused`. */
  readonly reason?: AttachmentRefusalReason;
  /** The format its bytes hold, when they were read and recognised. */
  readonly format?: ImageFormat | 'pdf';
  /** The file's `type` as the browser reported it. Reduced to a closed value before it is sent. */
  readonly declaredType?: string;
};

/** The properties the counter sends. */
type AttachmentIntakeProperties = {
  readonly outcome: AttachmentIntakeOutcome;
  readonly reason?: AttachmentRefusalReason;
  readonly probed_format: ImageFormat | 'pdf' | 'unknown';
  readonly declared_type: string;
};

/** Captures one event and says whether it did. */
export type AttachmentIntakeCapture = (event: string, properties: Readonly<Record<string, unknown>>) => boolean;

let capture: AttachmentIntakeCapture | undefined;

/** Declared types sent as they are: the media type of every format the probe knows, the PDF type and the JPEG aliases. */
const knownDeclaredTypes: ReadonlySet<string> = new Set([
  ...Object.values(imageFormats).map(({ mediaType }) => mediaType),
  'application/pdf',
  'image/jpg',
  'image/pjpeg',
  'image/heif',
]);

/**
 * Reduce a declared type to a closed value, so a free-form string never leaves the device.
 *
 * @param declaredType - The file's `type`.
 * @returns The type itself when it is a known image or PDF type, `none` when it is empty or absent, else `other`.
 */
export const closedDeclaredType = (declaredType: string | undefined): string => {
  if (declaredType === undefined || declaredType === '') {
    return 'none';
  }
  const lower = declaredType.toLowerCase();
  return knownDeclaredTypes.has(lower) ? lower : 'other';
};

/**
 * Count one intake. A no-op until the analytics boundary connects a capture; never throws.
 *
 * @param record - What happened to the file.
 */
export const recordAttachmentIntake = (record: AttachmentIntakeRecord): void => {
  if (capture === undefined) {
    return;
  }
  const properties: AttachmentIntakeProperties = {
    outcome: record.outcome,
    ...(record.outcome === 'refused' && record.reason !== undefined ? { reason: record.reason } : {}),
    probed_format: record.format ?? 'unknown',
    declared_type: closedDeclaredType(record.declaredType),
  };
  try {
    capture(attachmentIntakeEventName, properties);
  } catch {
    // Optional analytics never break attaching a file.
  }
};

/**
 * Start counting through `next`; the analytics boundary calls this each time the host admits analytics.
 *
 * @param next - Captures one event and says whether it did.
 */
export const connectAttachmentIntakeTelemetry = (next: AttachmentIntakeCapture): void => {
  capture = next;
};

/** Stop counting; the analytics boundary calls this when analytics are withdrawn. */
export const disconnectAttachmentIntakeTelemetry = (): void => {
  capture = undefined;
};

/* eslint-enable @typescript-eslint/naming-convention -- restore application naming rules. */
