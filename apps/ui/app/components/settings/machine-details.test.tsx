// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MachineProvider } from '@taucad/runtime/machine';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MachineDetails } from '#components/settings/machine-details.js';
import { simulatorProvider, x1cProvider } from '#components/settings/machine-details.fixture.js';
import { providerFor, routerManifest } from '#components/print/testing/machines.fixture.js';

const renderDetails = (provider: MachineProvider, firmware: string): void => {
  render(
    <TooltipProvider>
      <MachineDetails provider={provider} machineId='workshop-x1c' firmware={firmware} />
    </TooltipProvider>,
  );
};

/** Open one part by the title its folded row starts with; the part's region is named by that row. */
const openPart = (title: string): HTMLElement => {
  const trigger = screen.getByRole('button', { name: new RegExp(`^${title} `, 'u') });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return screen.getByRole('region', { name: trigger.textContent });
};

/** Every fact of an open part as `label: value` lines. */
const factsOf = (part: HTMLElement): string[] => {
  const values = within(part).getAllByRole('definition');
  return within(part)
    .getAllByRole('term')
    .map((term, index) => `${term.textContent}: ${values[index]?.textContent ?? ''}`);
};

describe('MachineDetails', () => {
  it('should fold every part of the manifest behind a one-line summary', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const parts = screen.getAllByRole('button');
    expect(parts.map((part) => part.textContent)).toEqual([
      'Identity and firmware Firmware 01.08.02.00',
      'Qualification profiles 1 profile',
      'Connection Network · Authenticated',
      'Axes X, Y, Z',
      'Components 12 components',
      'Processes FFF 256 × 256 × 256 mm · CoreXY',
      'Jobs Stored · Started by Tau',
      'Stop Motion halts at once, heaters turn off, the position is kept.',
      'Controls 3 qualified · 14 designed',
      'Observation freshness 4 groups · 15 s to 30 s',
      'Binding settings 1 field · Read-only',
      'Job options 10 fields · Set per job',
    ]);
    for (const part of parts) {
      expect(part).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
  });

  it('should show the connection, axes and every component with its nozzles and material units', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    expect(factsOf(openPart('Connection'))).toEqual([
      'Transport: Network',
      'One host at a time: No',
      'Connecting: Changes nothing',
      'Identity: Authenticated',
    ]);
    expect(factsOf(openPart('Axes'))).toEqual([
      'X: Linear, 0 to 256 mm, moves the tool x',
      'Y: Linear, 0 to 256 mm, moves the tool y',
      'Z: Linear, 0 to 256 mm, moves the work z',
    ]);
    const components = factsOf(openPart('Components'));
    expect(components).toContain('Toolhead: Toolhead, 1 nozzle tool-0');
    expect(components).toContain('Nozzle 0.4 mm: Hardened steel, up to 300 °C nozzle-0');
    expect(components).toContain('Bed: Heater bed');
    expect(components).toContain('Filament: Material system, 2 units filament');
    expect(components).toContain('AMS: Feeder, A1, A2, A3, A4 ams-a');
    expect(components).toContain('External spool: External holder, Ext external');
  });

  it('should show the FFF process geometry, plates, speeds and slicing defaults', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const facts = factsOf(openPart('Processes'));
    expect(facts.slice(0, 8)).toEqual([
      'Build volume: 256 × 256 × 256 mm',
      'Outer size: 389 × 389 × 457 mm',
      'Enclosure: Enclosed',
      'Doors: Front, Top',
      'Kinematics: CoreXY',
      'Bed motion: Bed moves on Z',
      'Origin: Front-left corner',
      'Toolhead home: X 128 · Y 256 · Z 256 mm',
    ]);
    expect(facts).toContain('Bed maximum temperature: 120 °C');
    expect(facts).toContain('Textured PEI plate: textured-pei');
    expect(facts).toContain('Ludicrous speed: 166% ludicrous');
    expect(facts).toContain('Fine preset: 0.12 mm layers fine');
  });

  it('should show how jobs reach the machine and what Stop does before anything is pressed', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    expect(factsOf(openPart('Jobs'))).toEqual([
      'Delivery: Stored on the machine',
      'Start: Tau starts the run',
      'Accepts: application/vnd.bambulab.gcode-3mf',
      'Who may start: A person, or an agent a person approved',
      'Vouched before a start: The build plate is clear',
    ]);
    const stop = openPart('Stop');
    expect(factsOf(stop)).toEqual([
      'What Stop does: Motion halts at once, heaters turn off, the position is kept.',
      'Recovery: None needed',
    ]);
    expect(stop).toHaveTextContent('not a safety-rated emergency stop');
  });

  it('should show a streamed, at-machine milling machine with its work area and its own job form', () => {
    renderDetails(providerFor('grbl', routerManifest), '1.1h');

    expect(screen.getByRole('button', { name: /^Processes / })).toHaveTextContent('Milling, 3-axis');
    expect(factsOf(openPart('Processes'))).toEqual([
      'Simultaneous axes: 3',
      'Features: Arcs',
      'Work offsets: G54, G55, G56, G57, G58, G59',
      'Work area: 810 × 855 × 120 mm',
    ]);
    const jobs = factsOf(openPart('Jobs'));
    expect(jobs).toContain('Delivery: Streamed by this computer, which must stay connected until the run ends');
    expect(jobs).toContain('Start: A person presses start at the machine');
    expect(jobs).toContain('Who may start: A person only, at the machine');
    expect(factsOf(openPart('Stop'))[0]).toBe(
      'What Stop does: Motion slows to a stop, the spindle stops, the position is kept.',
    );
    expect(screen.getByRole('button', { name: /^Job options / })).toHaveTextContent('1 field');
  });

  it('should mark every control with its qualification, its reason or evidence, and who may use it', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const controls = openPart('Controls');
    expect(controls).toHaveTextContent('Designed controls can be tried by a person while Testing is on');
    const rows = within(within(controls).getByRole('list', { name: 'Controls' }))
      .getAllByRole('listitem')
      .map((row) => row.textContent);
    expect(rows).toContain(
      'Pause Qualified run.pause on Printer · Run · Anyone, including an agent · Proven in x1c-hardware-2026-10',
    );
    expect(rows).toContain(
      'Part fan Designed, not yet qualified level.set on Part fan · A person, or an agent a person approved · Takes ratio · Not yet qualified on this hardware.',
    );
    expect(rows).toContain(
      'Answer the filament check Designed, not yet qualified interaction.respond on Filament · A person only · Takes activityId, answer, promptId · Not yet qualified on this hardware.',
    );
    expect(within(controls).getAllByText('Qualified')).toHaveLength(3);
    expect(within(controls).getAllByText('Designed, not yet qualified')).toHaveLength(14);
  });

  it('should list each observation group with its staleness budget', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    expect(factsOf(openPart('Observation freshness'))).toEqual([
      'State: Stale after 15 s',
      'Temperatures: Stale after 15 s',
      'Material: Stale after 30 s',
      'Accessories: Stale after 30 s',
    ]);
  });

  it('should mark firmware a qualification profile covers and list the profiles', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const identity = factsOf(openPart('Identity and firmware'));
    expect(identity).toContain('Model: Bambu Lab X1 Carbon');
    expect(identity).toContain('Firmware: 01.08.02.00 Qualified in x1c-hardware-2026-10');
    expect(identity).not.toContain('Hardware: Simulated, no machine attached');
    expect(factsOf(openPart('Qualification profiles'))).toEqual([
      'x1c-hardware-2026-10: Hardware · X1C · Firmware 01.08.02.00 · Operator runs on the workshop X1C, October 2026.',
    ]);
  });

  it('should say when no profile covers the reported firmware', () => {
    renderDetails(x1cProvider, '01.09.00.00');

    expect(factsOf(openPart('Identity and firmware'))).toContain(
      'Firmware: 01.09.00.00 Not in a qualification profile',
    );
  });

  it('should label the simulator and qualify its firmware only in simulation', () => {
    renderDetails(simulatorProvider, 'simulator-1');

    const identity = factsOf(openPart('Identity and firmware'));
    expect(identity).toContain('Model: Bambu Lab Simulated X1C');
    expect(identity).toContain('Hardware: Simulated, no machine attached');
    expect(identity).toContain('Firmware: simulator-1 Qualified in simulation');
    expect(identity).toContain('Provider: Simulated X1C bambu-simulator 1.0.0');
    expect(identity).toContain('Machine id: workshop-x1c');
    expect(factsOf(openPart('Qualification profiles'))[0]).toMatch(/^simulation: Simulation · X1C/u);
  });

  it('should render the binding configuration read-only from its JSON Structure declaration', async () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const binding = openPart('Binding settings');
    expect(binding).toHaveTextContent('Declared by bambu.machine.binding 2.0.0');
    expect(binding).not.toHaveTextContent('Only the simulator reads these');
    const serial = await within(binding).findByRole('textbox', { name: 'Input for Serial' });
    expect(
      within(binding)
        .getAllByRole('textbox')
        .map((input) => input.getAttribute('aria-label')),
    ).toEqual(['Input for Serial']);
    for (const input of within(binding).getAllByRole('textbox')) {
      expect(input).toHaveAttribute('readonly');
    }
    expect(within(binding).queryByRole('button', { name: /^Reset/u })).not.toBeInTheDocument();
    fireEvent.change(serial, { target: { value: 'renamed' } });
    expect(serial).toHaveValue('');
  });

  it("should show the simulator's binding fields as demo settings, read-only", async () => {
    renderDetails(simulatorProvider, 'simulator-1');

    const binding = openPart('Binding settings');
    expect(binding).toHaveAccessibleName('Binding settings 1 field · Read-only');
    expect(binding).toHaveTextContent('Only the simulator reads these; they are not machine settings.');
    expect(binding).toHaveTextContent('Declared by bambu.simulator.binding 1.1.0');
    /* The declaration titles the field and starts it at real time. */
    const speed = await within(binding).findByRole('spinbutton', { name: 'Input for Demo Speed' });
    expect(within(binding).getByLabelText('Parameter: Demo Speed')).toHaveTextContent('Demo Speed');
    expect(speed).toHaveAttribute('readonly');
    expect(speed).toHaveValue('1');
    expect(
      within(binding).getByText('Simulated seconds per real second, so a long print can be watched in minutes'),
    ).toBeInTheDocument();
  });

  it('should render the job options from the manifest with their declared defaults, locked and without growth', async () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const options = openPart('Job options');
    expect(options).toHaveTextContent('Declared by fixture.submission 1.3.0');
    const bedLeveling = await within(options).findByRole('switch', { name: 'Toggle for Bed Leveling' });
    expect(bedLeveling).toBeChecked();
    expect(bedLeveling).toBeDisabled();
    expect(within(options).getByRole('switch', { name: 'Toggle for Flow Calibration' })).toBeChecked();
    expect(within(options).getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
    expect(within(options).getByRole('switch', { name: 'Toggle for Timelapse' })).toBeDisabled();
    for (const label of ['Expected Filament Diameter', 'Expected Nozzle Diameter']) {
      const diameter = within(options).getByRole('spinbutton', { name: `Input for ${label}` });
      expect(diameter).toHaveAttribute('readonly');
      expect(within(options).getByLabelText(`Parameter: ${label}`)).toHaveTextContent(label);
    }
    expect(options).not.toHaveTextContent('Kind');
    expect(options).not.toHaveTextContent('Space');
    expect(within(options).queryByRole('button', { name: /^Add/u })).not.toBeInTheDocument();
    expect(within(options).queryByRole('button', { name: /^Reset/u })).not.toBeInTheDocument();
    fireEvent.click(within(options).getByRole('switch', { name: 'Toggle for Timelapse' }));
    expect(within(options).getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
  });
});
