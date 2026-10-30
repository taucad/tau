/**
 * Ask what the person was doing when the page died (browser observability SB12, D9).
 *
 * Tau detects the kill on the next load but has nothing from the moment itself: the page ran no
 * JavaScript on the way out. This is the one surface where the person's own words can reach that
 * kill's event, beside the memory sample and the breadcrumb trail an engineer reads.
 *
 * It is voluntary and quiet: offered once per tab, only for a kill they were looking at and never
 * during a kill loop (`#lib/crash-feedback`), dismissible, with an email field that is optional and
 * empty by default. Nothing is collected automatically and no screenshot is taken — the screen after
 * a reload shows nothing useful and could carry private model or file content. Ordinary errors keep
 * the error page and toasts.
 */

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Textarea } from '@taucad/ui/components/textarea';
import {
  crashFeedbackMessageLimit,
  dismissCrashFeedback,
  readCrashFeedbackOffer,
  submitCrashFeedback,
  subscribeCrashFeedback,
} from '#lib/crash-feedback.js';

const noOffer = (): undefined => undefined;

/**
 * The prompt, shown while a kill is standing to be asked about.
 *
 * @returns The prompt, or nothing when there is nothing to ask about.
 */
export function CrashReportPrompt(): React.JSX.Element | undefined {
  const offer = useSyncExternalStore(subscribeCrashFeedback, readCrashFeedbackOffer, noOffer);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const headingId = useId();
  const messageId = useId();
  const emailId = useId();
  const promptReference = useRef<HTMLElement>(null);

  useEffect(() => {
    const prompt = promptReference.current;
    // The browser's top layer sits above every z-index, including the editor's mobile tab bar.
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- DOM types claim showPopover is always there; jsdom and older browsers omit it
    if (prompt?.showPopover !== undefined && !prompt.matches(':popover-open')) {
      prompt.showPopover();
    }
  }, [offer]);

  if (offer === undefined) {
    return undefined;
  }

  const send = async (): Promise<void> => {
    setSending(true);
    await submitCrashFeedback({ message, email });
  };

  return (
    <section
      ref={promptReference}
      popover='manual'
      aria-labelledby={headingId}
      className='fixed inset-x-4 top-auto bottom-4 z-50 mx-auto my-0 flex h-auto w-auto max-w-md flex-col gap-3 overflow-visible rounded-md border bg-background p-4 text-foreground shadow-lg'
    >
      <h2 id={headingId} className='text-sm font-medium'>
        Tau reloaded because the page ran out of memory
      </h2>
      <p className='text-sm text-muted-foreground'>Telling us what you were doing helps us fix it. This is optional.</p>
      <Label htmlFor={messageId} className='text-sm'>
        What were you doing?
      </Label>
      <Textarea
        id={messageId}
        value={message}
        maxLength={crashFeedbackMessageLimit}
        rows={3}
        placeholder='Rendering a large assembly, exporting a STEP file…'
        onChange={(event) => {
          setMessage(event.target.value);
        }}
      />
      <Label htmlFor={emailId} className='text-sm'>
        Email, if you would like a reply (optional)
      </Label>
      <Input
        id={emailId}
        type='email'
        value={email}
        autoComplete='email'
        onChange={(event) => {
          setEmail(event.target.value);
        }}
      />
      <div className='flex justify-end gap-2'>
        <Button size='sm' variant='ghost' onClick={dismissCrashFeedback}>
          Not now
        </Button>
        <Button
          size='sm'
          disabled={message.trim() === '' || sending}
          onClick={() => {
            // async-iife: bootstrap -- the prompt closes on its own once the answer is handed over.
            void send();
          }}
        >
          Send
        </Button>
      </div>
    </section>
  );
}
