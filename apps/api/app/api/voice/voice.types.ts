/** A streamed transcription step; `done` carries the provider's authoritative text. */
export type TranscriptionEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'done'; readonly text: string };

/**
 * A speech-to-text vendor behind `/v1/voice`. Its credential stays on the server;
 * a new vendor implements this and joins {@link transcriptionProvidersKey} without UI changes.
 */
export type TranscriptionProvider = {
  /** Stable vendor id reported by the status route. */
  readonly id: string;
  isConfigured(): boolean;
  transcribe(input: {
    readonly audio: Uint8Array<ArrayBuffer>;
    readonly contentType: string;
    readonly signal: AbortSignal;
  }): AsyncIterable<TranscriptionEvent>;
};

/** The vendor refused or failed a recording; `status` is the upstream HTTP status. */
export class TranscriptionProviderError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TranscriptionProviderError';
  }
}

/** Ordered providers; the first configured one serves dictation. */
export const transcriptionProvidersKey = Symbol('transcriptionProviders');
