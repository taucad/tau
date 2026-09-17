// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createActor } from 'xstate';
import { draftMachine } from '#hooks/draft.machine.js';
import type { DraftAttachmentModel } from '#hooks/draft.machine.js';
import { useDraftImageErrorToast } from '#hooks/use-draft-image-error-toast.js';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('#components/ui/sonner.js', () => ({ toast: { error: toastError } }));

const textOnly: DraftAttachmentModel = {
  name: 'Text Model',
  support: { modalities: { input: ['text'], output: ['text'] } },
};

const startDraft = () => {
  const actor = createActor(draftMachine, { input: {} });
  actor.start();
  return actor;
};

describe('useDraftImageErrorToast', () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it('should toast once, naming the model, when the model refuses a PDF', () => {
    const actor = startDraft();
    renderHook(() => {
      useDraftImageErrorToast(actor);
    });

    actor.send({ type: 'addDraftAttachment', dataUrl: 'data:application/pdf;base64,JVBERi0=', model: textOnly });

    expect(toastError).toHaveBeenCalledExactlyOnceWith("Text Model can't read PDFs", {
      description: 'Pick a model that can, or continue without this file.',
    });
    actor.stop();
  });

  it('should toast once with the reason when an attachment cannot be stored', () => {
    const actor = startDraft();
    renderHook(() => {
      useDraftImageErrorToast(actor);
    });

    actor.send({ type: 'addDraftAttachment', dataUrl: 'not a data url', model: textOnly });

    expect(toastError).toHaveBeenCalledExactlyOnceWith("Couldn't attach file", {
      description: 'The attachment is not a base64 data URL.',
    });
    actor.stop();
  });

  it('should stop toasting after unmount', () => {
    const actor = startDraft();
    const { unmount } = renderHook(() => {
      useDraftImageErrorToast(actor);
    });
    unmount();

    actor.send({ type: 'addDraftAttachment', dataUrl: 'not a data url', model: textOnly });

    expect(toastError).not.toHaveBeenCalled();
    actor.stop();
  });
});
