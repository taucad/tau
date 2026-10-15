// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RequestJobOutput, ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolRequestJob } from '#routes/w.$workspace.$project/chat-message-tool-request-job.js';

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError: ({ errorText, noun }: { readonly errorText: string; readonly noun: string }) => (
    <div role='alert'>
      {noun}: {errorText}
    </div>
  ),
}));

type RequestJobInvocation = ToolInvocation<typeof toolName.requestJob>;

const settled = (job: Partial<RequestJobOutput['job']>, output: Partial<RequestJobOutput>): RequestJobInvocation => ({
  toolCallId: 'job-1',
  state: 'output-available',
  input: { machineId: 'workshop-x1c', targetFile: 'main.scad' },
  output: {
    job: {
      jobId: 'job-1',
      machineId: 'workshop-x1c',
      state: 'started',
      program: { name: 'pyramid.gcode.3mf', facts: { process: 'fff', layers: 150 } },
      ...job,
    },
    ...output,
  },
});

/** The header reads as one phrase; its verb and detail are separate spans. */
const phraseOf = (verb: string): string | undefined => screen.getByText(verb).parentElement?.textContent ?? undefined;

afterEach(cleanup);

describe('ChatMessageToolRequestJob', () => {
  it('should name the file and machine of a print the person accepted', () => {
    render(
      <ChatMessageToolRequestJob
        part={settled({ state: 'started' }, { machineName: 'Workshop X1C', approval: 'approved' })}
      />,
    );

    expect(phraseOf('Printing')).toBe('Printing pyramid.gcode.3mf on Workshop X1C');
    /* The decision was the banner's; the record offers nothing to press. */
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should say Running for a started job on a machine that does not print', () => {
    render(
      <ChatMessageToolRequestJob
        part={settled(
          { state: 'started', program: { name: 'sign.nc', facts: { process: 'milling' } } },
          { machineName: 'Garage LongMill' },
        )}
      />,
    );

    expect(phraseOf('Running')).toBe('Running sign.nc on Garage LongMill');
  });

  it('should say a simulated job ran on a simulator, and a real one nothing of the kind', () => {
    const { rerender } = render(
      <ChatMessageToolRequestJob
        part={settled({ state: 'started' }, { machineName: 'Workshop X1C', simulated: true })}
      />,
    );
    expect(phraseOf('Printing')).toBe('Printing pyramid.gcode.3mf on Workshop X1C (simulated)');

    rerender(
      <ChatMessageToolRequestJob
        part={settled({ state: 'started' }, { machineName: 'Workshop X1C', simulated: false })}
      />,
    );
    expect(phraseOf('Printing')).toBe('Printing pyramid.gcode.3mf on Workshop X1C');
  });

  it('should record a declined job as a decision, naming the machine by id when no name came back', () => {
    render(<ChatMessageToolRequestJob part={settled({ state: 'denied' }, { approval: 'denied' })} />);

    expect(phraseOf('Job declined')).toBe('Job declined · pyramid.gcode.3mf on workshop-x1c');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should say where a job waits when the host returned it for the Print pane', () => {
    render(
      <ChatMessageToolRequestJob part={settled({ state: 'awaiting-approval' }, { machineName: 'Workshop X1C' })} />,
    );

    expect(phraseOf('Job requested')).toBe(
      'Job requested · pyramid.gcode.3mf on Workshop X1C · waiting for approval in the Print pane',
    );
  });

  it('should keep an unconfirmed start open on what to do next', () => {
    render(<ChatMessageToolRequestJob part={settled({ state: 'unknown' }, { machineName: 'Workshop X1C' })} />);

    expect(
      screen.getByRole('button', { name: 'Start not confirmed · pyramid.gcode.3mf on Workshop X1C' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText(
        "The machine hasn't confirmed the start. Check the machine; Tau updates this when the machine reports the run.",
      ),
    ).toBeVisible();
    /* Whether it prints is unknown, so nothing invites a second start. */
    expect(screen.queryByText(/try again/iu)).not.toBeInTheDocument();
  });

  it.each<
    Readonly<{
      scenario: string;
      state: 'rejected' | 'failed';
      failure: { code: string; message: string };
      reason: string;
    }>
  >([
    {
      scenario: 'put a bare rejection reason after the outcome',
      state: 'rejected',
      failure: { code: 'PROVIDER_REJECTED', message: 'provider-rejected' },
      reason: 'The machine rejected the start (provider-rejected).',
    },
    {
      scenario: 'put a bare failure code after the outcome',
      state: 'failed',
      failure: { code: 'MACHINE_UPLOAD_TRANSFER_MISMATCH', message: 'MACHINE_UPLOAD_TRANSFER_MISMATCH' },
      reason: 'The job failed (MACHINE_UPLOAD_TRANSFER_MISMATCH).',
    },
    {
      scenario: "show the provider's own reason, remedy included, as it gave it",
      state: 'rejected',
      failure: { code: 'PROVIDER_REJECTED', message: 'The printer refused the command. Turn on Developer Mode.' },
      reason: 'The printer refused the command. Turn on Developer Mode.',
    },
  ])('should $scenario', ({ state, failure, reason }) => {
    render(<ChatMessageToolRequestJob part={settled({ state, failure }, { machineName: 'Workshop X1C' })} />);

    expect(screen.getByText(reason)).toBeVisible();
  });

  it('should show the reason the ledger gives when a job failed', () => {
    render(
      <ChatMessageToolRequestJob
        part={settled(
          { state: 'failed', failure: { code: 'MACHINE_BUSY', message: 'The printer is already printing.' } },
          { machineName: 'Workshop X1C' },
        )}
      />,
    );

    expect(screen.getByRole('button', { name: 'Job failed · pyramid.gcode.3mf on Workshop X1C' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('The printer is already printing.')).toBeVisible();
  });

  it('should show the file being requested while it slices and waits', () => {
    render(
      <ChatMessageToolRequestJob
        part={{
          toolCallId: 'job-1',
          state: 'input-available',
          input: { machineId: 'workshop-x1c', targetFile: 'main.scad' },
        }}
      />,
    );

    expect(phraseOf('Requesting')).toBe('Requesting a job for main.scad');
  });

  it('should name a finished program the agent sends as is', () => {
    render(
      <ChatMessageToolRequestJob
        part={{ toolCallId: 'job-1', state: 'input-available', input: { artifact: 'out/bracket.gcode' } }}
      />,
    );

    expect(phraseOf('Requesting')).toBe('Requesting a job for out/bracket.gcode');
  });

  it('should hand a failure to the shared tool error with its noun', () => {
    render(
      <ChatMessageToolRequestJob
        part={{
          toolCallId: 'job-1',
          state: 'output-error',
          input: { machineId: 'workshop-x1c', targetFile: 'main.scad' },
          errorText: 'No machine is bound to this workspace; the person binds one in the Print pane.',
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'job request: No machine is bound to this workspace; the person binds one in the Print pane.',
    );
  });
});
