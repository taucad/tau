import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dictationMaxAudioBytes } from '@taucad/chat/schemas';
import { captureDictation } from '#components/chat/dictation-capture.js';
import type { DictationCapture } from '#components/chat/dictation-capture.js';
import { fetchDictationStatus, transcribeDictation } from '#components/chat/dictation-client.js';

export type DictationPhase = 'idle' | 'requesting' | 'recording' | 'stopping' | 'transcribing';

export const dictationLabels: Record<DictationPhase, string> = {
  idle: 'Dictate',
  requesting: 'Requesting microphone…',
  recording: 'Recording…',
  stopping: 'Stopping dictation…',
  transcribing: 'Transcribing…',
};

/** Samples the API accepts: 24 kHz mono PCM16 after the 44-byte WAV header (about 8.6 minutes). */
const maxDictationSamples = Math.floor((dictationMaxAudioBytes - 44) / 2);

type Session = {
  readonly owner: unknown;
  readonly abort: AbortController;
  readonly done: Promise<boolean>;
  readonly settle: (success: boolean) => void;
  capture?: DictationCapture;
  phase: DictationPhase;
};

export type Dictation = {
  /** Whether the Tau API offers dictation to this user; undefined while checking. */
  readonly available: boolean | undefined;
  readonly phase: DictationPhase;
  readonly error: string | undefined;
  /** Streamed text while the provider transcribes; replaced by the final transcript. */
  readonly transcript: string;
  readonly levels: readonly number[];
  start(): Promise<void>;
  stop(): Promise<boolean>;
  cancel(): void;
};

/** One microphone recording per composer, transcribed by the Tau API; pending text never mutates the draft. */
export function useDictation(onTranscript: (text: string) => void, draftOwner: unknown): Dictation {
  const [available, setAvailable] = useState<boolean>();
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [error, setError] = useState<string>();
  const [transcript, setTranscript] = useState('');
  const [levels, setLevels] = useState<readonly number[]>([]);
  const current = useRef<Session | undefined>(undefined);

  useEffect(() => {
    const abort = new AbortController();
    const check = async (): Promise<void> => {
      try {
        const status = await fetchDictationStatus(abort.signal);
        setAvailable(status.available);
      } catch {
        if (!abort.signal.aborted) {
          setAvailable(false);
        }
      }
    };
    // async-iife: bootstrap
    void check();
    return () => {
      abort.abort();
    };
  }, []);

  const reset = useCallback((session: Session, success: boolean, message?: string): void => {
    if (current.current !== session) {
      return;
    }
    current.current = undefined;
    session.abort.abort();
    session.capture?.cancel();
    session.settle(success);
    setPhase('idle');
    setTranscript('');
    setLevels([]);
    setError(message);
  }, []);

  const cancel = useCallback((): void => {
    if (current.current) {
      reset(current.current, false);
    }
  }, [reset]);

  useLayoutEffect(() => {
    return () => {
      const session = current.current;
      if (session && session.owner === draftOwner) {
        reset(session, false);
      }
    };
  }, [draftOwner, reset]);

  const transcribe = useCallback(
    async (session: Session): Promise<void> => {
      try {
        const wav = await session.capture!.finish();
        if (current.current !== session) {
          return;
        }
        session.phase = 'transcribing';
        setPhase('transcribing');
        const final = await transcribeDictation(wav, {
          signal: session.abort.signal,
          onPreview: (preview) => {
            if (current.current === session) {
              setTranscript(preview);
            }
          },
        });
        const text = final.trim();
        if (current.current !== session) {
          return;
        }
        if (text === '') {
          reset(session, false, 'No speech was recognized. Check your microphone and try again.');
          return;
        }
        onTranscript(text);
        reset(session, true);
      } catch (stopError) {
        if (!session.abort.signal.aborted) {
          reset(
            session,
            false,
            stopError instanceof Error ? stopError.message : 'Could not finish dictation. Try again.',
          );
        }
      }
    },
    [onTranscript, reset],
  );

  const stop = useCallback(async (): Promise<boolean> => {
    const session = current.current;
    if (!session) {
      return false;
    }
    if (session.phase === 'recording') {
      session.phase = 'stopping';
      setPhase('stopping');
      void transcribe(session);
    }
    return session.phase === 'requesting' ? false : session.done;
  }, [transcribe]);

  const start = useCallback(async (): Promise<void> => {
    if (current.current !== undefined || !available) {
      return;
    }
    let settle: (success: boolean) => void = () => undefined;
    const done = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const session: Session = { owner: draftOwner, abort: new AbortController(), done, settle, phase: 'requesting' };
    current.current = session;
    setError(undefined);
    setTranscript('');
    setLevels([]);
    setPhase('requesting');
    try {
      session.capture = await captureDictation({
        signal: session.abort.signal,
        maxSamples: maxDictationSamples,
        onLevel: (level) => {
          if (current.current === session) {
            setLevels((previous) => [...previous.slice(-79), level]);
          }
        },
        onLimit: () => {
          void stop();
        },
        onError: (captureError) => {
          reset(session, false, captureError.message);
        },
      });
      if (current.current !== session) {
        session.capture.cancel();
        return;
      }
      session.phase = 'recording';
      setPhase('recording');
    } catch (captureError) {
      const message =
        captureError instanceof DOMException && captureError.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access in system settings and try again.'
          : captureError instanceof Error
            ? captureError.message
            : 'Could not start dictation. Check your microphone and try again.';
      reset(session, false, message);
    }
  }, [available, draftOwner, reset, stop]);

  return { available, phase, error, transcript, levels, start, stop, cancel };
}
