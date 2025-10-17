import type { ManufacturingMethodConfiguration } from '#types/manufacturing.types.js';

export const manufacturingMethodConfigurations = {
  automatic: {
    name: 'Automatic',
    slug: 'automatic',
    description: 'Automatically determine the appropriate manufacturing method.',
    icon: 'Radar',
  },
  threedPrinting: {
    name: '3D Printing',
    slug: '3d-printing',
    description: 'Print a 3D model using a 3D printer.',
    icon: 'Printer',
  },
  woodworking: {
    name: 'Woodworking',
    slug: 'woodworking',
    description: 'Work wood to create a 3D model.',
    icon: 'TreePine',
  },
  cncMachining: {
    name: 'CNC Machining',
    slug: 'cnc-machining',
    description: 'Mach a 3D model using a CNC machine.',
    icon: 'Computer',
  },
  laserCutting: {
    name: 'Laser Cutting',
    slug: 'laser-cutting',
    description: 'Cut a 3D model using a laser cutter.',
    icon: 'Scissors',
  },
  waterjetCutting: {
    name: 'Waterjet Cutting',
    slug: 'waterjet-cutting',
    description: 'Cut a 3D model using a waterjet cutter.',
    icon: 'Droplet',
  },
  lathe: {
    name: 'Lathe',
    slug: 'lathe',
    description: 'Turn a 3D model using a lathe machine.',
    icon: 'ShipWheel',
  },
  drilling: {
    name: 'Drilling',
    slug: 'drilling',
    description: 'Drill a 3D model using a drilling machine.',
    icon: 'Drill',
  },
  boring: {
    name: 'Boring',
    slug: 'boring',
    description: 'Bore a 3D model using a boring machine.',
    icon: 'Circle',
  },
  tapping: {
    name: 'Tapping',
    slug: 'tapping',
    description: 'Tap a 3D model using a tapping machine.',
    icon: 'Circle',
  },
  threading: {
    name: 'Threading',
    slug: 'threading',
    description: 'Thread a 3D model using a threading machine.',
    icon: 'Circle',
  },
  punching: {
    name: 'Punching',
    slug: 'punching',
    description: 'Punch a 3D model using a punching machine.',
    icon: 'CircleGauge',
  },
  shearing: {
    name: 'Shearing',
    slug: 'shearing',
    description: 'Shear a 3D model using a shearing machine.',
    icon: 'Circle',
  },
} as const satisfies Record<string, ManufacturingMethodConfiguration>;

export const manufacturingMethods = Object.keys(manufacturingMethodConfigurations) as [
  keyof typeof manufacturingMethodConfigurations,
];
