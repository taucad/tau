/**
 * Reference-backed printer assemblies in the plate frame, millimetres.
 *
 * Anatomy follows Bambu's X1 and A1 mini product/service imagery. Build and
 * outer dimensions are manifest-owned; internal dimensions are photographic
 * estimates, not factory CAD. See the asset-fidelity blueprint for provenance.
 * @module
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PrinterGeometry } from '#components/printer/printer-geometry.js';
import { printerHardwareColors as colors } from '#components/printer/printer-colors.constants.js';

/** One scene owns these groups and all their render resources. */
export type PrinterHardware = Readonly<{
  frame: THREE.Group;
  housing: THREE.Group;
  gantry: THREE.Group;
  bed: THREE.Group;
  head: THREE.Group;
}>;

/** Gradually reveal the print through the head from above; sides and underside stay opaque. */
export const toolheadOpacity = (height: number, distance: number): number => {
  const above = distance > 0 ? height / distance : 0;
  const fade = THREE.MathUtils.smoothstep(above, 0.08, 0.45);
  return 1 - fade * 0.72;
};

/** Build the known mechanical families; callers own and dispose every returned resource. */
export const createPrinterHardware = (geometry: PrinterGeometry): PrinterHardware => {
  const frame = new THREE.Group();
  const housing = new THREE.Group();
  const gantry = new THREE.Group();
  const bed = new THREE.Group();
  const head = new THREE.Group();
  const mini = geometry.model === 'a1-mini';
  const [width, depth, height] = geometry.buildVolume;
  const { beamZ } = geometry.gantry;
  const metal = new THREE.MeshStandardMaterial({ color: colors.aluminium, roughness: 0.38, metalness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: colors.steel, roughness: 0.28, metalness: 0.85 });
  const black = new THREE.MeshStandardMaterial({ color: colors.graphite, roughness: 0.62 });
  const carbon = new THREE.MeshStandardMaterial({ color: colors.carbon, roughness: 0.48, metalness: 0.12 });
  const white = new THREE.MeshStandardMaterial({ color: colors.miniHousing, roughness: 0.48 });
  const glass = new THREE.MeshStandardMaterial({
    color: colors.glass,
    roughness: 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  // Head materials are instance-owned and separate from stationary hardware.
  const shell = (mini ? white : black).clone();
  const headBlack = black.clone();
  const headMetal = metal.clone();
  const box = (
    parent: THREE.Group,
    material: THREE.Material,
    {
      name,
      size,
      center,
      radius = 1,
    }: Readonly<{
      name: string;
      size: readonly [number, number, number];
      center: readonly [number, number, number];
      radius?: number;
    }>,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map((v) => v / 2))),
      material,
    );
    mesh.name = name;
    mesh.position.set(...center);
    parent.add(mesh);
    return mesh;
  };
  const rod = (
    parent: THREE.Group,
    material: THREE.Material,
    {
      name,
      radius,
      length,
      center,
      axis,
    }: Readonly<{
      name: string;
      radius: number;
      length: number;
      center: readonly [number, number, number];
      axis: 'x' | 'y' | 'z';
    }>,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material);
    mesh.name = name;
    if (axis === 'x') {
      mesh.rotation.z = Math.PI / 2;
    }
    if (axis === 'z') {
      mesh.rotation.x = Math.PI / 2;
    }
    mesh.position.set(...center);
    parent.add(mesh);
    return mesh;
  };
  const screw = (parent: THREE.Group, [x, y, z]: readonly [number, number, number]): void => {
    rod(parent, parent === head ? headMetal : steel, {
      name: 'socket-fastener',
      radius: 1.6,
      length: 1.2,
      center: [x, y, z],
      axis: 'y',
    });
    box(parent, parent === head ? headBlack : black, {
      name: 'fastener-slot',
      size: [1.5, 0.3, 0.4],
      center: [x, y - 0.65, z],
      radius: 0.1,
    });
  };
  const tube = (
    parent: THREE.Group,
    material: THREE.Material,
    { name, points, radius }: Readonly<{ name: string; points: readonly THREE.Vector3[]; radius: number }>,
  ): void => {
    const curve = new THREE.CatmullRomCurve3([...points]);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material);
    mesh.name = name;
    parent.add(mesh);
  };

  if (mini) {
    // A1 mini: right-hand Z extrusion, horizontal X rail, Y-moving heatbed.
    box(frame, white, { name: 'y-axis-base', size: [112, 274, 30], center: [width / 2, depth / 2, -42], radius: 9 });
    box(frame, white, { name: 'column-foot', size: [102, 124, 48], center: [width + 30, depth / 2, -31], radius: 12 });
    box(frame, metal, {
      name: 'z-extrusion',
      size: [31, 35, height + 70],
      center: [width + 30, depth / 2, (height + 70) / 2 - 30],
      radius: 2,
    });
    box(frame, steel, {
      name: 'z-rail',
      size: [12, 7, height + 52],
      center: [width + 30, depth / 2 - 21, (height + 52) / 2 - 23],
      radius: 1,
    });
    rod(frame, steel, {
      name: 'z-leadscrew',
      radius: 3.5,
      length: height + 50,
      center: [width + 18, depth / 2, (height + 50) / 2 - 24],
      axis: 'z',
    });
    box(frame, white, {
      name: 'column-cap',
      size: [39, 43, 21],
      center: [width + 30, depth / 2, height + 48],
      radius: 5,
    });
    box(frame, black, { name: 'z-motor', size: [39, 43, 28], center: [width + 30, depth / 2, -14], radius: 3 });
    for (const x of [width / 2 - 32, width / 2 + 32]) {
      box(frame, steel, { name: 'y-linear-rail', size: [9, 245, 8], center: [x, depth / 2, -23], radius: 0.6 });
      for (const y of [0, 45, 90, 135, 180]) {
        rod(frame, black, { name: 'rail-screw', radius: 1.3, length: 0.7, center: [x, y, -18.6], axis: 'z' });
      }
    }
    box(frame, black, { name: 'y-drive-belt', size: [5, 235, 2], center: [width / 2, depth / 2, -20], radius: 0.2 });
    box(gantry, metal, { name: 'x-extrusion', size: [width + 62, 24, 27], center: [width / 2 + 4, 0, 0], radius: 2 });
    box(gantry, steel, { name: 'x-linear-rail', size: [width + 46, 6, 12], center: [width / 2, -15, 1], radius: 0.8 });
    box(gantry, black, { name: 'x-belt', size: [width + 42, 2, 6], center: [width / 2, -13, 10], radius: 0.2 });
    box(gantry, white, { name: 'z-carriage', size: [43, 48, 53], center: [width + 30, 0, 0], radius: 5 });
    box(gantry, black, { name: 'x-motor-end', size: [29, 34, 39], center: [width + 28, 0, 0], radius: 3 });
    box(gantry, white, { name: 'x-idler-cap', size: [16, 32, 32], center: [-23, 0, 0], radius: 4 });
    for (const x of [2, 42, 82, 122, 162]) {
      screw(gantry, [x, -18.2, 1]);
    }
    const display = box(frame, black, {
      name: 'touchscreen-bezel',
      size: [58, 12, 43],
      center: [width + 25, depth / 2 - 75, -10],
      radius: 5,
    });
    display.rotation.x = -0.4;
    const screen = box(frame, glass, {
      name: 'touchscreen-glass',
      size: [48, 1.2, 32],
      center: [width + 25, depth / 2 - 82, -8],
      radius: 3,
    });
    screen.rotation.x = -0.4;
    for (const x of [width / 2 - 35, width / 2 + 35]) {
      for (const y of [-25, depth + 25]) {
        box(frame, black, { name: 'rubber-foot', size: [22, 28, 6], center: [x, y, -60], radius: 3 });
      }
    }
    // Heatbed insulation and Y bearing carriage move with the sheet.
    box(bed, black, { name: 'heatbed', size: [184, 184, 5], center: [width / 2, depth / 2, -4], radius: 2 });
    box(bed, metal, { name: 'bed-carrier', size: [142, 128, 7], center: [width / 2, depth / 2, -10], radius: 5 });
    for (const x of [width / 2 - 32, width / 2 + 32]) {
      box(bed, black, { name: 'y-bearing-block', size: [21, 54, 10], center: [x, depth / 2, -18], radius: 2 });
    }
    box(frame, white, { name: 'nozzle-wiper-mount', size: [15, 24, 12], center: [-18, depth / 2, -7], radius: 2 });
    box(frame, black, { name: 'nozzle-wiper', size: [8, 15, 3], center: [-18, depth / 2, 0], radius: 0.8 });
    box(head, headMetal, {
      name: 'linear-bearing-carriage',
      size: [34, 19, 33],
      center: [0, 15, beamZ + 2],
      radius: 2,
    });
    box(head, shell, { name: 'toolhead-cover', size: [43, 29, 48], center: [0, -5, 43], radius: 5 });
    box(head, headBlack, { name: 'part-cooling-duct', size: [32, 22, 9], center: [0, -3, 15], radius: 3 });
    rod(head, headBlack, { name: 'front-fan-recess', radius: 13.5, length: 1.5, center: [0, -20, 44], axis: 'y' });
    rod(head, headMetal, { name: 'front-fan-hub', radius: 4, length: 2, center: [0, -21.2, 44], axis: 'y' });
    for (let index = 0; index < 7; index++) {
      const angle = (index * Math.PI * 2) / 7;
      const blade = box(head, shell, {
        name: 'fan-blade',
        size: [10, 1, 3],
        center: [Math.cos(angle) * 7.5, -21, 44 + Math.sin(angle) * 7.5],
        radius: 0.5,
      });
      blade.rotation.y = -angle + 0.4;
    }
    for (const x of [-16, 16]) {
      for (const z of [26, 61]) {
        screw(head, [x, -20, z]);
      }
    }
    for (const x of [-9, -3, 3, 9]) {
      rod(head, headBlack, { name: 'ptfe-coupler', radius: 2.4, length: 5, center: [x, 0, 69], axis: 'z' });
      tube(head, shell, {
        name: 'ptfe-inlet',
        points: [new THREE.Vector3(x, 0, 71), new THREE.Vector3(x, 9, 91), new THREE.Vector3(x + 12, 27, 102)],
        radius: 1.8,
      });
    }
  } else {
    // X1C: paired carbon X rods on Y carriages, independent CoreXY belts.
    const [cx, cy, cz] = geometry.enclosure.center;
    const [sx, sy, sz] = geometry.enclosure.size;
    const floor = cz - sz / 2;
    const top = cz + sz / 2;
    const left = cx - sx / 2 + 15;
    const right = cx + sx / 2 - 15;
    const front = cy - sy / 2 + 15;
    const rear = cy + sy / 2 - 15;
    box(frame, black, { name: 'chassis-base', size: [sx - 4, sy - 4, 34], center: [cx, cy, floor + 17], radius: 5 });
    for (const x of [left, right]) {
      for (const y of [front, rear]) {
        box(frame, black, {
          name: 'welded-chassis-post',
          size: [18, 18, sz - 34],
          center: [x, y, cz + 17],
          radius: 1.8,
        });
        box(frame, metal, { name: 'corner-gusset', size: [26, 26, 16], center: [x, y, top - 8], radius: 2 });
      }
      box(frame, black, { name: 'upper-side-rail', size: [18, sy - 30, 20], center: [x, cy, beamZ + 5], radius: 2 });
      rod(frame, steel, { name: 'y-guide-rod', radius: 4, length: sy - 44, center: [x, cy, beamZ], axis: 'y' });
      box(frame, black, {
        name: 'corexy-return-belt',
        size: [2, sy - 50, 6],
        center: [x + (x === left ? 10 : -10), cy, beamZ + 16],
        radius: 0.1,
      });
      for (const y of [front + 5, rear - 5]) {
        rod(frame, metal, {
          name: 'belt-idler',
          radius: 6,
          length: 9,
          center: [x + (x === left ? 10 : -10), y, beamZ + 17],
          axis: 'z',
        });
        rod(frame, black, {
          name: 'idler-cap',
          radius: 2,
          length: 1,
          center: [x + (x === left ? 10 : -10), y, beamZ + 22],
          axis: 'z',
        });
      }
      box(gantry, black, { name: 'y-carriage', size: [24, 38, 34], center: [x, 0, 0], radius: 3 });
      rod(gantry, metal, { name: 'carriage-idler', radius: 5.5, length: 8, center: [x, 0, 21], axis: 'z' });
    }
    for (const z of [-9, 9]) {
      rod(gantry, carbon, { name: 'carbon-x-rod', radius: 4, length: right - left, center: [cx, 0, z], axis: 'x' });
    }
    for (const z of [16, 24]) {
      box(gantry, black, {
        name: 'corexy-cross-belt',
        size: [right - left, 2, 5],
        center: [cx, z === 16 ? -22 : 22, z],
        radius: 0.1,
      });
    }
    for (const y of [front, rear]) {
      box(frame, black, { name: 'upper-crossmember', size: [sx - 30, 18, 18], center: [cx, y, top - 9], radius: 2 });
    }
    for (const [x, y] of [
      [left + 12, front + 16],
      [right - 12, front + 16],
      [cx, rear - 13],
    ]) {
      rod(frame, steel, {
        name: 'z-leadscrew',
        radius: 4,
        length: height + 32,
        center: [x!, y!, -height / 2],
        axis: 'z',
      });
      rod(frame, steel, {
        name: 'z-guide-rod',
        radius: 5,
        length: height + 32,
        center: [x! + 12, y!, -height / 2],
        axis: 'z',
      });
      box(bed, black, { name: 'z-bearing-mount', size: [29, 27, 22], center: [x! + 6, y!, -16], radius: 3 });
    }
    box(bed, black, { name: 'heatbed', size: [257, 257, 7], center: [cx, cy, -5], radius: 2 });
    box(bed, metal, { name: 'bed-support-front', size: [sx - 63, 20, 12], center: [cx, front + 17, -16], radius: 2 });
    for (const x of [cx - 84, cx + 84]) {
      box(bed, metal, { name: 'bed-support-arm', size: [18, sy - 90, 12], center: [x, cy, -16], radius: 2 });
    }
    box(head, headMetal, { name: 'carbon-rod-bearing-block', size: [43, 27, 33], center: [0, 9, beamZ], radius: 3 });
    box(head, shell, { name: 'toolhead-cover', size: [52, 34, 49], center: [0, -13, 39], radius: 4 });
    box(head, headBlack, { name: 'part-cooling-duct', size: [44, 29, 9], center: [0, -10, 13], radius: 2 });
    rod(head, headBlack, { name: 'front-fan-recess', radius: 15, length: 2, center: [0, -31, 42], axis: 'y' });
    rod(head, headMetal, { name: 'front-fan-hub', radius: 4.5, length: 2, center: [0, -32.4, 42], axis: 'y' });
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI) / 4;
      const blade = box(head, shell, {
        name: 'fan-blade',
        size: [11, 1, 3],
        center: [Math.cos(angle) * 8, -32, 42 + Math.sin(angle) * 8],
        radius: 0.6,
      });
      blade.rotation.y = -angle + 0.5;
    }
    for (const x of [-20, 20]) {
      for (const z of [21, 59]) {
        screw(head, [x, -31, z]);
      }
    }
    box(head, headBlack, { name: 'lidar-module', size: [15, 21, 18], center: [-32, -9, 19], radius: 2 });
    rod(head, glass.clone(), { name: 'lidar-lens', radius: 3, length: 1, center: [-32, -20, 19], axis: 'y' });
    tube(head, shell, {
      name: 'ptfe-inlet',
      points: [new THREE.Vector3(8, 3, 65), new THREE.Vector3(8, 15, top - 10), new THREE.Vector3(36, 32, top - 6)],
      radius: 2,
    });
    for (const x of [left + 14, right - 14]) {
      box(frame, black, { name: 'corexy-motor', size: [35, 35, 28], center: [x, rear - 15, beamZ - 16], radius: 2 });
      rod(frame, metal, { name: 'motor-pulley', radius: 5, length: 12, center: [x, rear - 15, beamZ + 5], axis: 'z' });
    }
    box(frame, black, { name: 'purge-chute', size: [33, 31, 48], center: [left + 35, rear - 28, -17], radius: 3 });
    box(frame, metal, { name: 'nozzle-wiper', size: [18, 6, 3], center: [left + 36, rear - 43, 4], radius: 1 });
    for (let index = 0; index < 18; index++) {
      box(gantry, black, {
        name: 'cable-chain-link',
        size: [10, 13, 8],
        center: [cx + index * 6 - 50, 30, 29],
        radius: 1.5,
      });
    }
    rod(frame, black, {
      name: 'chamber-fan-housing',
      radius: 31,
      length: 6,
      center: [right - 3, rear - 75, -60],
      axis: 'x',
    });
    rod(frame, metal, {
      name: 'chamber-fan-hub',
      radius: 8,
      length: 7,
      center: [right - 7, rear - 75, -60],
      axis: 'x',
    });
    // Enclosure skin is independent of the load-bearing mechanism.
    for (const x of [cx - sx / 2, cx + sx / 2]) {
      box(housing, metal, {
        name: 'aluminium-side-panel',
        size: [2, sy - 8, sz - 20],
        center: [x, cy, cz + 5],
        radius: 1,
      });
    }
    box(housing, metal, {
      name: 'rear-panel',
      size: [sx - 8, 2, sz - 20],
      center: [cx, cy + sy / 2, cz + 5],
      radius: 1,
    });
    box(housing, glass, {
      name: 'glass-door',
      size: [sx - 38, 3, sz - 55],
      center: [cx, cy - sy / 2, cz + 8],
      radius: 8,
    });
    box(housing, glass, { name: 'glass-lid', size: [sx - 25, sy - 25, 3], center: [cx, cy, top + 1], radius: 5 });
    box(housing, black, {
      name: 'door-handle',
      size: [12, 15, 73],
      center: [right - 19, cy - sy / 2 - 8, cz + 25],
      radius: 4,
    });
    for (const z of [floor + 65, top - 60]) {
      box(housing, black, { name: 'door-hinge', size: [10, 12, 22], center: [left + 3, cy - sy / 2, z], radius: 2 });
    }
    const display = box(housing, black, {
      name: 'touchscreen-bezel',
      size: [83, 13, 64],
      center: [left + 43, front - 11, top - 16],
      radius: 5,
    });
    display.rotation.x = -0.25;
    const screen = box(housing, glass, {
      name: 'touchscreen-glass',
      size: [72, 1.2, 49],
      center: [left + 43, front - 19, top - 14],
      radius: 3,
    });
    screen.rotation.x = -0.25;
    for (const x of [left, right]) {
      for (const y of [front, rear]) {
        box(frame, black, { name: 'rubber-foot', size: [32, 32, 7], center: [x, y, floor - 3.5], radius: 4 });
      }
    }
  }
  // Materials constructed for the other family are not retained by the scene.
  const used = new Set<THREE.Material>();
  for (const group of [frame, housing, gantry, bed, head]) {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        for (const material of Array.isArray((object as THREE.Mesh).material)
          ? ((object as THREE.Mesh).material as THREE.Material[])
          : [(object as THREE.Mesh).material as THREE.Material]) {
          used.add(material);
        }
      }
    });
  }
  for (const material of [metal, steel, black, carbon, white, glass, shell, headBlack, headMetal]) {
    if (!used.has(material)) {
      material.dispose();
    }
  }
  return { frame, housing, gantry, bed, head };
};
