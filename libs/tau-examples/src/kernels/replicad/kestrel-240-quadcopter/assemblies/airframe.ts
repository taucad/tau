import { buildUpperShell } from '../parts/airframe/upper-shell.js';
import { buildLowerShell } from '../parts/airframe/lower-shell.js';
import { buildBatterySaddle } from '../parts/airframe/battery-saddle.js';
import { buildShellScrew } from '../parts/airframe/shell-screw.js';
import { buildInsert } from '../parts/airframe/heat-set-insert.js';
import { buildBatteryStrap } from '../parts/airframe/battery-strap.js';
import { buildArmModule } from './arm-module.js';
import {
  quadrants,
  shellFasteners,
  batteryStrapStations,
} from '../lib/airframe-geometry.js';
export const defaultParams = {};
export function buildAirframe() {
  const screw = buildShellScrew();
  const insert = buildInsert();
  return [
    {
      name: 'AF-001 Upper shell',
      shape: buildUpperShell(),
      color: '#ec5c26',
      roughness: 0.3,
    },
    {
      name: 'AF-002 Lower shell',
      shape: buildLowerShell(),
      color: '#333f47',
      roughness: 0.38,
    },
    ...quadrants.flatMap(([sx, sy]) => buildArmModule({ sx, sy })),
    {
      name: 'AF-007 Battery saddle',
      shape: buildBatterySaddle(),
      color: '#4c5961',
    },
    ...batteryStrapStations.map((x, index) => ({
      name: `AF-010 Battery strap ${index + 1}`,
      shape: buildBatteryStrap().translate([x, 0, 0]),
      color: '#181e22',
    })),
    ...shellFasteners.flatMap(([x, y], index) => [
      {
        name: `AF-008 Shell screw ${index + 1}`,
        shape: screw.clone().translate([x, y, 2.5]),
        color: '#c4cbd0',
        metalness: 0.85,
      },
      {
        name: `AF-009 Insert ${index + 1}`,
        shape: insert.clone().translate([x, y, -5.5]),
        color: '#b49b57',
        metalness: 0.8,
      },
    ]),
  ];
}
export default function main() {
  return buildAirframe();
}
