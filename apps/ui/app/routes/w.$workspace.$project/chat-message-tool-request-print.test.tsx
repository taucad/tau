// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { RequestPrintOutput, ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolRequestPrint } from '#routes/w.$workspace.$project/chat-message-tool-request-print.js';

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError: ({ errorText, noun }: { readonly errorText: string; readonly noun: string }) => (
    <div role='alert'>
      {noun}: {errorText}
    </div>
  ),
}));

type RequestPrintInvocation = ToolInvocation<typeof toolName.requestPrint>;

const settled = (
  request: Partial<RequestPrintOutput['request']>,
  output: Partial<RequestPrintOutput>,
): RequestPrintInvocation => ({
  toolCallId: 'print-1',
  state: 'output-available',
  input: { targetFile: 'main.scad' },
  output: {
    request: {
      requestId: 'print-1',
      machineId: 'workshop-x1c',
      state: 'started',
      summary: { fileName: 'pyramid.gcode.3mf', layers: 150 },
      ...request,
    },
    ...output,
  },
});

/** The header reads as one phrase; its verb and detail are separate spans. */
const phraseOf = (verb: string): string | undefined => screen.getByText(verb).parentElement?.textContent ?? undefined;

afterEach(cleanup);

describe('ChatMessageToolRequestPrint', () => {
  it('should name the file and machine of a print the person accepted', () => {
    render(
      <ChatMessageToolRequestPrint
        part={settled({ state: 'started' }, { machineName: 'Workshop X1C', approval: 'approved' })}
      />,
    );

    expect(phraseOf('Printing')).toBe('Printing pyramid.gcode.3mf on Workshop X1C');
    /* The decision was the banner's; the record offers nothing to press. */
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should record a declined request as a decision, naming the machine by id when no name came back', () => {
    render(<ChatMessageToolRequestPrint part={settled({ state: 'denied' }, { approval: 'denied' })} />);

    expect(phraseOf('Print declined')).toBe('Print declined · pyramid.gcode.3mf on workshop-x1c');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should say where a request waits when the host returned it for the Print pane', () => {
    render(
      <ChatMessageToolRequestPrint part={settled({ state: 'awaiting-approval' }, { machineName: 'Workshop X1C' })} />,
    );

    expect(phraseOf('Print requested')).toBe(
      'Print requested · pyramid.gcode.3mf on Workshop X1C · waiting for approval in the Print pane',
    );
  });

  it('should keep an unconfirmed start open on what to do next', () => {
    render(<ChatMessageToolRequestPrint part={settled({ state: 'unknown' }, { machineName: 'Workshop X1C' })} />);

    expect(
      screen.getByRole('button', { name: 'Start not confirmed · pyramid.gcode.3mf on Workshop X1C' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('The printer did not confirm the start. Check it in the Print pane before trying again.'),
    ).toBeVisible();
  });

  it('should show the reason the ledger gives when a print failed', () => {
    render(
      <ChatMessageToolRequestPrint
        part={settled(
          { state: 'failed', failure: { code: 'MACHINE_BUSY', message: 'The printer is already printing.' } },
          { machineName: 'Workshop X1C' },
        )}
      />,
    );

    expect(screen.getByRole('button', { name: 'Print failed · pyramid.gcode.3mf on Workshop X1C' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText('The printer is already printing.')).toBeVisible();
  });

  it('should show the file being requested while it slices and waits', () => {
    render(
      <ChatMessageToolRequestPrint
        part={{ toolCallId: 'print-1', state: 'input-available', input: { targetFile: 'main.scad' } }}
      />,
    );

    expect(phraseOf('Requesting')).toBe('Requesting a print of main.scad');
  });

  it('should hand a failure to the shared tool error with its noun', () => {
    render(
      <ChatMessageToolRequestPrint
        part={{
          toolCallId: 'print-1',
          state: 'output-error',
          input: { targetFile: 'main.scad' },
          errorText: 'No machine is bound to this workspace; the person binds one in the Print pane.',
        }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'print request: No machine is bound to this workspace; the person binds one in the Print pane.',
    );
  });
});
