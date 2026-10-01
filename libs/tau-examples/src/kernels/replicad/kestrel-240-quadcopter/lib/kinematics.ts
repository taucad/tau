import type { MechanismSource } from '@taucad/kinematics';

/** The gimbal and rotors in the as-built pitch/yaw frame; coordinates are pose deltas. */
export function mechanism(
  parameters: { pitchDeg?: number; yawDeg?: number } = {},
) {
  const { pitchDeg = 0, yawDeg = 0 } = parameters;
  if (
    !Number.isFinite(pitchDeg) ||
    !Number.isFinite(yawDeg) ||
    Math.abs(pitchDeg) > 25 ||
    Math.abs(yawDeg) > 12
  ) {
    throw new Error('Declared travel is pitch ±25° and yaw ±12°.');
  }
  const yawRadians = (yawDeg * Math.PI) / 180;
  const links: Record<string, { shapes: string[] }> = {
    airframe: {
      shapes: [
        'AF-001 Upper shell',
        'AF-002 Lower shell',
        'AF-007 Battery saddle',
        ...['FL', 'FR', 'RL', 'RR'].flatMap((station) =>
          [
            'AF-003 Arm',
            'AF-004 Spar',
            'AF-005 Root clamp',
            'AF-006 Motor pad',
          ].map((part) => `${part} ${station}`),
        ),
        ...[1, 2].map((index) => `AF-010 Battery strap ${index}`),
        ...[1, 2, 3, 4].flatMap((index) => [
          `AF-008 Shell screw ${index}`,
          `AF-009 Insert ${index}`,
        ]),
        ...[
          'battery-6S-envelope',
          'esc-envelope',
          'flight-controller-envelope',
          'receiver-envelope',
          'power-connector-envelope',
          'power-lead-positive',
          'power-lead-negative',
          'antenna-envelope',
          ...[1, 2, 3, 4].flatMap((index) =>
            [
              'lower-spacer',
              'interboard-spacer',
              'silicone-isolator',
              'board-screw',
            ].map((part) => `${part}-${index}`),
          ),
        ].map((part) => `avionics/${part}`),
        'GIM_fixed_mount_PA12',
        'GIM_yaw_actuator_VENDOR_ENVELOPE',
        ...['left', 'right'].flatMap((side) => [
          `GIM_mount_screw_M2x8_${side}`,
          `GIM_mount_insert_M2_${side}`,
        ]),
      ],
    },
    yoke: {
      shapes: [
        'GIM_pitch_yoke_PA12',
        'GIM_pitch_bearing_3x8x3',
        'GIM_yaw_bearing_3x8x3',
        'GIM_pitch_actuator_VENDOR_ENVELOPE',
        'GIM_yaw_drive_VENDOR_ENVELOPE',
      ],
    },
    camera: {
      shapes: [
        'GIM_camera_front_PA12',
        'GIM_camera_rear_PA12',
        'GIM_optical_dome_VENDOR_ENVELOPE',
        'GIM_lens_retainer_PA12',
        'GIM_camera_pcb_VENDOR_ENVELOPE',
        'GIM_pitch_shoulder_axle',
        'GIM_pitch_drive_VENDOR_ENVELOPE',
        ...['lower', 'upper'].flatMap((side) => [
          `GIM_shell_screw_M2x10_${side}`,
          `GIM_shell_nut_M2_${side}`,
        ]),
      ],
    },
  };
  const joints: Record<string, MechanismSource['joints'][string]> = {
    'camera-yaw': {
      type: 'revolute',
      name: 'Camera yaw (±12°)',
      parent: 'airframe',
      child: 'yoke',
      origin: [-70, 0, -4],
      axis: [0, 0, 1],
      limits: { lower: -12 - yawDeg, upper: 12 - yawDeg },
    },
    'camera-pitch': {
      type: 'revolute',
      name: 'Camera pitch (±25°)',
      parent: 'yoke',
      child: 'camera',
      origin: [-70 - 19 * Math.cos(yawRadians), -19 * Math.sin(yawRadians), -4],
      axis: [-Math.sin(yawRadians), Math.cos(yawRadians), 0],
      limits: { lower: -25 - pitchDeg, upper: 25 - pitchDeg },
    },
  };
  for (const [station, x, y, handedness] of [
    ['front-left', -85, -85, 'CW'],
    ['front-right', -85, 85, 'CCW'],
    ['rear-left', 85, -85, 'CCW'],
    ['rear-right', 85, 85, 'CW'],
  ] as const) {
    links[station] = {
      shapes: [
        'motor-bell-envelope',
        'motor-shaft',
        `propeller-${handedness}`,
        'prop-nut',
      ].map((part) => `${station}/${part}`),
    };
    links['airframe']!.shapes.push(
      ...[
        'motor-base',
        'motor-stator-envelope',
        'motor-bearing-1',
        'motor-bearing-2',
        ...[1, 2, 3, 4].map((index) => `motor-screw-${index}`),
      ].map((part) => `${station}/${part}`),
    );
    joints[station] = {
      type: 'revolute',
      name: `${station} rotor (${handedness})`,
      parent: 'airframe',
      child: station,
      origin: [x, y, 38],
      axis: [0, 0, handedness === 'CW' ? -1 : 1],
    };
  }
  const rotors = (angle: number) =>
    Object.fromEntries(
      ['front-left', 'front-right', 'rear-left', 'rear-right'].map(
        (station) => [station, angle],
      ),
    );
  return {
    schemaVersion: 1,
    units: { length: 'mm', angle: 'deg' },
    root: 'airframe',
    links,
    joints,
    animations: [
      {
        id: 'rotors',
        name: 'Four rotors — slow demonstration',
        duration: 4,
        loop: 'repeat',
        keyframes: [
          { time: 0, coordinates: rotors(0) },
          { time: 4, coordinates: rotors(360) },
        ],
      },
      {
        id: 'camera-pitch',
        name: 'Camera pitch sweep',
        duration: 4,
        loop: 'pingPong',
        keyframes: [
          {
            time: 0,
            coordinates: {
              'camera-pitch': -25 - pitchDeg,
              'camera-yaw': -yawDeg,
            },
          },
          {
            time: 4,
            coordinates: {
              'camera-pitch': 25 - pitchDeg,
              'camera-yaw': -yawDeg,
            },
          },
        ],
      },
      {
        id: 'camera-yaw',
        name: 'Camera yaw sweep',
        duration: 4,
        loop: 'pingPong',
        keyframes: [
          {
            time: 0,
            coordinates: {
              'camera-yaw': -12 - yawDeg,
              'camera-pitch': -pitchDeg,
            },
          },
          {
            time: 4,
            coordinates: {
              'camera-yaw': 12 - yawDeg,
              'camera-pitch': -pitchDeg,
            },
          },
        ],
      },
      {
        id: 'all-motion',
        name: 'Rotors and camera scan',
        duration: 8,
        loop: 'repeat',
        keyframes: [
          {
            time: 0,
            coordinates: { ...rotors(0), 'camera-pitch': 0, 'camera-yaw': 0 },
          },
          {
            time: 2,
            coordinates: {
              ...rotors(180),
              'camera-pitch': -25 - pitchDeg,
              'camera-yaw': -12 - yawDeg,
            },
          },
          {
            time: 4,
            coordinates: {
              ...rotors(360),
              'camera-pitch': 25 - pitchDeg,
              'camera-yaw': 12 - yawDeg,
            },
          },
          {
            time: 6,
            coordinates: {
              ...rotors(540),
              'camera-pitch': 25 - pitchDeg,
              'camera-yaw': -12 - yawDeg,
            },
          },
          {
            time: 8,
            coordinates: { ...rotors(720), 'camera-pitch': 0, 'camera-yaw': 0 },
          },
        ],
      },
    ],
  } satisfies MechanismSource;
}
