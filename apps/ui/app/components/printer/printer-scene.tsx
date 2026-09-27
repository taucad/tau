/* oxlint-disable react/immutability -- This uncompiled R3F boundary mutates the Three.js scene it exclusively owns. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons';
import type CameraControlsImpl from 'camera-controls';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import {
  resolveCameraControlProps,
  TauCameraControls,
} from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { printerBackground, printerBody } from '#components/printer/printer-colors.constants.js';
import {
  framedPartBox,
  framedPrintBox,
  framePrinterCamera,
  partBounds,
  plateOffsetForHeight,
  printerCameraFov,
  toolheadLiftForHeight,
} from '#components/printer/printer-geometry.js';
import type { PrinterBounds, PrinterBox, PrinterGeometry, PrinterPanel } from '#components/printer/printer-geometry.js';
import { eventValueAt } from '#components/printer/printer-playback.js';
import type { PlaybackStore } from '#components/printer/printer-playback.js';
import { liftPlateSurface, plateModelMatrix, printerHotendModel } from '#components/printer/printer-plates.js';
import type { PrinterPlateModel } from '#components/printer/printer-plates.js';
import {
  createToolpathPalette,
  createToolpathReveal,
  setToolpathVisibility,
  updateToolpathReveal,
} from '#components/printer/printer-toolpath.js';
import type { ToolpathGroup, ToolpathGrouping, ToolpathReveal } from '#components/printer/printer-toolpath.js';

export type PrinterSceneProps = Readonly<{
  program: ToolpathProgram;
  geometry: PrinterGeometry;
  store: PlaybackStore;
  theme: 'light' | 'dark';
  /** `#RRGGBB` of the filament the walls take. */
  filamentColor: string;
  chamberLight: 'on' | 'off' | 'unknown';
  /** No glow pulse; autoplay is the viewer's decision. */
  isReducedMotion: boolean;
  /** Degrees Celsius reported by the machine, overriding the program's events. */
  liveNozzleTarget: number | undefined;
  /** Bumped by "Frame the print": frame the print again and follow the pane size from here. */
  frameRequest: number;
  /** The whole machine around the plate, or only the plate, the toolpath and the nozzle. */
  isWholePrinter: boolean;
  plate: PrinterPlateModel;
  /** The filter group of every segment. */
  grouping: ToolpathGrouping;
  /** Groups the G-code filter hides; a stable set per change. */
  hiddenGroups: ReadonlySet<ToolpathGroup>;
  onContextLost: () => void;
}>;

/** The rig poses the camera on mount; this only seeds it, and stays constant so R3F never re-applies it. */
const cameraOptions = {
  position: [0, -1000, 500] as [number, number, number],
  up: [0, 0, 1] as [number, number, number],
  fov: printerCameraFov,
  near: 5,
  far: 20_000,
};
/** Seconds. Frames after a hidden tab must not leap the cursor forward. */
const maximumFrameDelta = 0.1;
/** Degrees Celsius at which the nozzle glow saturates. */
const glowSaturationTemperature = 300;
const plateGridPitch = 10;
/** Millimetres the eye must be inside a wall's plane to draw it; nearer, the wall and its edges would cut across the view. */
const wallViewMargin = 50;
/** The lit chamber light's glow, in the units of the scene's directional lights. */
const chamberLampIntensity = 0.9;
/** Millimetres the plate's edge stands out around the printable area, and the radius of its corners. */
const plateMargin = 3;
const plateCornerRadius = 8;
/** Millimetres above the plate the nozzle waits before the program moves it. */
const plateFocusParkHeight = 10;
/** Millimetres of heat sink drawn above the heater block when only the plate is shown. */
const hotendHeatSinkLength = 24;
const plateRoughness: Readonly<Record<PrinterPlateModel['finish'], number>> = {
  smooth: 0.3,
  matte: 0.65,
  textured: 0.9,
};
const gltfLoader = new GLTFLoader();
const boundsKey = ({ min, max }: PrinterBounds): string => [...min, ...max].join(',');
/** The CAD viewer's own camera feel, without its easing. */
const printerCameraControlProps = resolveCameraControlProps({ enablePan: true, enableZoom: true });

/** The plate's opacity seen from below the print surface: a shade over the print, as Bambu Studio draws it. */
const plateUndersideOpacity = 0.2;
/** The mesh that is the print surface, in the plate GLBs and the flat stand-in alike. */
const plateSurfaceName = 'surface';

/**
 * Draw the plate whole and opaque, or as the underside shade: only the print surface, see-through,
 * since the steel and markings under it would stack their shades into an opaque plate again.
 */
const setPlateSeeThrough = (object: THREE.Object3D, isSeeThrough: boolean): void => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const isSurface = child.name === plateSurfaceName;
    child.visible = isSurface || !isSeeThrough;
    if (!isSurface) {
      return;
    }
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material instanceof THREE.Material && material.transparent !== isSeeThrough) {
        material.transparent = isSeeThrough;
        material.opacity = isSeeThrough ? plateUndersideOpacity : 1;
        material.depthWrite = !isSeeThrough;
        material.needsUpdate = true;
      }
    }
  });
};

const boxMesh = (box: PrinterBox, material: THREE.Material): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...box.size), material);
  mesh.position.set(...box.center);
  return mesh;
};

const boxEdges = (box: PrinterBox, material: THREE.Material, inset = 0): THREE.LineSegments => {
  const size = box.size.map((value) => Math.max(0.1, value - inset * 2)) as [number, number, number];
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), material);
  edges.position.set(...box.center);
  return edges;
};

const plateGrid = (geometry: PrinterGeometry, material: THREE.Material): THREE.LineSegments => {
  const [width, depth] = geometry.buildVolume;
  const points: number[] = [];
  for (let x = 0; x <= width; x += plateGridPitch) {
    points.push(x, 0, 0.3, x, depth, 0.3);
  }
  for (let y = 0; y <= depth; y += plateGridPitch) {
    points.push(0, y, 0.3, width, y, 0.3);
  }
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(grid, material);
};

/** A wall of the enclosure and the direction into the chamber, for hiding walls between the eye and the print. */
type EnclosureWall = Readonly<{
  face: PrinterPanel['face'];
  object: THREE.Group;
  point: THREE.Vector3;
  inward: THREE.Vector3;
}>;

const inwardNormals: Readonly<Record<PrinterPanel['face'], readonly [number, number, number]>> = {
  front: [0, 1, 0],
  back: [0, -1, 0],
  left: [1, 0, 0],
  right: [-1, 0, 0],
  top: [0, 0, -1],
};

type MachineParts = Readonly<{
  root: THREE.Group;
  walls: readonly EnclosureWall[];
  plateGroup: THREE.Group;
  toolhead: THREE.Group;
  /** The drawn hotend the plate-focus scene swaps for the Replicad model once it loads. */
  hotendStandIn: THREE.Group;
  beam: THREE.Mesh | undefined;
  nozzleMaterial: THREE.MeshStandardMaterial;
  lightMaterial: THREE.MeshStandardMaterial;
  /** The chamber light's glow on the plate, gantry and walls; absent without a light. */
  lamp: THREE.PointLight | undefined;
  reveal: ToolpathReveal;
  head: THREE.Vector3;
  dispose: () => void;
}>;

const buildMachine = ({
  geometry,
  program,
  theme,
  filamentColor,
  isWholePrinter,
  grouping,
}: Pick<
  PrinterSceneProps,
  'geometry' | 'program' | 'theme' | 'filamentColor' | 'isWholePrinter' | 'grouping'
>): MachineParts => {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const own = <T extends THREE.Material>(material: T): T => {
    materials.add(material);
    return material;
  };
  const track = <T extends THREE.Object3D>(object: T): T => {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        geometries.add((child as THREE.Mesh).geometry);
      }
    });
    return object;
  };
  const root = new THREE.Group();
  const walls: EnclosureWall[] = [];
  const frameMaterial = own(new THREE.LineBasicMaterial({ color: printerBody.frame[theme] }));
  const nozzleMaterial = own(
    new THREE.MeshStandardMaterial({
      color: printerBody.nozzle,
      emissive: new THREE.Color(printerBody.nozzleGlow),
      emissiveIntensity: 0,
      roughness: 0.35,
      metalness: 0.8,
    }),
  );
  const lightMaterial = own(
    new THREE.MeshStandardMaterial({ color: printerBody.lightOff, emissive: new THREE.Color(printerBody.lightOn) }),
  );
  let beam: THREE.Mesh | undefined;
  let lamp: THREE.PointLight | undefined;

  // The hotend: a glowing nozzle under its heater block, on the gantry's carriage when the whole printer
  // shows and under its heat sink when only the plate does.
  const { nozzleLength } = geometry.toolhead;
  const toolhead = new THREE.Group();
  const heater = new THREE.Mesh(
    new THREE.BoxGeometry(16, 12, 8),
    own(new THREE.MeshStandardMaterial({ color: printerBody.carriage, roughness: 0.45, metalness: 0.6 })),
  );
  heater.position.z = nozzleLength + 4;
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(3.5, nozzleLength, 16), nozzleMaterial);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.z = nozzleLength / 2;
  const hotendStandIn = new THREE.Group();
  hotendStandIn.add(heater, nozzle);
  toolhead.add(hotendStandIn);
  if (!isWholePrinter) {
    const heatSink = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.5, hotendHeatSinkLength, 20),
      own(new THREE.MeshStandardMaterial({ color: printerBody.rail, roughness: 0.4, metalness: 0.6 })),
    );
    heatSink.rotation.x = Math.PI / 2;
    heatSink.position.z = nozzleLength + 8 + hotendHeatSinkLength / 2;
    hotendStandIn.add(heatSink);
  }

  if (isWholePrinter) {
    // Enclosure: opaque base, translucent panels, frame edges, doors with an inset frame.
    const glassMaterial = own(
      new THREE.MeshStandardMaterial({
        color: printerBody.glass[theme],
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        roughness: 0.15,
        metalness: 0.05,
      }),
    );
    const bodyMaterial = own(new THREE.MeshStandardMaterial({ color: printerBody.base[theme], roughness: 0.7 }));
    root.add(track(boxMesh(geometry.base, bodyMaterial)));
    // Walls on the eye's side hide each frame with their edges (a cutaway): the print is never seen through
    // glass or behind a frame line, and the far walls stay as the chamber around it.
    for (const panel of geometry.panels) {
      const object = new THREE.Group();
      object.add(track(boxMesh(panel.box, glassMaterial)), track(boxEdges(panel.box, frameMaterial)));
      if (panel.isDoor) {
        object.add(track(boxEdges(panel.box, frameMaterial, 12)));
      }
      root.add(object);
      walls.push({
        face: panel.face,
        object,
        point: new THREE.Vector3(...panel.box.center),
        inward: new THREE.Vector3(...inwardNormals[panel.face]),
      });
    }

    // Gantry: rails, the moving beam and the toolhead carriage.
    const railMaterial = own(
      new THREE.MeshStandardMaterial({ color: printerBody.rail, roughness: 0.4, metalness: 0.6 }),
    );
    for (const rail of geometry.gantry.rails) {
      root.add(track(boxMesh(rail, railMaterial)));
    }
    const [centerX, centerY] = geometry.enclosure.center;
    if (geometry.gantry.kind !== 'delta') {
      beam = boxMesh(
        { center: [centerX, centerY, geometry.gantry.beamZ], size: geometry.gantry.beamSize },
        own(new THREE.MeshStandardMaterial({ color: printerBody.beam, roughness: 0.4, metalness: 0.5 })),
      );
      root.add(track(beam));
    }
    const carriage = new THREE.Mesh(
      new THREE.BoxGeometry(...geometry.gantry.carriageSize),
      own(new THREE.MeshStandardMaterial({ color: printerBody.carriage, roughness: 0.5, metalness: 0.3 })),
    );
    carriage.position.z = geometry.gantry.beamZ;
    toolhead.add(carriage);

    // Material unit on the lid, purge chute at the rear, chamber light at the front.
    if (geometry.materialUnit) {
      const unit = geometry.materialUnit;
      // A clear lid like the real unit's, so the spools inside read through it.
      const unitMaterial = own(
        new THREE.MeshStandardMaterial({
          color: printerBody.materialUnit[theme],
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          roughness: 0.4,
          side: THREE.DoubleSide,
        }),
      );
      root.add(track(boxMesh(unit.box, unitMaterial)), track(boxEdges(unit.box, frameMaterial)));
      const spoolMaterial = own(new THREE.MeshStandardMaterial({ color: printerBody.spool[theme], roughness: 0.8 }));
      const spoolGeometry = new THREE.CylinderGeometry(unit.spoolRadius, unit.spoolRadius, unit.spoolWidth, 24);
      for (const [x, y, z] of unit.spools) {
        const spool = new THREE.Mesh(spoolGeometry, spoolMaterial);
        spool.position.set(x, y, z);
        // Spools sit in a row across the unit with their axles along X.
        spool.rotation.z = Math.PI / 2;
        root.add(track(spool));
      }
    }
    root.add(track(boxMesh(geometry.purgeChute, own(new THREE.MeshStandardMaterial({ color: printerBody.chute })))));
    // The strip hangs behind the front frame and leaves with it in the cutaway; its glow stays on the chamber.
    if (geometry.light) {
      const strip = track(boxMesh(geometry.light, lightMaterial));
      (walls.find(({ face }) => face === 'front')?.object ?? root).add(strip);
      lamp = new THREE.PointLight(printerBody.lightOn, 0, 0, 0);
      lamp.position.set(...geometry.light.center);
      root.add(lamp);
    }

    // The envelope stays put in world space.
    root.add(
      track(
        boxEdges(
          geometry.envelope,
          own(new THREE.LineBasicMaterial({ color: printerBody.envelope, transparent: true, opacity: 0.35 })),
        ),
      ),
    );
  }
  root.add(track(toolhead));

  // The plate group carries the plate surface, the whole printer's grid and the toolpath.
  const plateGroup = new THREE.Group();
  if (isWholePrinter) {
    plateGroup.add(
      track(plateGrid(geometry, own(new THREE.LineBasicMaterial({ color: printerBody.plateGrid[theme] })))),
    );
  }
  const reveal = createToolpathReveal(program, createToolpathPalette(filamentColor, theme), grouping);
  plateGroup.add(reveal.lines, reveal.trail);
  root.add(plateGroup);

  return {
    root,
    walls,
    plateGroup,
    toolhead,
    hotendStandIn,
    beam,
    nozzleMaterial,
    lightMaterial,
    lamp,
    reveal,
    head: new THREE.Vector3(),
    dispose: () => {
      reveal.dispose();
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const material of materials) {
        material.dispose();
      }
    },
  };
};

/** A flat stand-in for a plate: the printable area with a rounded edge around it, its top at z = 0. */
const createFlatPlate = (
  geometry: Pick<PrinterGeometry, 'buildVolume' | 'plate'>,
  plate: PrinterPlateModel,
): Readonly<{ object: THREE.Object3D; dispose: () => void }> => {
  const [width, depth] = geometry.buildVolume;
  const thickness = geometry.plate.size[2];
  const [left, front, right, back] = [-plateMargin, -plateMargin, width + plateMargin, depth + plateMargin];
  const radius = plateCornerRadius;
  const outline = new THREE.Shape()
    .moveTo(left + radius, front)
    .lineTo(right - radius, front)
    .quadraticCurveTo(right, front, right, front + radius)
    .lineTo(right, back - radius)
    .quadraticCurveTo(right, back, right - radius, back)
    .lineTo(left + radius, back)
    .quadraticCurveTo(left, back, left, back - radius)
    .lineTo(left, front + radius)
    .quadraticCurveTo(left, front, left + radius, front);
  const slab = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  const material = new THREE.MeshStandardMaterial({
    color: liftPlateSurface(new THREE.Color(plate.color)),
    roughness: plateRoughness[plate.finish],
    metalness: plate.finish === 'textured' ? 0.35 : 0.1,
  });
  const mesh = new THREE.Mesh(slab, material);
  mesh.name = plateSurfaceName;
  mesh.position.z = -thickness;
  return {
    object: mesh,
    dispose: () => {
      slab.dispose();
      material.dispose();
    },
  };
};

/** Every geometry, material and texture a loaded GLB owns, except `kept`, a scene material it borrowed. */
const disposeLoadedModel = (scene: THREE.Object3D, kept?: THREE.Material): void => {
  const resources = new Set<{ dispose: () => void }>();
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const { geometry, material: materials } = child as THREE.Mesh;
      resources.add(geometry);
      for (const material of Array.isArray(materials) ? materials : [materials]) {
        resources.add(material);
        for (const value of Object.values(material) as unknown[]) {
          if (value instanceof THREE.Texture) {
            resources.add(value);
          }
        }
      }
    }
  });
  if (kept) {
    resources.delete(kept);
  }
  for (const resource of resources) {
    resource.dispose();
  }
};

/**
 * The X1C hotend from `@taucad/bambu` on the plate-focus toolhead, its nozzle
 * taking the scene's glowing nozzle material. The drawn stand-in shows while it
 * loads and stays if it cannot.
 */
function PrinterHotendModel({
  toolhead,
  standIn,
  nozzleMaterial,
}: Readonly<{
  toolhead: THREE.Group;
  standIn: THREE.Group;
  nozzleMaterial: THREE.MeshStandardMaterial;
}>): undefined {
  'use no memo'; // R3F owns imperative Three.js objects.
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let scene: THREE.Object3D | undefined;
    let isActive = true;
    const load = async (): Promise<void> => {
      try {
        const gltf = await gltfLoader.loadAsync(printerHotendModel.href);
        scene = gltf.scene;
      } catch {
        return;
      }
      scene.applyMatrix4(plateModelMatrix);
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name.toLowerCase().includes('nozzle')) {
          (child.material as THREE.Material).dispose();
          child.material = nozzleMaterial;
        }
      });
      if (!isActive) {
        disposeLoadedModel(scene, nozzleMaterial);
        return;
      }
      standIn.visible = false;
      toolhead.add(scene);
      invalidate();
    };
    // async-iife: bootstrap — React effects cannot await the load; the cleanup flag owns its lifecycle.
    void load();
    return () => {
      isActive = false;
      if (scene) {
        toolhead.remove(scene);
        disposeLoadedModel(scene, nozzleMaterial);
      }
      standIn.visible = true;
    };
  }, [invalidate, nozzleMaterial, standIn, toolhead]);
  return undefined;
}

/**
 * The selected plate on the plate group: its GLB once one is published and
 * loaded, the flat stand-in until then or when loading fails.
 */
function PrinterPlateSurface({
  geometry,
  plate,
  parent,
}: Readonly<{ geometry: PrinterGeometry; plate: PrinterPlateModel; parent: THREE.Group }>): undefined {
  'use no memo'; // R3F owns imperative Three.js objects.
  const invalidate = useThree((state) => state.invalidate);
  const flat = useMemo(() => createFlatPlate(geometry, plate), [geometry, plate]);
  const [loaded, setLoaded] = useState<Readonly<{ plate: PrinterPlateModel; scene: THREE.Object3D }>>();
  useEffect(
    () => () => {
      flat.dispose();
    },
    [flat],
  );
  useEffect(() => {
    const url = plate.model;
    if (!url) {
      return;
    }
    let scene: THREE.Object3D | undefined;
    let isActive = true;
    const load = async (): Promise<void> => {
      try {
        const gltf = await gltfLoader.loadAsync(url.href);
        scene = gltf.scene;
      } catch {
        // The flat plate stays when the model cannot load.
        return;
      }
      // The one transform from glTF's Y-up metres into the plate frame.
      scene.applyMatrix4(plateModelMatrix);
      // Lifting the surface's material also lifts markings printed in the surface colour.
      const surfaceMesh = scene.getObjectByName(plateSurfaceName);
      if (surfaceMesh instanceof THREE.Mesh && surfaceMesh.material instanceof THREE.MeshStandardMaterial) {
        liftPlateSurface(surfaceMesh.material.color);
      }
      if (isActive) {
        setLoaded({ plate, scene });
      } else {
        disposeLoadedModel(scene);
      }
    };
    // async-iife: bootstrap — React effects cannot await the load; the cleanup flag owns its lifecycle.
    void load();
    return () => {
      isActive = false;
      if (scene) {
        disposeLoadedModel(scene);
      }
    };
  }, [plate]);
  const surface = loaded?.plate === plate ? loaded.scene : flat.object;
  const isSeeThrough = useRef(false);
  useEffect(() => {
    parent.add(surface);
    setPlateSeeThrough(surface, false);
    isSeeThrough.current = false;
    invalidate();
    return () => {
      parent.remove(surface);
    };
  }, [invalidate, parent, surface]);
  const eye = useMemo(() => new THREE.Vector3(), []);
  // From below the print surface the plate would hide the print; like Bambu Studio, it turns to a shade.
  useFrame(({ camera }) => {
    const isBelow = parent.worldToLocal(eye.copy(camera.position)).z < 0;
    if (isBelow !== isSeeThrough.current) {
      isSeeThrough.current = isBelow;
      setPlateSeeThrough(surface, isBelow);
    }
  });
  return undefined;
}

function PrinterObjects({
  program,
  geometry,
  store,
  theme,
  filamentColor,
  chamberLight,
  isReducedMotion,
  liveNozzleTarget,
  isWholePrinter,
  plate,
  grouping,
  hiddenGroups,
}: Omit<PrinterSceneProps, 'onContextLost' | 'frameRequest'>): React.JSX.Element {
  'use no memo'; // R3F owns imperative Three.js poses, buffers and uniforms.
  const { invalidate, scene } = useThree();
  const [eye] = useState(() => new THREE.Vector3());
  const machine = useMemo(
    () => buildMachine({ geometry, program, theme, filamentColor, isWholePrinter, grouping }),
    [geometry, program, theme, filamentColor, isWholePrinter, grouping],
  );
  useEffect(
    () => () => {
      machine.dispose();
    },
    [machine],
  );
  useEffect(() => {
    scene.background = new THREE.Color(printerBackground[theme]);
    invalidate();
  }, [invalidate, scene, theme]);
  useEffect(() => {
    machine.lightMaterial.emissiveIntensity = chamberLight === 'on' ? 1.6 : chamberLight === 'unknown' ? 0.25 : 0;
    machine.lightMaterial.color.set(chamberLight === 'on' ? printerBody.lightOn : printerBody.lightOff);
    if (machine.lamp) {
      machine.lamp.intensity = chamberLight === 'on' ? chamberLampIntensity : 0;
    }
    invalidate();
  }, [chamberLight, invalidate, machine]);
  useEffect(() => store.subscribe(invalidate), [invalidate, store]);
  useEffect(() => {
    setToolpathVisibility(machine.reveal, hiddenGroups);
    invalidate();
  }, [hiddenGroups, invalidate, machine]);

  useFrame((state, delta) => {
    for (const wall of machine.walls) {
      wall.object.visible = eye.copy(state.camera.position).sub(wall.point).dot(wall.inward) > wallViewMargin;
    }
    store.advance(Math.min(delta, maximumFrameDelta));
    const time = store.getTime();
    const { head } = machine;
    const { segment } = updateToolpathReveal({ reveal: machine.reveal, program, time, head });
    if (segment < 0) {
      head.set(...geometry.toolhead.home);
      if (!isWholePrinter) {
        head.z = plateFocusParkHeight;
      }
    }
    // With only the plate drawn, the plate stays put and the nozzle climbs with the print.
    machine.plateGroup.position.z = isWholePrinter ? plateOffsetForHeight(geometry, head.z) : 0;
    const headZ = isWholePrinter ? toolheadLiftForHeight(geometry, head.z) : head.z;
    machine.toolhead.position.set(head.x, head.y, headZ);
    if (machine.beam) {
      machine.beam.position.y = head.y;
      machine.beam.position.z = geometry.gantry.beamZ + headZ;
    }
    const target = liveNozzleTarget ?? eventValueAt(program.events, 'nozzle-temperature', time) ?? 0;
    const glow = Math.min(1, Math.max(0, target / glowSaturationTemperature));
    const { isPlaying } = store.getSnapshot();
    const pulse = !isReducedMotion && isPlaying ? 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 5) : 1;
    machine.nozzleMaterial.emissiveIntensity = glow * 2.2 * pulse;
    if (isPlaying) {
      invalidate();
    }
  });

  return (
    <>
      {/* Keyed: R3F keeps the first object when a primitive's `object` alone changes. */}
      <primitive key={machine.root.uuid} object={machine.root} />
      <PrinterPlateSurface geometry={geometry} plate={plate} parent={machine.plateGroup} />
      {isWholePrinter ? null : (
        <PrinterHotendModel
          toolhead={machine.toolhead}
          standIn={machine.hotendStandIn}
          nozzleMaterial={machine.nozzleMaterial}
        />
      )}
    </>
  );
}

/**
 * Frames the print on mount and whenever the canvas changes shape, until the
 * person orbits, pans or zooms; a new frame request hands framing back.
 */
function PrinterCamera({
  geometry,
  box,
  frameRequest,
  isReducedMotion,
}: Readonly<{
  /** The machine whose enclosure the eye stays outside; `undefined` when only the plate is drawn. */
  geometry: PrinterGeometry | undefined;
  box: PrinterBounds;
  frameRequest: number;
  isReducedMotion: boolean;
}>): React.JSX.Element {
  const controls = useRef<CameraControlsImpl>(null);
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  // A re-read file hands over an equal box; keeping the first one means only new values move the camera.
  const [framedBox, setFramedBox] = useState(box);
  if (boundsKey(framedBox) !== boundsKey(box)) {
    setFramedBox(box);
  }
  const invalidate = useThree((state) => state.invalidate);
  // The person's view wins over the pane size: telemetry and resizes never move a camera they placed.
  const isFollowing = useRef(true);
  const handledRequest = useRef(frameRequest);
  const release = useCallback(() => {
    isFollowing.current = false;
  }, []);
  useLayoutEffect(() => {
    const isRequested = frameRequest !== handledRequest.current;
    handledRequest.current = frameRequest;
    if (isRequested) {
      isFollowing.current = true;
    }
    if (!isFollowing.current || !controls.current) {
      return;
    }
    const { position, target } = framePrinterCamera(geometry, framedBox, aspect);
    void controls.current.setLookAt(...position, ...target, isRequested && !isReducedMotion);
    invalidate();
  }, [aspect, framedBox, frameRequest, geometry, invalidate, isReducedMotion]);
  return <TauCameraControls ref={controls} makeDefault onControl={release} {...printerCameraControlProps} />;
}

/** The printer or its plate alone, the toolpath and the camera for one program. */
export function PrinterScene(props: PrinterSceneProps): React.JSX.Element {
  const { geometry, program, frameRequest, isReducedMotion, onContextLost, isWholePrinter } = props;
  // Public viewers stay on WebGL; the existing internal override is used for parity checks.
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const gl = useMemo(() => createTauR3fGlProp(backend), [backend]);
  // The whole printer frames the plate and its travel; the plate alone frames the finished part. Neither
  // depends on playback or the G-code filter, so the camera holds still while the part prints.
  const part = useMemo(() => partBounds(program), [program]);
  const box = useMemo(
    () => (isWholePrinter ? framedPrintBox(geometry, part ?? program.bounds) : framedPartBox(geometry, part)),
    [geometry, isWholePrinter, part, program.bounds],
  );
  return (
    <Canvas
      key={backend}
      gl={gl}
      data-graphics-backend={backend}
      frameloop='demand'
      dpr={[1, 1.5]}
      camera={cameraOptions}
      onCreated={({ gl: renderer }) => {
        renderer.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
      }}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.35} position={[0, 0, 1]} />
      <directionalLight intensity={1.1} position={[300, -400, 600]} />
      <directionalLight intensity={0.35} position={[-300, 200, 300]} />
      <PrinterCamera
        geometry={isWholePrinter ? geometry : undefined}
        box={box}
        frameRequest={frameRequest}
        isReducedMotion={isReducedMotion}
      />
      <PrinterObjects {...props} />
    </Canvas>
  );
}
/* oxlint-enable react/immutability */
