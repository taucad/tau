/**
 * Subscribes to one composer record actor's failure emits and surfaces them as
 * toasts. This is the **only** site in the app that toasts on composer
 * persistence failures — before the record machine, every write region in
 * `apps/ui` discarded its rejection with `onError: 'idle'`, so a draft that
 * never reached disk looked exactly like one that did.
 *
 * Each record gets one stable toast id, so a failing write that retries five
 * times replaces its own toast instead of stacking five, and `writeRecovered`
 * replaces it with the success rather than leaving a stale alarm on screen.
 */

import { useEffect } from 'react';
import { toast } from '#components/ui/sonner.js';
import type { ComposerRecordRef } from '#hooks/composer-record.js';

export function useComposerRecordToasts(recordRef: ComposerRecordRef): void {
  useEffect(() => {
    // One id per actor: two open records never dedupe into each other's toast.
    const writeId = `composer-record-write-${recordRef.sessionId}`;
    const readId = `composer-record-read-${recordRef.sessionId}`;

    const subscriptions = [
      recordRef.on('writeFailed', (event) => {
        toast.error('Could not save your draft', { id: writeId, description: event.error.message });
      }),
      recordRef.on('writeStalled', () => {
        toast.error('Your draft is not being saved', {
          id: writeId,
          description: 'Keep typing to try again — what you have written is still here.',
        });
      }),
      recordRef.on('writeRecovered', () => {
        toast.success('Draft saved', { id: writeId });
      }),
      recordRef.on('recordUnreadable', (event) => {
        toast.error('Could not restore your draft', { id: readId, description: event.error.message });
      }),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    };
  }, [recordRef]);
}
