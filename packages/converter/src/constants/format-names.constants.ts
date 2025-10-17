/* eslint-disable @typescript-eslint/naming-convention -- format names */
import type { InputFormat, OutputFormat } from '#types.js';

type FormatConfiguration = {
  name: string;
  description: string;
};

export const formatConfigurations = {
  '3dm': {
    name: '3D Manufacturing (3DM)',
    description:
      'Developed by Robert McNeel & Associates for use in Rhinoceros 3D, facilitating the exchange of NURBS geometry in industrial design and architecture.',
  },
  '3ds': {
    name: '3D Studio (3DS)',
    description:
      'Developed by Autodesk for use in 3D Studio, serving as a legacy format for storing mesh data and widely supported across various 3D modeling applications.',
  },
  '3mf': {
    name: '3D Manufacturing Format (3MF)',
    description:
      'Developed by the 3MF Consortium for use in 3D printing, providing a standardized format that includes support for materials, colors, and other properties.',
  },
  ac: {
    name: 'AC3D (AC)',
    description:
      'Developed by Inivis for use in AC3D, a simple 3D modeling format widely adopted in flight simulation communities.',
  },
  ase: {
    name: 'Autodesk ASCII (ASE)',
    description:
      'Developed by Autodesk for use in 3ds Max, representing ASCII scene export files for exchanging 3D models.',
  },
  amf: {
    name: 'Additive Manufacturing (AMF)',
    description:
      'Developed by ASTM International for use in additive manufacturing, offering a standard for describing objects for 3D printing with support for color and materials.',
  },
  brep: {
    name: 'BREP',
    description:
      'Developed by Open CASCADE for use in boundary representation modeling, representing 3D solid models through their surface boundaries.',
  },
  bvh: {
    name: 'Biovision Hierarchy (BVH)',
    description:
      'Developed by Biovision for use in motion capture data, storing hierarchical animation data for character animation.',
  },
  cob: {
    name: 'Caligari Object (COB)',
    description: 'Developed by Caligari Corporation for use in truSpace, a 3D modeling and animation format.',
  },
  dae: {
    name: 'COLLADA (DAE)',
    description:
      'Developed by the Khronos Group for use in exchanging digital assets among various graphics software, widely adopted in game development.',
  },
  drc: {
    name: 'Draco (DRC)',
    description:
      'Developed by Google for use in compressing and transmitting 3D graphics, optimized for web delivery with efficient geometry compression.',
  },
  dxf: {
    name: 'Drawing Exchange Format (DXF)',
    description:
      'Developed by Autodesk for use in AutoCAD, enabling data interoperability between AutoCAD and other CAD programs.',
  },
  fbx: {
    name: 'Filmbox (FBX)',
    description:
      'Developed by Autodesk for use in exchanging 3D assets between various software applications, particularly in game development and animation.',
  },
  glb: {
    name: 'GL Transmission Format Binary (GLB)',
    description:
      'Developed by the Khronos Group for use as the binary form of glTF, optimized for efficient transmission and loading of 3D models in web applications.',
  },
  gltf: {
    name: 'GL Transmission Format (GLTF)',
    description:
      'Developed by the Khronos Group for use in transmitting 3D models and scenes efficiently, particularly in web applications and real-time rendering.',
  },
  ifc: {
    name: 'Industry Foundation Classes (IFC)',
    description:
      'Developed by buildingSMART International for use in the architecture, engineering, and construction industries, facilitating interoperability in BIM projects.',
  },
  iges: {
    name: 'Initial Graphics Exchange Specification (IGES)',
    description:
      'Developed by the U.S. National Bureau of Standards for use in exchanging 3D models between different CAD systems, particularly in aerospace and automotive.',
  },
  igs: {
    name: 'Initial Graphics Exchange Specification (IGS)',
    description:
      'Developed by the U.S. National Bureau of Standards for use in exchanging 3D wireframe models, serving as a neutral data format for CAD systems.',
  },
  lwo: {
    name: 'LightWave Object (LWO)',
    description:
      'Developed by NewTek for use in LightWave 3D, storing object data for 3D modeling and animation in film and television production.',
  },
  md2: {
    name: 'Quake 2 Model (MD2)',
    description:
      'Developed by id Software for use in Quake II, representing 3D character models and animations in the game engine.',
  },
  md5mesh: {
    name: 'Doom 3 Model (MD5MESH)',
    description:
      'Developed by id Software for use in Doom 3 and the id Tech 4 engine, storing skeletal mesh data for character models.',
  },
  'mesh.xml': {
    name: 'Mesh XML',
    description:
      'Developed for use in Ogre3D engine, representing mesh data in XML format for game development and real-time rendering.',
  },
  nff: {
    name: 'Neutral File Format (NFF)',
    description:
      'Developed for use in ray tracing and rendering applications, representing simple geometric primitives for academic and research purposes.',
  },
  obj: {
    name: 'Wavefront Object (OBJ)',
    description:
      'Developed by Wavefront Technologies for use in representing 3D geometry, widely adopted for its simplicity and compatibility across various 3D applications.',
  },
  off: {
    name: 'Object File Format (OFF)',
    description:
      'Developed by the Geometry Center for use in representing polygonal meshes, commonly used in computational geometry applications.',
  },
  ogex: {
    name: 'Open Game Engine Exchange (OGEX)',
    description:
      'Developed by Eric Lengyel for use in game engines, providing an open format for exchanging complex scene data and animations.',
  },
  ply: {
    name: 'Polygon File Format (PLY)',
    description:
      'Developed by Stanford University for use in storing 3D data from 3D scanners, supporting color and other per-vertex properties.',
  },
  smd: {
    name: 'Source Engine Model (SMD)',
    description:
      'Developed by Valve Corporation for use in the Source engine, representing 3D models and animations for games like Half-Life and Team Fortress.',
  },
  step: {
    name: 'STEP',
    description:
      'Developed by ISO for use in exchanging product data between different CAD systems, providing a comprehensive standard for product lifecycle data.',
  },
  stl: {
    name: 'Stereolithography (STL)',
    description:
      'Developed by 3D Systems for use in stereolithography, serving as the de facto standard format for 3D printing and rapid prototyping.',
  },
  stp: {
    name: 'STEP (STP)',
    description:
      'Developed by ISO for use in representing product manufacturing information, facilitating interoperability between different CAD systems.',
  },
  usda: {
    name: 'Universal Scene Description ASCII (USDA)',
    description:
      'Developed by Pixar for use in collaborative 3D content creation, representing scene data in human-readable ASCII format for visual effects and animation.',
  },
  usdc: {
    name: 'Universal Scene Description Crate (USDC)',
    description:
      'Developed by Pixar for use in collaborative 3D content creation, representing scene data in binary format for efficient storage and performance.',
  },
  usdz: {
    name: 'Universal Scene Description ZIP (USDZ)',
    description:
      'Developed by Apple and Pixar for use in augmented reality applications, providing a packaged USD format optimized for mobile devices.',
  },
  wrl: {
    name: 'Virtual Reality Modeling Language (WRL)',
    description:
      'Developed by the Web3D Consortium for use in representing 3D interactive vector graphics, primarily for web-based virtual reality applications.',
  },
  x: {
    name: 'DirectX (X)',
    description:
      'Developed by Microsoft for use in DirectX, storing 3D models and animations for real-time applications and games.',
  },
  x3d: {
    name: 'Extensible 3D (X3D)',
    description:
      'Developed by the Web3D Consortium for use in representing 3D graphics on the web, serving as the successor to VRML with XML encoding.',
  },
  x3db: {
    name: 'Extensible 3D Binary (X3DB)',
    description:
      'Developed by the Web3D Consortium for use in X3D applications, representing binary-encoded X3D files for efficient web delivery.',
  },
  x3dv: {
    name: 'Extensible 3D VRML (X3DV)',
    description:
      'Developed by the Web3D Consortium for use in X3D applications, representing VRML-encoded X3D files for backward compatibility.',
  },
  xgl: {
    name: 'XGL',
    description:
      'Developed by RealityWave for use in web-based 3D visualization, providing an XML-based format for interactive 3D graphics.',
  },
} as const satisfies Record<InputFormat | OutputFormat, FormatConfiguration>;
