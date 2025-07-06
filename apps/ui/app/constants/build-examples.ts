import { mockModels } from '~/constants/build-code-examples.js';
import type { Build } from '~/types/build.types.js';
import type { KernelProvider } from '~/types/kernel.types.js';

// Sample data
type Model = {
  id: string;
  name: string;
  code: string;
  thumbnail: string;
  language?: 'replicad' | 'openscad';
};

const createBuild = (model: Model, mainFile: string, kernel: KernelProvider) => {
  return {
    id: model.id,
    assets: {
      mechanical: {
        files: { [mainFile]: { content: model.code } },
        main: mainFile,
        language: kernel,
        parameters: {},
      },
    },
    name: model.name,
    description: `A 3D ${model.name} model built with ${kernel}`,
    author: {
      name: 'Tau Team',
      avatar: '/avatar-sample.png',
    },
    version: '1.0.0',
    createdAt: 1_740_702_000_000,
    updatedAt: 1_740_702_000_000,
    tags: ['3d-printing', 'parametric', kernel],
    isFavorite: false,
    stars: 0,
    forks: 0,
    thumbnail: model.thumbnail,
    chats: [],
  };
};

export const replicadBuilds: Build[] = mockModels.map((model) => {
  const mainFile = 'main.ts';
  const language = 'replicad';
  return createBuild(model, mainFile, language);
});

const openScadModels: Model[] = [
  {
    id: 'openscad_param_box',
    name: 'Parametric Box (OpenSCAD)',
    code: `// Parametric Hollow Box Example\n// Demonstrates OpenSCAD Customizer parameters\n// and basic CSG operations.\n\n// [size] = 40                // Overall box size (mm)\n// [wall] = 3                 // Wall thickness (mm)\n// [round] = 2                // Fillet radius on outer edges\n\n$fn = 48; // smooth circles for fillets\n\nmodule roundedCube(sz, r=0, center=true) {\n  if (r <= 0)\n    cube(sz, center=center);\n  else\n    minkowski() {\n      cube(sz - 2*r, center=center);\n      sphere(r = r);\n    }\n}\n\n// Outer shell\nroundedCube(size, round);\n\n// Subtract inner cavity\ntranslate([0,0,0])\n  roundedCube(size - 2*wall, round > wall ? round - wall : 0);`,
    thumbnail: '/placeholder.svg',
    language: 'openscad',
  },
  {
    id: 'openscad_cube',
    name: 'OpenSCAD Cube',
    code: 'cube(10);',
    thumbnail: '/placeholder.svg',
    language: 'openscad',
  },
] as const;

export const openscadBuilds: Build[] = openScadModels.map((model) => {
  const mainFile = 'main.scad';
  const language = 'openscad';
  return createBuild(model, mainFile, language);
});

export const sampleBuilds: Build[] = [...replicadBuilds, ...openscadBuilds];

// Export const mockBuilds: Build[] = [
//   {
//     id: '1',
//     name: 'Parametric Gear Generator',
//     description: 'A fully customizable gear system with automatic mesh generation and stress analysis',
//     thumbnail:
//       'https://makerworld.bblmw.com/makerworld/model/USce1b6106deb1fb/design/2025-01-28_c52ecae10189c.jpeg?x-oss-process=image/resize,w_1000/format,webp',
//     stars: 245,
//     forks: 72,
//     author: {
//       name: 'Sarah Chen',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['gears', 'parametric', 'engineering'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {
//           'main.ts': {
//             content: 'print("Hello, world!");',
//           },
//         },
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '2',
//     name: 'Modular Drone Frame',
//     description: 'Open-source drone frame design with swappable components and printable parts',
//     thumbnail: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?q=80&w=640',
//     stars: 189,
//     forks: 45,
//     author: {
//       name: 'Alex Kumar',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['drone', 'modular', '3D-printing'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {
//           'main.ts': {
//             content: 'print("Hello, world!");',
//           },
//         },
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '3',
//     name: 'Smart Home Hub Enclosure',
//     description: 'Customizable enclosure for DIY smart home controllers with cooling optimization',
//     thumbnail: 'https://media.bunnings.com.au/api/public/content/f65b9387002740cabdab22149ea669c0?v=42a24028',
//     stars: 156,
//     forks: 38,
//     author: {
//       name: 'Maria Garcia',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['smart-home', 'IoT', 'enclosure'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'kcl',
//       },
//       electrical: {
//         main: 'main.ts',
//         files: {},
//         language: 'kicad',
//       },
//     },
//   },
//   {
//     id: '4',
//     name: 'Electric Skateboard Mount',
//     description: 'Optimized motor mount design for DIY electric skateboards with built-in cooling',
//     thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=640',
//     stars: 324,
//     forks: 89,
//     author: {
//       name: 'Tom Wilson',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['e-mobility', 'skateboard', 'motor-mount'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       electrical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '5',
//     name: 'Modular Building System',
//     description: 'Architectural components for rapid prototyping of building designs',
//     thumbnail: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=640',
//     stars: 892,
//     forks: 156,
//     author: {
//       name: 'Emma Smith',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['architecture', 'modular', 'prototyping'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {
//           'main.ts': {
//             content: 'print("Hello, world!");',
//           },
//         },
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '6',
//     name: 'PCB Enclosure Generator',
//     description: 'Parametric electronics enclosure with custom PCB mounting options',
//     thumbnail: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?q=80&w=640',
//     stars: 467,
//     forks: 92,
//     author: {
//       name: 'David Park',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['electronics', 'PCB', 'parametric'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       electrical: {
//         main: 'main.ts',
//         files: {
//           'main.ts': {
//             content: 'print("Hello, world!");',
//           },
//         },
//         language: 'kcl',
//       },
//     },
//   },
//   {
//     id: '7',
//     name: 'Robotic Arm Assembly',
//     description: '6-axis robotic arm with inverse kinematics and servo mounts',
//     thumbnail: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=640',
//     stars: 1243,
//     forks: 278,
//     author: {
//       name: 'Michael Chang',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['robotics', 'kinematics', 'servo'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {
//           'main.ts': {
//             content: 'print("Hello, world!");',
//           },
//         },
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '8',
//     name: 'Solar Panel Mount',
//     description: 'Adjustable mounting system for solar panels with wind load analysis',
//     thumbnail: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?q=80&w=640',
//     stars: 534,
//     forks: 112,
//     author: {
//       name: 'Lisa Johnson',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['solar', 'renewable-energy', 'mounting'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '9',
//     name: 'mechanical Keyboard Case',
//     description: 'Custom keyboard case with integrated wrist rest and cable routing',
//     thumbnail: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=640',
//     stars: 678,
//     forks: 145,
//     author: {
//       name: 'Ryan Martinez',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['keyboard', 'mechanical-keyboard', 'case'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {
//           'main.ts': {
//             content: 'print("Hello, world!");',
//           },
//         },
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '10',
//     name: '3D Printer Upgrades',
//     description: 'Collection of enhancement parts for popular 3D printer models',
//     thumbnail:
//       'https://i.all3dp.com/workers/images/fit=scale-down,w=1920,h=1080,gravity=0.5x0.5,format=auto/wp-content/uploads/2022/05/20172502/PXL_20220114_183227051.PORTRAIT-scaled.jpg',
//     stars: 892,
//     forks: 234,
//     author: {
//       name: 'Chris Anderson',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['3D-printing', 'upgrades', 'DIY'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '11',
//     name: 'Hydroponics System',
//     description: 'Modular hydroponics setup with nutrient flow optimization',
//     thumbnail: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?q=80&w=640',
//     stars: 445,
//     forks: 89,
//     author: {
//       name: 'Sophie Turner',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['hydroponics', 'gardening', 'automation'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '12',
//     name: 'Camera Gimbal Mount',
//     description: '3-axis camera stabilizer with quick-release plate',
//     thumbnail:
//       'https://content.instructables.com/FIX/2WP3/I9QWHCF2/FIX2WP3I9QWHCF2.png?auto=webp&frame=1&crop=3:2&width=667&height=1024&fit=bounds&md=MjAxNS0wNS0xNiAxNDoyMToyNy4w',
//     stars: 567,
//     forks: 123,
//     author: {
//       name: 'James Lee',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['camera', 'gimbal', 'stabilizer'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '13',
//     name: 'Wind Turbine Blades',
//     description: 'Optimized small-scale wind turbine blade design with CFD analysis',
//     thumbnail: 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?q=80&w=640',
//     stars: 789,
//     forks: 167,
//     author: {
//       name: 'Anna White',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['wind-energy', 'turbine', 'CFD'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '14',
//     name: 'Ergonomic Mouse',
//     description: 'Vertical mouse design optimized for wrist comfort',
//     thumbnail: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=640',
//     stars: 234,
//     forks: 45,
//     author: {
//       name: 'Peter Zhang',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['ergonomics', 'mouse', 'design'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '15',
//     name: 'Micro RC Car Chassis',
//     description: '1:24 scale RC car frame with suspension geometry',
//     thumbnail: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?q=80&w=640',
//     stars: 345,
//     forks: 78,
//     author: {
//       name: 'Kevin Brown',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['RC-car', 'chassis', 'suspension'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '16',
//     name: 'Modular Shelf System',
//     description: 'Customizable shelving with hidden bracket design',
//     thumbnail:
//       'https://media.printables.com/media/prints/230356/images/2136386_a71237f4-d2f3-4cba-a749-173a58bde021/thumbs/inside/1280x960/jpg/001.webp',
//     stars: 567,
//     forks: 89,
//     author: {
//       name: 'Rachel Green',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['shelving', 'modular', 'furniture'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'kcl',
//       },
//     },
//   },
//   {
//     id: '17',
//     name: 'Bike Light Mount',
//     description: 'Universal bicycle light mounting system with quick release',
//     thumbnail: 'https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?q=80&w=640',
//     stars: 234,
//     forks: 56,
//     author: {
//       name: 'Daniel Kim',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['bicycle', 'light-mount', 'accessories'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '18',
//     name: 'Server Rack Design',
//     description: '4U rack mount case with advanced cooling system',
//     thumbnail: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=640',
//     stars: 678,
//     forks: 145,
//     author: {
//       name: 'Eric Thompson',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['server', 'rack-mount', 'cooling'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '19',
//     name: 'Garden Irrigation',
//     description: 'Smart irrigation system with pressure-compensating emitters',
//     thumbnail: 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?q=80&w=640',
//     stars: 445,
//     forks: 98,
//     author: {
//       name: 'Laura Martinez',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['irrigation', 'gardening', 'automation'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       mechanical: {
//         main: 'main.ts',
//         files: {},
//         language: 'replicad',
//       },
//     },
//   },
//   {
//     id: '20',
//     name: 'Desktop CNC Frame',
//     description: 'Rigid desktop CNC machine frame with linear rail guides',
//     thumbnail: 'https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?q=80&w=640',
//     stars: 892,
//     forks: 234,
//     author: {
//       name: 'Mark Wilson',
//       avatar: '/avatar-sample.png',
//     },
//     tags: ['CNC', 'desktop-manufacturing', 'DIY'],
//     messages: [],
//     createdAt: Date.now(),
//     updatedAt: Date.now(),
//     assets: {
//       firmware: {
//         main: 'main.cpp',
//         files: {},
//         language: 'cpp',
//       },
//     },
//   },
// ];
