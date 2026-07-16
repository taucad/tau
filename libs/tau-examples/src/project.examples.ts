// JSCAD example code
import type { ThumbnailAssetKey } from '#thumbnail.assets.js';
import jscadCubeCode from '#kernels/jscad/cube/main.ts?raw';
import jscadCubeCylinderSectionFixtureCode from '#kernels/jscad/cube-cylinder-section-fixture/main.ts?raw';
import jscadCylinderCode from '#kernels/jscad/cylinder/main.ts?raw';
import jscadEdgeOcclusionFixtureCode from '#kernels/jscad/edge-occlusion-fixture/main.ts?raw';
import jscadGearCode from '#kernels/jscad/gear/main.ts?raw';
import jscadNonManifoldSectionFixtureCode from '#kernels/jscad/non-manifold-section-fixture/main.ts?raw';
import jscadSectionCapFixtureCode from '#kernels/jscad/section-cap-fixture/main.ts?raw';
import jscadSectionOverlapFixtureCode from '#kernels/jscad/section-overlap-fixture/main.ts?raw';
import jscadSectionOverlapHeavyPlanetaryFixtureCode from '#kernels/jscad/section-overlap-heavy-planetary-fixture/main.ts?raw';
import jscadSectionOverlapHeavyV8FixtureCode from '#kernels/jscad/section-overlap-heavy-v8-fixture/main.ts?raw';
import jscadSectionPickingFixtureCode from '#kernels/jscad/section-picking-fixture/main.ts?raw';
// OpenSCAD example code
import openscadKitchenSinkCode from '#kernels/openscad/kitchen-sink/main.scad?raw';
// Replicad example code
import birdhouseCode from '#kernels/replicad/birdhouse/main.ts?raw';
import hollowBoxCode from '#kernels/replicad/hollow-box/main.ts?raw';
import trayCode from '#kernels/replicad/tray/main.ts?raw';
import drinkingGlassCode from '#kernels/replicad/drinking-glass/main.ts?raw';
import potPlantCode from '#kernels/replicad/pot-plant/main.ts?raw';
import vaseCode from '#kernels/replicad/vase/main.ts?raw';
import wavyVaseCode from '#kernels/replicad/wavy-vase/main.ts?raw';
import cycloidalGearCode from '#kernels/replicad/cycloidal-gear/main.ts?raw';
import bottleCode from '#kernels/replicad/bottle/main.ts?raw';
import iBeamCode from '#kernels/replicad/ibeam/main.ts?raw';
import tSlotRailCode from '#kernels/replicad/t-slot-rail/main.ts?raw';
import gridfinityBoxCode from '#kernels/replicad/gridfinity-box/main.ts?raw';
import decoratedBoxCode from '#kernels/replicad/decorated-box/main.ts?raw';
import cardHolderCode from '#kernels/replicad/card-holder/main.ts?raw';
import staircaseCode from '#kernels/replicad/staircase/main.ts?raw';
import tableCode from '#kernels/replicad/table/main.ts?raw';
import legoCode from '#kernels/replicad/lego/main.ts?raw';
import simpleTrayCode from '#kernels/replicad/simple-tray/main.ts?raw';
import hexScrewdriverCode from '#kernels/replicad/hex-screwdriver/main.ts?raw';
import chairCode from '#kernels/replicad/chair/main.ts?raw';
import flowerAttachmentSectionOutlineFixtureCode from '#kernels/replicad/flower-attachment-section-outline-fixture/main.ts?raw';
import wedgeDoorStopperCode from '#kernels/replicad/wedge-door-stopper/main.ts?raw';

type Model = {
  id: string;
  name: string;
  code: string;
  description: string;
  thumbnailKey: ThumbnailAssetKey;
};

export const jscadExamples: Model[] = [
  {
    id: 'jscad_cube',
    name: 'JSCAD Cube',
    description:
      'The perfect starting point for your 3D modeling journey. This simple yet powerful cube demonstrates the fundamentals of parametric design with JSCAD. Adjust the size parameter to create anything from tiny components to large building blocks. Ideal for learning the basics or as a foundation for more complex geometric shapes.',
    code: jscadCubeCode,
    thumbnailKey: 'jscad/cube',
  },
  {
    id: 'jscad_cylinder',
    name: 'JSCAD Cylinder',
    description:
      'Create precise cylindrical shapes with full control over dimensions and smoothness. Perfect for rods, pins, spacers, or any round component. Adjust height and radius for your exact needs, and fine-tune the segment count to balance between smooth curves and performance. Essential for mechanical parts, architectural elements, or decorative objects.',
    code: jscadCylinderCode,
    thumbnailKey: 'jscad/cylinder',
  },
  {
    id: 'jscad_gear',
    name: 'Involute Gear',
    description:
      'Design precision mechanical gears with mathematically accurate involute profiles. This advanced example showcases complex parametric modeling with customizable tooth count, pitch, pressure angle, and thickness. Perfect for creating functional gear systems, educational demonstrations, or replacement parts. Features optional center hole for shaft mounting and professional-grade gear geometry calculations.',
    code: jscadGearCode,
    thumbnailKey: 'jscad/gear',
  },
  {
    id: 'jscad_edge_occlusion_fixture',
    name: 'Edge Occlusion Fixture',
    description: 'A deterministic front-slab and rear-cuboid scene for low-FOV GLTF edge occlusion regression testing.',
    code: jscadEdgeOcclusionFixtureCode,
    thumbnailKey: 'jscad/edge-occlusion-fixture',
  },
  {
    id: 'jscad_cube_cylinder_section_fixture',
    name: 'Cube Cylinder Section Fixture',
    description:
      'A deterministic cube with a cylindrical through-cut for WebGL section-view overlay depth regression testing.',
    code: jscadCubeCylinderSectionFixtureCode,
    thumbnailKey: 'jscad/cube-cylinder-section-fixture',
  },
  {
    id: 'jscad_section_cap_fixture',
    name: 'Section Cap Fixture',
    description:
      'A deterministic holed housing with colored internal solids for section-view cap and contour-fill regression testing.',
    code: jscadSectionCapFixtureCode,
    thumbnailKey: 'jscad/section-cap-fixture',
  },
  {
    id: 'jscad_section_picking_fixture',
    name: 'Section Picking Fixture',
    description: 'A deterministic two-cuboid scene for section-view clipping-aware model picking regression testing.',
    code: jscadSectionPickingFixtureCode,
    thumbnailKey: 'jscad/section-picking-fixture',
  },
  {
    id: 'jscad_section_overlap_fixture',
    name: 'Section Overlap Fixture',
    description:
      'A deterministic set of overlapping and tangent cuboids for section-plane overlap cap-shading regression testing.',
    code: jscadSectionOverlapFixtureCode,
    thumbnailKey: 'jscad/section-overlap-fixture',
  },
  {
    id: 'jscad_section_overlap_heavy_planetary_fixture',
    name: 'Heavy Planetary Section Overlap Fixture',
    description:
      'A deterministic dense planetary-style assembly for section-view overlap drag performance diagnostics.',
    code: jscadSectionOverlapHeavyPlanetaryFixtureCode,
    thumbnailKey: 'jscad/section-overlap-heavy-planetary-fixture',
  },
  {
    id: 'jscad_section_overlap_heavy_v8_fixture',
    name: 'Heavy V8 Section Overlap Fixture',
    description: 'A deterministic engine-style assembly for section-view overlap drag performance diagnostics.',
    code: jscadSectionOverlapHeavyV8FixtureCode,
    thumbnailKey: 'jscad/section-overlap-heavy-v8-fixture',
  },
  {
    id: 'jscad_non_manifold_section_fixture',
    name: 'Non-Manifold Section Fixture',
    description:
      'A deterministic one-mesh, non-booleaned pair of touching solids for section-view cap recovery regression testing.',
    code: jscadNonManifoldSectionFixtureCode,
    thumbnailKey: 'jscad/non-manifold-section-fixture',
  },
] as const;

export const openscadExamples: Model[] = [
  {
    id: 'openscad_kitchen_sink',
    name: 'Parameter Kitchen Sink',
    description:
      'A comprehensive showcase of every OpenSCAD Customizer parameter type: spinboxes, sliders, dropdowns, checkboxes, text fields, color pickers, and vectors. Use this to test and validate parameter UI rendering across all supported input types.',
    code: openscadKitchenSinkCode,
    thumbnailKey: 'openscad/kitchen-sink',
  },
] as const;

export const mockProjects = [
  {
    id: 'proj_flower_attachment_section_outline_fixture',
    name: 'Flower Attachment Section Outline Fixture',
    description:
      'A real exported Replicad flower attachment source fixture for section-view contour outline visual regression testing.',
    code: flowerAttachmentSectionOutlineFixtureCode,
    thumbnailKey: 'replicad/flower-attachment-section-outline-fixture',
  },
  {
    id: 'proj_wedge_door_stopper',
    name: 'Wedge Door Stopper',
    description:
      'A hollow, printable wedge door stopper with rounded front and back profiles, a solid nose, and concentric underside grip ridges.',
    code: wedgeDoorStopperCode,
    thumbnailKey: 'replicad/wedge-door-stopper',
  },
  {
    id: 'proj_birdhouse',
    name: 'Birdhouse',
    description:
      "Invite nature into your backyard with this modern, geometric birdhouse design. Its clean triangular silhouette and rounded edges create a contemporary look while the customizable entrance hole size and wall thickness ensure it's perfectly suited for your local bird species. Features an integrated hanging hook for easy placement.",
    code: birdhouseCode,
    thumbnailKey: 'replicad/birdhouse',
  },
  {
    id: 'proj_hollow_box',
    name: 'Hollow Box',
    description:
      'The perfect everyday organizer—simple, elegant, and endlessly useful. This minimalist design features smooth rounded corners and a clean hollow construction that keeps it lightweight yet sturdy. Fully customizable dimensions, wall thickness, and corner radius make it ideal for everything from desk organizers to workshop storage bins.',
    code: hollowBoxCode,
    thumbnailKey: 'replicad/hollow-box',
  },
  {
    id: 'proj_tray',
    name: 'Tray',
    description:
      'A beautifully sculpted tray with elegant curved edges that elevates everyday items. Perfect for serving coffee, displaying jewelry, or organizing your entryway essentials. The sophisticated swept profile creates visual interest while the raised brim keeps everything secure. Fully customizable proportions let you create the perfect size for your space.',
    code: trayCode,
    thumbnailKey: 'replicad/tray',
  },
  {
    id: 'proj_drinking_glass',
    name: 'Drinking Glass',
    description:
      'Create elegant glassware with precise control over form and function. This parametric design uses advanced revolve and shelling techniques to produce a refined drinking glass with customizable height, taper, and wall thickness. Optional rim and base fillets add a professional finishing touch for a truly polished result.',
    code: drinkingGlassCode,
    thumbnailKey: 'replicad/drinking-glass',
  },
  {
    id: 'proj_pot_plant',
    name: 'Pot Plant',
    description:
      'A thoughtfully designed plant pot holder that combines form and function. Features an optional integrated saucer, customizable drainage holes, and smooth filleted edges for easy cleaning. Adjust dimensions to perfectly fit your favorite plants while maintaining proper drainage and a clean, modern aesthetic.',
    code: potPlantCode,
    thumbnailKey: 'replicad/pot-plant',
  },
  {
    id: 'proj_vase',
    name: 'Vase',
    description:
      'A graceful, timeless vase design created through revolution of a carefully crafted profile. Adjustable wall thickness and elegant curves allow you to create everything from delicate bud vases to substantial statement pieces. Optional top fillets add refinement while maintaining the classic silhouette.',
    code: vaseCode,
    thumbnailKey: 'replicad/vase',
  },
  {
    id: 'proj_wavy_vase',
    name: 'Wavy Vase',
    description:
      'A bold, sculptural vase featuring dynamic twisted geometry and rhythmic faceting. The parametric design lets you control the number of sides, twist angle, and wall thickness to create unique light-catching forms. Perfect for making a statement piece that combines mathematical precision with artistic expression.',
    code: wavyVaseCode,
    thumbnailKey: 'replicad/wavy-vase',
  },
  {
    id: 'proj_cylindrical_gear',
    name: 'Cycloidal Gear',
    description:
      'A striking gear design driven by mathematical elegance. Combines epicycloid and hypocycloid curves to create a unique tooth profile, with optional twist for added visual interest. Perfect for decorative applications, educational demonstrations, or architectural accents that showcase the beauty of parametric design.',
    code: cycloidalGearCode,
    thumbnailKey: 'replicad/cycloidal-gear',
  },
  {
    id: 'proj_bottle',
    name: 'Bottle',
    description:
      'A modern bottle design with soft, rounded shoulders and a refined neck detail. The parametric construction allows precise control over proportions while the shell operation creates a hollow interior. Optional threading detail adds authenticity, making this perfect for functional prototypes or decorative pieces.',
    code: bottleCode,
    thumbnailKey: 'replicad/bottle',
  },
  {
    id: 'proj_ibeam',
    name: 'I-Beam',
    description:
      'Industrial elegance meets precision engineering. This accurate I-beam profile features customizable dimensions, web and flange thickness, and optional root fillets for a professional finish. Ideal for structural studies, furniture accents, or architectural elements that require authentic beam geometry.',
    code: iBeamCode,
    thumbnailKey: 'replicad/ibeam',
  },
  {
    id: 'proj_t_slot_rail',
    name: 'T-Slot Rail',
    description:
      'A precise T-slot extrusion profile perfect for modular framing systems. Features accurate interior geometry with proper clearances and scoring details. Customizable rail height and length make it ideal for building custom fixtures, jigs, or furniture that requires the versatility of T-slot construction.',
    code: tSlotRailCode,
    thumbnailKey: 'replicad/t-slot-rail',
  },
  {
    id: 'proj_gridfinity_box',
    name: 'Gridfinity Box',
    description:
      'The ultimate modular storage solution. This Gridfinity-compatible box features accurate socket geometry, optional magnet and screw holes, and clean shelling for a professional finish. Customize size, height, and features to create a perfectly organized workspace that scales with your needs.',
    code: gridfinityBoxCode,
    thumbnailKey: 'replicad/gridfinity-box',
  },
  {
    id: 'proj_decorated_box',
    name: 'Decorated Box',
    description:
      'A sleek storage box that becomes a canvas for pattern and texture. Start with clean, shelled geometry, then apply decorative patterns like Voronoi cells, grids, or honeycomb structures. Perfect for creating unique, personalized storage solutions that combine functionality with artistic expression.',
    code: decoratedBoxCode,
    thumbnailKey: 'replicad/decorated-box',
  },
  {
    id: 'proj_card_holder',
    name: 'Card Holder',
    description:
      'A thoughtfully designed card holder with ergonomic finger cutouts and a secure locking mechanism. Features smooth filleted edges for comfortable handling and precise screw hole placement for mounting. The parametric design ensures a perfect fit for your cards while maintaining a clean, professional appearance.',
    code: cardHolderCode,
    thumbnailKey: 'replicad/card-holder',
  },
  {
    id: 'proj_staircase',
    name: 'Staircase',
    description:
      'A complete staircase system with steps, stringers, handrails, and balusters—all fully parametric. Built to real-world building code proportions with customizable dimensions, optional features, and proper step geometry. Perfect for architectural visualization, furniture design, or educational demonstrations.',
    code: staircaseCode,
    thumbnailKey: 'replicad/staircase',
  },
  {
    id: 'proj_table',
    name: 'Table',
    description:
      'A complete table system with customizable top, legs, apron, and optional shelf. Choose between square or round legs, adjust proportions for any space, and add optional features like rounded corners or a lower shelf. The parametric design ensures perfect alignment and professional results for any furniture project.',
    code: tableCode,
    thumbnailKey: 'replicad/table',
  },
  {
    id: 'proj_lego',
    name: 'Interlocking Brick',
    description:
      'A faithful recreation of the classic interlocking brick system. Features accurate stud placement, hollow underside, and optional bottom tubes for authentic connections. Fully parametric dimensions let you create bricks of any size while maintaining the precise geometry needed for reliable interlocking.',
    code: legoCode,
    thumbnailKey: 'replicad/lego',
  },
  {
    id: 'proj_simple_tray',
    name: 'Simple Tray',
    description:
      'A practical drawer organizer with customizable compartments. Create the perfect grid layout for your needs with adjustable rows and columns. Features rounded corners, clean shelling, and optional edge fillets for a premium feel. Ideal for organizing tools, office supplies, or any small items that need dedicated spaces.',
    code: simpleTrayCode,
    thumbnailKey: 'replicad/simple-tray',
  },
  {
    id: 'proj_hex_screwdriver',
    name: 'Hex Screwdriver',
    description:
      'A robust M5 hex key screwdriver with a comfortable hexagonal handle and precise tip geometry. Features smooth filleted edges for comfortable grip and accurate shaft dimensions. Perfect for creating custom tools, replacement handles, or educational demonstrations of parametric tool design.',
    code: hexScrewdriverCode,
    thumbnailKey: 'replicad/hex-screwdriver',
  },
  {
    id: 'proj_chair',
    name: 'Chair',
    description:
      'A clean, approachable chair design with balanced proportions and thoughtful ergonomics. Features a solid seat, sturdy square legs, and an adjustable backrest angle for comfort. Optional edge fillets add refinement while maintaining the simple, modern aesthetic. Customize dimensions to fit any space or user preference.',
    code: chairCode,
    thumbnailKey: 'replicad/chair',
  },
] satisfies Model[];
