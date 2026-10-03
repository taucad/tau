// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type {
  MachineAlertSnapshot,
  MachineClient,
  MachineDirectoryEntry,
  MachineRunSnapshot,
  PrintRequest,
} from '@taucad/runtime/machine';
import {
  MonitorSection,
  describeRun,
  describeStillFailure,
  runFileName,
} from '#routes/w.$workspace.$project/chat-print-monitor.js';
import {
  agentRequest,
  artifact,
  later,
  manifest,
  printing,
  timestamp,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';

afterEach(cleanup);

/** The printing fixture machine, observing exactly this run and these alerts. */
const observing = (
  run: MachineRunSnapshot,
  extra: Pick<MachineDirectoryEntry['snapshot'], 'activeRunId' | 'alerts'> = {},
): MachineDirectoryEntry => {
  const machine = printing();
  const { activeRunId: _activeRunId, ...snapshot } = machine.snapshot;
  return { ...machine, snapshot: { ...snapshot, ...extra, run } };
};

const renderMonitor = (machine: MachineDirectoryEntry, client: MachineClient = mock<MachineClient>()) =>
  render(<MonitorSection client={client} entry={machine} manifest={manifest} />);

/** The value beside a label, as the person reads the row, or nothing without the row. */
const rowValue = (label: string): string | undefined =>
  screen.queryByText(label)?.nextElementSibling?.textContent ?? undefined;

/** A request the host prepared: the printer runs its upload as `tau-<preparedId>`. */
const preparedFor = (preparedId: string): NonNullable<PrintRequest['prepared']> => ({
  preparedId,
  preparedDigest: artifact.digest,
  configurationDigest: artifact.digest,
  providerDataDigest: artifact.digest,
  setupDigest: artifact.digest,
  machineId: 'machine-1',
  physicalMachineId: 'physical-1',
  artifact,
  remoteName: `tau-${preparedId}.gcode.3mf`,
  parser: { id: 'bambu-gcode-3mf', version: '1' },
  preparedAt: timestamp,
  expiresAt: later,
});

const unconfirmedStart = agentRequest({
  state: 'unknown',
  prepared: preparedFor('3f2a9c'),
  receipt: {
    operationId: 'start-1',
    machineId: 'machine-1',
    kind: 'start',
    status: 'unknown',
    reason: 'reply-lost-after-possible-acceptance',
    observedAt: timestamp,
  },
});

describe('MonitorSection', () => {
  // The run block names the run by this file; Monitor no longer repeats it.
  describe('run file', () => {
    const member = '/data/Metadata/plate_1.gcode';

    it.each<
      Readonly<{
        scenario: string;
        run: MachineRunSnapshot;
        activeRunId?: string;
        requests: readonly PrintRequest[];
        fileName: string | undefined;
      }>
    >([
      {
        scenario: 'an unconfirmed Tau start by the run name the printer reports',
        run: { state: 'printing', name: 'tau-3f2a9c', file: member },
        activeRunId: '1834297113',
        requests: [unconfirmedStart],
        fileName: 'pyramid.gcode.3mf',
      },
      {
        scenario: 'a started request by its provider run id',
        run: { state: 'printing', name: 'Cube', file: member },
        activeRunId: 'provider-run-1',
        requests: [
          agentRequest({
            state: 'started',
            receipt: {
              operationId: 'start-1',
              machineId: 'machine-1',
              kind: 'start',
              status: 'accepted',
              providerRunId: 'provider-run-1',
              observedAt: timestamp,
            },
          }),
        ],
        fileName: 'pyramid.gcode.3mf',
      },
      {
        scenario: "a request by the upload name the simulator reports as the run's file",
        run: { state: 'printing', file: 'tau-3f2a9c.gcode.3mf' },
        activeRunId: 'start-1',
        requests: [unconfirmedStart],
        fileName: 'pyramid.gcode.3mf',
      },
      {
        scenario: "the printer's run name when no request uploaded the run",
        run: { state: 'printing', name: 'tau-3f2a9c', file: member },
        activeRunId: '1834297113',
        requests: [
          agentRequest({ state: 'unknown', prepared: preparedFor('other'), summary: { fileName: 'other.gcode.3mf' } }),
        ],
        fileName: 'tau-3f2a9c',
      },
      {
        scenario: 'a file that is not an archive member',
        run: { state: 'printing', file: 'benchy.gcode' },
        requests: [],
        fileName: 'benchy.gcode',
      },
      {
        scenario: 'no file when the printer names only an archive member',
        run: { state: 'printing', file: member },
        requests: [],
        fileName: undefined,
      },
    ])('should name $scenario', ({ run, activeRunId, requests, fileName }) => {
      expect(runFileName(observing(run, activeRunId === undefined ? {} : { activeRunId }), requests)).toBe(fileName);
    });
  });

  describe('stage', () => {
    it.each<readonly [string, string | undefined, string | undefined]>([
      ['the phrase the provider reports', 'Heating the bed', 'Heating the bed'],
      ['no row without a stage', undefined, undefined],
      ['no row for a bare stage number a saved snapshot may hold', '2', undefined],
    ])('should show %s', (_case, stage, shown) => {
      renderMonitor(observing({ state: 'printing', ...(stage === undefined ? {} : { stage }) }));

      expect(rowValue('Stage')).toBe(shown);
    });

    it.each<readonly [string, MachineRunSnapshot, string]>([
      [
        'calibration at layer 0 as preparing with its stage',
        { state: 'printing', currentLayer: 0, totalLayers: 64, stage: 'Calibrating extrusion', remainingSeconds: 1320 },
        'Preparing · Calibrating extrusion · 22 min left',
      ],
      [
        'the layer once printing starts',
        { state: 'printing', currentLayer: 4, totalLayers: 64, remainingSeconds: 960 },
        'Printing layer 4 of 64 · 16 min left',
      ],
      [
        'layer 0 without a stage phrase as printing',
        { state: 'printing', currentLayer: 0, totalLayers: 64, stage: '54' },
        'Printing layer 0 of 64',
      ],
    ])('should describe %s', (_case, run, line) => {
      expect(describeRun(observing(run))).toBe(line);
    });
  });

  describe('alerts', () => {
    const fatal: MachineAlertSnapshot = {
      code: '0300-0100-0001-0007',
      severity: 'fatal',
      message: "The printer's motion controller reported a fatal error.",
      reference: 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0300_0100_0001_0007',
    };
    const warning: MachineAlertSnapshot = {
      code: '0C00-0300-0003-000B',
      severity: 'warning',
      message: "The printer's camera and AI inspection raised a warning.",
      reference: 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/0C00_0300_0003_000B',
    };
    const printError: MachineAlertSnapshot = {
      code: '0300-400C',
      message: "The printer's motion controller reported a print error.",
    };
    const notice: MachineAlertSnapshot = { code: '0500-0400-0004-0001', severity: 'info' };

    it('should show one line per alert with its sentence, its code and a link to its help page', () => {
      renderMonitor(observing({ state: 'paused' }, { alerts: [fatal, warning, printError, notice] }));

      const alerts = screen.getByRole('alert', { name: 'Printer alerts' });
      const [first, second, third, fourth] = within(alerts).getAllByRole('listitem');
      expect(first).toHaveTextContent(
        "Fatal: The printer's motion controller reported a fatal error.0300-0100-0001-0007Look up 0300-0100-0001-0007",
      );
      expect(within(first!).getByRole('link', { name: `Look up ${fatal.code}` })).toHaveAttribute(
        'href',
        fatal.reference,
      );
      expect(within(second!).getByRole('link', { name: `Look up ${warning.code}` })).toHaveAttribute(
        'target',
        '_blank',
      );
      expect(second).toHaveTextContent(/^Warning: The printer's camera and AI inspection raised a warning\./u);
      /* A print error has no severity and no help page. */
      expect(third).toHaveTextContent("The printer's motion controller reported a print error.0300-400C");
      expect(within(third!).queryByRole('link')).not.toBeInTheDocument();
      expect(fourth).toHaveTextContent('Notice: The printer reported an alert.0500-0400-0004-0001');
    });

    it('should name a single alert and link only an https help page', () => {
      renderMonitor(
        observing({ state: 'printing' }, { alerts: [{ ...warning, reference: 'http://wiki.bambulab.com/en/x1' }] }),
      );

      const alert = screen.getByRole('alert', { name: 'Printer alert' });
      expect(alert).toHaveTextContent(warning.message!);
      expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
    });

    it('should show no alert notice without alerts', () => {
      renderMonitor(observing({ state: 'printing' }, { alerts: [] }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('still capture', () => {
    it('should explain a missing ffmpeg with how to install it instead of the code', async () => {
      const captureStill = vi.fn<MachineClient['captureStill']>(async () => {
        throw new Error('MACHINE_STILL_FFMPEG_MISSING');
      });
      const user = userEvent.setup();
      renderMonitor(observing({ state: 'printing' }), mock<MachineClient>({ captureStill }));

      await user.click(screen.getByRole('button', { name: 'Capture still' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Tau could not find ffmpeg, which capturing a still needs; install it (with Homebrew on macOS: brew install ffmpeg; on Windows: winget install ffmpeg), then capture again.',
      );
      expect(screen.queryByText(/MACHINE_STILL/u)).not.toBeInTheDocument();
      expect(captureStill).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-1' }));
    });
  });
});

describe('describeStillFailure', () => {
  /* Every fixed code a still capture can reject with: the camera leg, its connection and access code, and the host. */
  const stillCodes = [
    'MACHINE_STILL_FFMPEG_MISSING',
    'MACHINE_STILL_FFMPEG_FAILED',
    'MACHINE_STILL_AUTH_REJECTED',
    'MACHINE_SECRET_UNKNOWN',
    'MACHINE_TLS_PIN_MISMATCH',
    'MACHINE_CONNECT_FAILED',
    'MACHINE_CONNECT_TIMEOUT',
    'MACHINE_STILL_TIMEOUT',
    'MACHINE_STILL_STREAM_FAILED',
    'MACHINE_STILL_CAPTURE_FAILED',
    'MACHINE_STILL_TOO_LARGE',
    'MACHINE_STILL_INVALID',
    'MACHINE_STILL_PROXY_FAILED',
    'MACHINE_STILL_REQUEST_INVALID',
    'MACHINE_STILL_UNAVAILABLE',
    'MACHINE_STILL_RATE_LIMITED',
  ] as const;
  const generic = 'The camera could not capture a still; capture again in a moment.';

  it('should give every code a capture rejects with its own sentence, without the code', () => {
    const sentences = stillCodes.map((code) => describeStillFailure(new Error(code)));

    expect(new Set(sentences).size).toBe(stillCodes.length);
    for (const sentence of sentences) {
      expect(sentence).toMatch(/^[A-Z][^_]*\.$/u);
      expect(sentence).not.toContain(generic);
    }
  });

  it.each([
    [
      'a code a desktop shell wrapped in its own words',
      new Error('Error invoking remote method: Error: MACHINE_STILL_AUTH_REJECTED'),
    ],
    ['the error code field', Object.assign(new Error('Capture failed'), { code: 'MACHINE_STILL_AUTH_REJECTED' })],
  ])('should find %s', (_case, error) => {
    expect(describeStillFailure(error)).toBe(
      "The camera refused the printer's saved access code; bind it again in Settings under Printers with the access code shown on its screen.",
    );
  });

  it.each([
    ['an unknown code with the code', new Error('MACHINE_STILL_NEW_FAULT'), `${generic} (MACHINE_STILL_NEW_FAULT)`],
    [
      'a message that names no code with the message',
      new Error('Machine channel closed'),
      `${generic} (Machine channel closed)`,
    ],
    ['a blank message alone', new Error(' '), generic],
  ])('should keep a generic sentence for %s', (_case, error, sentence) => {
    expect(describeStillFailure(error)).toBe(sentence);
  });
});
