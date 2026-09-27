import { type ShapeConfig } from 'replicad';
import { buildCameraFront } from '../parts/gimbal/camera-front.js';
import { buildCameraRear } from '../parts/gimbal/camera-rear.js';
import { buildOpticalDome } from '../parts/gimbal/optical-dome.js';
import { buildLensRetainer } from '../parts/gimbal/lens-retainer.js';
import { buildCameraPcb } from '../parts/gimbal/camera-pcb.js';
import { buildShellScrew } from '../parts/gimbal/shell-screw.js';
import { buildShellNut } from '../parts/gimbal/shell-nut.js';

export const defaultParams = {};
export function buildCameraCartridge(): ShapeConfig[] {
  const out: ShapeConfig[] = [
    {
      name: 'GIM_camera_front_PA12',
      shape: buildCameraFront(),
      color: '#202c38',
    },
    {
      name: 'GIM_camera_rear_PA12',
      shape: buildCameraRear(),
      color: '#304452',
    },
    {
      name: 'GIM_optical_dome_VENDOR_ENVELOPE',
      shape: buildOpticalDome().translate([-14.2, 0, 0]),
      color: '#0a5675',
      metalness: 0.7,
      roughness: 0.12,
    },
    {
      name: 'GIM_lens_retainer_PA12',
      shape: buildLensRetainer().translate([-14.2, 0, 0]),
      color: '#d99836',
    },
    {
      name: 'GIM_camera_pcb_VENDOR_ENVELOPE',
      shape: buildCameraPcb().translate([-5.5, 0, 0]),
      color: '#1c6052',
    },
  ];
  for (const z of [-10.5, 10.5]) {
    const side = z < 0 ? 'lower' : 'upper';
    out.push(
      {
        name: `GIM_shell_screw_M2x10_${side}`,
        shape: buildShellScrew()
          .rotate(-90, [0, 0, 0], [0, 1, 0])
          .translate([4.2, 0, z]),
        color: '#bdc8cf',
        metalness: 0.85,
      },
      {
        name: `GIM_shell_nut_M2_${side}`,
        shape: buildShellNut()
          .rotate(90, [0, 0, 0], [0, 1, 0])
          .translate([-5.8, 0, z]),
        color: '#bdc8cf',
        metalness: 0.85,
      },
    );
  }
  return out;
}
export default function main(_p = defaultParams) {
  return buildCameraCartridge();
}
