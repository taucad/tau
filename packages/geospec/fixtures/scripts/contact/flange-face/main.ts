import { makeBaseBox } from 'replicad';
import { face } from 'replicad/annotations';

export const defaultParams = {
  gap: 0, // Mm - translation of the flange away from the head along -Y
  tiltDegrees: 0, // Degrees - flange rotation about the X axis through its mount-face center
};

export default function main(p = defaultParams) {
  // Head block: x ∈ [-20, 20], y ∈ [-10, 10], z ∈ [0, 40]; mount face is y = -10.
  const head = makeBaseBox(40, 20, 40);

  // Flange plate: y ∈ [-16 - gap, -10 - gap]; its mount face opposes the head's.
  const mountCenter: [number, number, number] = [0, -10 - p.gap, 20];
  let flange = makeBaseBox(40, 6, 40).translate([0, -13 - p.gap, 0]);
  if (p.tiltDegrees !== 0) {
    // Rotate about an in-plane axis through the face center: the probe point stays on the face.
    flange = flange.rotate(p.tiltDegrees, mountCenter, [1, 0, 0]);
  }

  return [
    {
      shape: head,
      name: 'head',
      // Replicad's named 'XZ' plane has normal [0, -1, 0], so the y = -10
      // face is offset +10 along that normal (the blueprint example's -10
      // selects the opposite y = +10 face — recorded deviation).
      interfaces: { 'port.mount': face((f) => f.inPlane('XZ', 10)) },
    },
    {
      shape: flange,
      name: 'runnerFlange',
      interfaces: { mount: face((f) => f.containsPoint(mountCenter)) },
    },
  ];
}
