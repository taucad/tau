import type { ShapeConfig } from 'replicad';
import { buildBattery } from '../parts/avionics/battery.js';
import { buildEsc } from '../parts/avionics/esc.js';
import { buildFlightController } from '../parts/avionics/flight-controller.js';
import { buildReceiver } from '../parts/avionics/receiver.js';
import { buildStandoff } from '../parts/avionics/standoff.js';
import { buildBoardScrew } from '../parts/avionics/board-screw.js';
import { buildBoardIsolator } from '../parts/avionics/board-isolator.js';
import { buildPowerConnector } from '../parts/avionics/power-connector.js';
import { buildPowerWire } from '../parts/avionics/power-wire.js';
import { buildAntenna } from '../parts/avionics/antenna.js';

export const defaultParams = {};

export function buildAvionics(): ShapeConfig[] {
  const lower = buildStandoff({ height: 3.4 }),
    upper = buildStandoff();
  const screw = buildBoardScrew(),
    isolator = buildBoardIsolator(),
    wire = buildPowerWire();
  return [
    {
      shape: buildBattery().translate([-27, 0, -17]),
      name: 'avionics/battery-6S-envelope',
      color: '#343b45',
      roughness: 0.6,
    },
    {
      shape: buildEsc().translate([24, 0, -9]),
      name: 'avionics/esc-envelope',
      color: '#18352e',
      roughness: 0.65,
    },
    {
      shape: buildFlightController().translate([24, 0, 0]),
      name: 'avionics/flight-controller-envelope',
      color: '#18453d',
      roughness: 0.65,
    },
    {
      shape: buildReceiver().translate([56, 0, -1.5]),
      name: 'avionics/receiver-envelope',
      color: '#154e3e',
      roughness: 0.6,
    },
    {
      shape: buildPowerConnector().translate([3, 0, 17.5]),
      name: 'avionics/power-connector-envelope',
      color: '#e8a721',
      roughness: 0.55,
    },
    {
      shape: wire.clone().translate([8, -3, 14]),
      name: 'avionics/power-lead-positive',
      color: '#d83222',
      roughness: 0.75,
    },
    {
      shape: wire.clone().translate([8, 3, 14]),
      name: 'avionics/power-lead-negative',
      color: '#292c32',
      roughness: 0.75,
    },
    {
      shape: buildAntenna().translate([64, 0, 0]),
      name: 'avionics/antenna-envelope',
      color: '#242a31',
      roughness: 0.8,
    },
    ...[14, 34].flatMap((x, index) =>
      [-10, 10].flatMap((y, index_) => {
        const n = index * 2 + index_ + 1;
        return [
          {
            shape: lower.clone().translate([x, y, -13.4]),
            name: `avionics/lower-spacer-${n}`,
            color: '#737c87',
            metalness: 0.65,
          },
          {
            shape: upper.clone().translate([x, y, -7.4]),
            name: `avionics/interboard-spacer-${n}`,
            color: '#737c87',
            metalness: 0.65,
          },
          {
            shape: isolator.clone().translate([x, y, -10]),
            name: `avionics/silicone-isolator-${n}`,
            color: '#ff5a24',
            roughness: 0.9,
          },
          {
            shape: screw.clone().translate([x, y, -13.4]),
            name: `avionics/board-screw-${n}`,
            color: '#929aa4',
            metalness: 0.8,
          },
        ];
      }),
    ),
  ];
}

export default function main() {
  return buildAvionics();
}
