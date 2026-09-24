// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MachineProvider } from '@taucad/runtime/machine';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { MachineDetails } from '#components/settings/machine-details.js';
import { simulatorProvider, x1cProvider } from '#components/settings/machine-details.fixture.js';

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
  it('should fold every standard part of the manifest behind a one-line summary', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const parts = screen.getAllByRole('button');
    expect(parts.map((part) => part.textContent)).toEqual([
      'Identity and firmware Firmware 01.08.02.00',
      'Geometry 256 × 256 × 256 mm · CoreXY · Enclosed',
      'Toolhead and nozzles 0.4 mm nozzle · 1.75 mm filament',
      'Bed and plates 4 plates · up to 120 °C',
      'Chamber and fans Enclosed · Not heated · 3 fans',
      'Material system 1 unit × 4 slots · External spool',
      'Camera Stills and stream',
      'Storage Removable',
      'Network LAN mode',
      'Speed profiles 4 profiles · 50–166%',
      'Slicing profile 0.2 mm layers · Fast, Standard, Fine',
      'Actions 6 qualified · 8 designed · 2 unsupported',
      'Observation freshness 7 groups · 15 s to 2 min',
      'Binding settings 3 fields · Read-only',
      'Print options 10 fields · Set per print',
    ]);
    for (const part of parts) {
      expect(part).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
  });

  it('should show the exact declared geometry, toolhead, bed and chamber values when opened', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    expect(factsOf(openPart('Geometry'))).toEqual([
      'Build volume: 256 × 256 × 256 mm',
      'Outer size: 389 × 389 × 457 mm',
      'Enclosure: Enclosed',
      'Doors: Front, Top',
      'Kinematics: CoreXY',
      'Bed motion: Bed moves on Z',
      'Origin: Front-left corner',
      'Toolhead home: X 1 · Y 1 · Z 256 mm',
    ]);
    expect(factsOf(openPart('Toolhead and nozzles'))).toEqual([
      'Filament diameter: 1.75 mm',
      'Nozzle 0.4 mm: Hardened steel, up to 300 °C nozzle-0.4',
    ]);
    expect(factsOf(openPart('Bed and plates'))).toEqual([
      'Maximum temperature: 120 °C',
      'Cool plate: cool',
      'Engineering plate: engineering',
      'High temperature plate: high-temperature',
      'Textured PEI plate: textured-pei',
    ]);
    expect(factsOf(openPart('Chamber and fans'))).toEqual([
      'Enclosed: Yes',
      'Heated: No',
      'Light: Yes',
      'Part cooling fan: part',
      'Auxiliary fan: auxiliary',
      'Chamber fan: chamber',
    ]);
    expect(factsOf(openPart('Material system'))).toEqual([
      'Units: 1',
      'Slots per unit: 4',
      'External spool: Yes',
      'Drying: Supported',
      'Mount: On top',
    ]);
  });

  it('should mark every action with its effect, qualification and reason', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const list = within(openPart('Actions')).getByRole('list', { name: 'Actions' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((action) => action.textContent),
    ).toEqual([
      'Start print Qualified print.start · Print effect · Needs Approved print request, Idle machine, Setup unchanged since preparation',
      'Pause Qualified run.pause · Print effect · Needs Exact observed run',
      'Resume Qualified run.resume · Print effect · Needs Exact observed run',
      'Cancel Qualified run.cancel · Print effect · Needs Exact observed run',
      'Urgent stop Qualified run.urgent-stop · Print effect · Priority stop of the current run; not a certified emergency stop.',
      'Capture still Qualified camera.still · Observation · Needs Pinned camera trust',
      'Chamber light Designed, not yet qualified light.set · No physical effect · Takes on',
      'Speed profile Designed, not yet qualified speed.set · Motion effect · Takes profile',
      'Fan target Designed, not yet qualified fan.set · Thermal effect · Takes fan, percent',
      'Heater target Designed, not yet qualified temperature.set · Thermal effect · Takes heater, target',
      'Home axes Designed, not yet qualified motion.home · Motion effect · Needs No active run, Doors closed',
      'Jog axis Designed, not yet qualified motion.jog · Motion effect · Needs No active run, Homed axes · Takes axis, distance',
      'Load filament Designed, not yet qualified material.load · Material effect · Needs Nozzle at material temperature · Takes slot',
      'Unload filament Designed, not yet qualified material.unload · Material effect · Needs Nozzle at material temperature',
      'Run calibration Unsupported calibration.run · Motion effect · Named qualified procedures need their own charter slice.',
      'Format storage Unsupported storage.format · Storage effect · Destructive storage actions are outside this authority.',
    ]);
    expect(within(list).getAllByText('Qualified')).toHaveLength(6);
    expect(within(list).getAllByText('Designed, not yet qualified')).toHaveLength(8);
    expect(within(list).getAllByText('Unsupported')).toHaveLength(2);
  });

  it('should list each observation group with its staleness budget', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    expect(factsOf(openPart('Observation freshness'))).toEqual([
      'Temperatures: Stale after 15 s',
      'Run: Stale after 15 s',
      'Material system: Stale after 1 min',
      'Fans: Stale after 15 s',
      'Chamber light: Stale after 1 min',
      'Network: Stale after 1 min',
      'Removable storage: Stale after 2 min',
    ]);
  });

  it('should mark firmware the manifest qualifies', () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const identity = factsOf(openPart('Identity and firmware'));
    expect(identity).toContain('Model: Bambu Lab X1 Carbon');
    expect(identity).toContain('Firmware: 01.08.02.00 Qualified');
    expect(identity).not.toContain('Hardware: Simulated, no printer attached');
  });

  it('should qualify the reported firmware against the manifest and label the simulator', () => {
    renderDetails(simulatorProvider, 'simulator-1');

    const identity = factsOf(openPart('Identity and firmware'));
    expect(identity).toContain('Model: Bambu Lab Simulated X1C');
    expect(identity).toContain('Hardware: Simulated, no printer attached');
    expect(identity).toContain('Firmware: simulator-1 Not in the qualified list');
    expect(identity).toContain('Qualified firmware: 01.08.02.00');
    expect(identity).toContain('Provider: Simulated X1C bambu-simulator 1.0.0');
    expect(identity).toContain('Machine id: workshop-x1c');
  });

  it('should render the binding configuration read-only from its JSON Structure declaration', async () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const binding = openPart('Binding settings');
    expect(binding).toHaveTextContent('Declared by bambu.machine.binding 1.0.0');
    expect(binding).not.toHaveTextContent('Only the simulator reads these');
    const logicalId = await within(binding).findByRole('textbox', { name: 'Input for Logical Id' });
    expect(
      within(binding)
        .getAllByRole('textbox')
        .map((input) => input.getAttribute('aria-label')),
    ).toEqual(['Input for Address', 'Input for Logical Id', 'Input for Serial']);
    for (const input of within(binding).getAllByRole('textbox')) {
      expect(input).toHaveAttribute('readonly');
    }
    expect(within(binding).queryByRole('button', { name: /^Reset/u })).not.toBeInTheDocument();
    fireEvent.change(logicalId, { target: { value: 'renamed' } });
    expect(logicalId).toHaveValue('');
  });

  it("should show the simulator's binding fields as demo settings, read-only", async () => {
    renderDetails(simulatorProvider, 'simulator-1');

    const binding = openPart('Binding settings');
    expect(binding).toHaveAccessibleName('Binding settings 2 fields · Read-only');
    expect(binding).toHaveTextContent('Only the simulator reads these; they are not printer settings.');
    expect(binding).toHaveTextContent('Declared by bambu.simulator.binding 1.1.0');
    /* The declaration titles the field and starts it at real time. */
    const speed = await within(binding).findByRole('textbox', { name: 'Input for Demo Speed' });
    expect(within(binding).getByLabelText('Parameter: Demo Speed')).toHaveTextContent('Demo Speed');
    expect(speed).toHaveAttribute('readonly');
    expect(speed).toHaveValue('1');
    expect(
      within(binding).getByText('Simulated seconds per real second, so a long print can be watched in minutes'),
    ).toBeInTheDocument();
    expect(within(binding).getByRole('textbox', { name: 'Input for Logical Id' })).toHaveAttribute('readonly');
  });

  it('should render the print options with their declared defaults, locked and without growth', async () => {
    renderDetails(x1cProvider, '01.08.02.00');

    const options = openPart('Print options');
    const bedLeveling = await within(options).findByRole('switch', { name: 'Toggle for Bed Leveling' });
    expect(bedLeveling).toBeChecked();
    expect(bedLeveling).toBeDisabled();
    expect(within(options).getByRole('switch', { name: 'Toggle for Flow Calibration' })).toBeChecked();
    expect(within(options).getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
    expect(within(options).getByRole('switch', { name: 'Toggle for Timelapse' })).toBeDisabled();
    expect(within(options).queryByRole('button', { name: /^Add/u })).not.toBeInTheDocument();
    expect(within(options).queryByRole('button', { name: /^Reset/u })).not.toBeInTheDocument();
    fireEvent.click(within(options).getByRole('switch', { name: 'Toggle for Timelapse' }));
    expect(within(options).getByRole('switch', { name: 'Toggle for Timelapse' })).not.toBeChecked();
  });
});
