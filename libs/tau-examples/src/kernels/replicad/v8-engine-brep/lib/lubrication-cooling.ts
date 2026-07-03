import { makeBox, makeCylinder, type ShapeConfig } from 'replicad';
import { tubeBetween } from './helpers.js';
import { defaultParams, crankStations, type Params } from './params.js';

export function makeLubricationCoolingParts(
  p: Params = defaultParams,
): ShapeConfig[] {
  const st = crankStations(p);
  const frontX = st.snoutStart - p.damperThk - p.frontCoverThk - 8;
  const sumpX = st.totalLen * 0.52;
  const oilPumpStartX = frontX - 42;
  const oilPumpLen = 24;
  const oilPumpOutletX = oilPumpStartX + oilPumpLen;
  const oilPumpZ = -142;
  const parts: ShapeConfig[] = [
    {
      shape: makeBox([frontX, -92, -38], [frontX + p.frontCoverThk, 92, 155]),
      color: '#3f4147',
      name: 'Front Timing Cover',
    },
    {
      shape: makeCylinder(
        p.oilPumpDia / 2,
        oilPumpLen,
        [oilPumpStartX, 0, oilPumpZ],
        [1, 0, 0],
      ),
      color: '#50525a',
      name: 'Oil Pump',
    },
    {
      shape: tubeBetween(
        [oilPumpOutletX + p.oilPickupDia / 2 + 0.4, 0, -112],
        [sumpX, 0, -112],
        p.oilPickupDia / 2,
      ),
      color: '#4b4b50',
      name: 'Oil Pickup Tube',
    },
    {
      shape: makeCylinder(
        p.filterDia / 2,
        70,
        [st.mainStart[1]!, -270, -66],
        [0, 1, 0],
      ),
      color: '#384f76',
      name: 'Oil Filter',
    },
    {
      shape: makeCylinder(
        p.waterPumpDia / 2,
        38,
        [frontX - 92, 0, 118],
        [1, 0, 0],
      ),
      color: '#565961',
      name: 'Water Pump',
    },
    {
      shape: makeCylinder(20, 46, [frontX - 82, 0, 188], [0, 0, 1]),
      color: '#565961',
      name: 'Thermostat Housing',
    },
    {
      shape: makeCylinder(16, 72, [frontX - 82, 0, 252], [0, 1, 0]),
      color: '#565961',
      name: 'Coolant Outlet',
    },
  ];

  return parts;
}

export default makeLubricationCoolingParts;
