import type { BeadData } from '#components/printer/printer-bead-data.js';
import type { FilamentMode } from '#components/printer/printer-filament-material.js';
/* oxlint-disable react/immutability -- This uncompiled R3F boundary mutates the Three.js scene it exclusively owns. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type CameraControlsImpl from 'camera-controls';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import {
  resolveCameraControlProps,
  TauCameraControls,
} from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { applyPlateGrain, plateStandInOutline } from '#components/printer/printer-plate-surface.js';
import { createPrinterHardware, toolheadOpacity } from '#components/printer/printer-hardware.js';
import { printerBackground, printerBody } from '#components/printer/printer-colors.constants.js';
import {
  framedPartBox,
  framePrinterCamera,
  partBounds,
  plateOffsetForHeight,
  plateOffsetForY,
  printerCameraFov,
  toolheadLiftForHeight,
} from '#components/printer/printer-geometry.js';
import type { PrinterBounds, PrinterBox, PrinterGeometry } from '#components/printer/printer-geometry.js';
import type { PlaybackStore } from '#components/printer/printer-playback.js';
import {
  plateModelMatrix,
  printerHotendForModel,
  printerPlateModelForMachine,
} from '#components/printer/printer-plates.js';
import type { PrinterPlateModel } from '#components/printer/printer-plates.js';
import {
  createToolpathPalette,
  createToolpathReveal,
  setToolpathPalettes,
  setToolpathAppearance,
  setToolpathVisibility,
  updateToolpathReveal,
} from '#components/printer/printer-toolpath.js';
import type { ToolpathReveal } from '#components/printer/printer-toolpath.js';
import type { ToolpathGroup, ToolpathGrouping } from '#components/printer/printer-toolpath-groups.js';

export type PrinterSceneProps = Readonly<{
  program: ToolpathProgram;
  beads?: BeadData;
  appearance?: FilamentMode;
  analysisMaximum?: number;
  emphasizeLayer?: boolean;
  geometry: PrinterGeometry;
  preparedBounds?: PrinterBounds;
  onFirstFrame?: () => void;
  store: PlaybackStore;
  theme: 'light' | 'dark';
  /** `#RRGGBB` per tool: entry *i* is the filament whose colour tool `T<i>`'s walls and infill take. */
  filamentColors: readonly string[];
  chamberLight: 'on' | 'off' | 'unknown';
  /** No glow pulse; autoplay is the viewer's decision. */
  isReducedMotion: boolean;
  /** Degrees Celsius reported by the machine, overriding the program's events. */
  liveNozzleTarget: number | undefined;
  /** Bumped by "Frame the print": frame the print again and follow the pane size from here. */
  frameRequest: number;
  /** The whole machine around the plate, or only the plate, the toolpath and the nozzle. */
  isWholePrinter: boolean;
  /** Hide the enclosure skin while retaining the complete mechanism. */
  isHousingVisible?: boolean;
  /** Loading or unavailable physical assets remain explicit in the viewer. */
  onAssetStatus?: (message: string | undefined) => void;
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
/** The lit chamber light's glow, in the units of the scene's directional lights. */
const chamberLampIntensity = 0.9;
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

type MachineParts = Readonly<{
  root: THREE.Group;
  plateGroup: THREE.Group;
  toolhead: THREE.Group;
  /** The drawn hotend the plate-focus scene swaps for the Replicad model once it loads. */
  hotendStandIn: THREE.Group;
  beam: THREE.Object3D | undefined;
  housing: THREE.Group | undefined;
  bed: THREE.Group | undefined;
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
  theme,
  isWholePrinter,
  reveal,
}: Pick<PrinterSceneProps, 'geometry' | 'theme' | 'isWholePrinter'> & { reveal: ToolpathReveal }): MachineParts => {
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
  let beam: THREE.Object3D | undefined;
  let housing: THREE.Group | undefined;
  let bed: THREE.Group | undefined;
  let lamp: THREE.PointLight | undefined;

  // The hotend: a metallic nozzle under its heater block, on the gantry's carriage when the whole printer
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

  if (geometry.model === 'x1c' || geometry.model === 'a1-mini') {
    const hardware = createPrinterHardware(geometry);
    for (const group of Object.values(hardware)) {
      track(group);
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          for (const material of Array.isArray((object as THREE.Mesh).material)
            ? ((object as THREE.Mesh).material as THREE.Material[])
            : [(object as THREE.Mesh).material as THREE.Material]) {
            own(material);
          }
        }
      });
    }
    toolhead.add(hardware.head);
    // The precise hotend GLB replaces only its tip stand-in, never the cover.
    for (const child of hotendStandIn.children) {
      if (child !== nozzle) {
        child.visible = false;
      }
    }
    if (isWholePrinter) {
      root.add(hardware.frame, hardware.housing, hardware.gantry);
      beam = hardware.gantry;
      housing = hardware.housing;
      bed = hardware.bed;
    } else {
      // These objects are still owned for teardown but are not mounted.
      hardware.frame.visible = false;
    }
  } else if (isWholePrinter) {
    root.add(track(boxMesh(geometry.base, own(new THREE.MeshStandardMaterial({ color: printerBody.base[theme] })))));
    for (const rail of geometry.gantry.rails) {
      root.add(
        track(
          boxMesh(
            rail,
            own(new THREE.MeshStandardMaterial({ color: printerBody.rail, metalness: 0.6, roughness: 0.4 })),
          ),
        ),
      );
    }
  }
  if (isWholePrinter && geometry.light) {
    root.add(track(boxMesh(geometry.light, lightMaterial)));
    lamp = new THREE.PointLight(printerBody.lightOn, 0, 0, 0);
    lamp.position.set(...geometry.light.center);
    root.add(lamp);
  }
  root.add(track(toolhead));

  // The plate group carries the sheet, moving bed support and toolpath.
  const plateGroup = new THREE.Group();
  if (bed) {
    plateGroup.add(bed);
  }
  // Toolpath GPU resources live outside machine appearance and wrapper changes.
  plateGroup.add(reveal.lines, reveal.trail);
  root.add(plateGroup);

  return {
    root,
    plateGroup,
    toolhead,
    hotendStandIn,
    beam,
    housing,
    bed,
    nozzleMaterial,
    lightMaterial,
    lamp,
    reveal,
    head: new THREE.Vector3(),
    dispose: () => {
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
  const thickness = -plate.bounds.min[2];
  const outline = plateStandInOutline(geometry.buildVolume[0] === 180);
  const slab = new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 6 });
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(plate.color),
    roughness: plateRoughness[plate.finish],
    metalness: 0,
  });
  const mesh = new THREE.Mesh(slab, material);
  mesh.name = plateSurfaceName;
  mesh.position.z = -thickness;
  const grain = plate.finish === 'textured' ? applyPlateGrain(mesh) : undefined;
  return {
    object: mesh,
    dispose: () => {
      slab.dispose();
      grain?.dispose();
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
 * retaining the asset's metallic nozzle material. The drawn stand-in shows while it
 * loads and stays if it cannot.
 */
function PrinterHotendModel({
  toolhead,
  standIn,
  nozzleMaterial,
  model,
  onStatus,
}: Readonly<{
  model: URL;
  toolhead: THREE.Group;
  standIn: THREE.Group;
  nozzleMaterial: THREE.MeshStandardMaterial;
  onStatus: (message: string | undefined) => void;
}>): undefined {
  'use no memo'; // R3F owns imperative Three.js objects.
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let scene: THREE.Object3D | undefined;
    let isActive = true;
    onStatus('Loading toolhead…');
    const load = async (): Promise<void> => {
      try {
        const gltf = await gltfLoader.loadAsync(model.href);
        scene = gltf.scene;
      } catch {
        if (isActive) {
          onStatus('The hotend model could not load. A schematic tip is shown.');
        }
        return;
      }
      scene.applyMatrix4(plateModelMatrix);
      if (!isActive) {
        disposeLoadedModel(scene, nozzleMaterial);
        return;
      }
      standIn.visible = false;
      onStatus(undefined);
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
  }, [invalidate, model, nozzleMaterial, standIn, toolhead, onStatus]);
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
  onAssetStatus,
}: Readonly<{
  geometry: PrinterGeometry;
  plate: PrinterPlateModel;
  parent: THREE.Group;
  onAssetStatus?: PrinterSceneProps['onAssetStatus'];
}>): undefined {
  'use no memo'; // R3F owns imperative Three.js objects.
  const invalidate = useThree((state) => state.invalidate);
  const flat = useMemo(() => createFlatPlate(geometry, plate), [geometry, plate]);
  const retired = useMemo(() => new WeakSet<THREE.Object3D>(), []);
  const [loaded, setLoaded] =
    useState<Readonly<{ plate: PrinterPlateModel; model: string | undefined; scene: THREE.Object3D }>>();
  useEffect(
    () => () => {
      flat.dispose();
    },
    [flat],
  );
  useEffect(() => {
    const url = printerPlateModelForMachine(plate, geometry.model);
    if (!url) {
      onAssetStatus?.('A schematic plate is shown; a physical asset is unavailable for this machine.');
      return;
    }
    onAssetStatus?.('Loading build plate…');
    let scene: THREE.Object3D | undefined;
    let isActive = true;
    const load = async (): Promise<void> => {
      try {
        const gltf = await gltfLoader.loadAsync(url.href);
        scene = gltf.scene;
      } catch {
        if (isActive) {
          onAssetStatus?.('The build plate model could not load. A schematic plate is shown.');
        }
        return;
      }
      // The one transform from glTF's Y-up metres into the plate frame.
      scene.applyMatrix4(plateModelMatrix);
      // Isolate the coating from ink using the same source color/material.
      const replaced = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || !['surface', 'underside'].includes(object.name)) {
          return;
        }
        const previous = object.material as THREE.MeshStandardMaterial;
        replaced.add(previous);
        object.material = previous.clone();
        if (plate.finish === 'textured') {
          applyPlateGrain(object as THREE.Mesh);
        }
      });
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          for (const material of Array.isArray((object as THREE.Mesh).material)
            ? ((object as THREE.Mesh).material as THREE.Material[])
            : [(object as THREE.Mesh).material as THREE.Material]) {
            replaced.delete(material);
          }
        }
      });
      for (const material of replaced) {
        material.dispose();
      }
      if (isActive) {
        setLoaded({ plate, model: geometry.model, scene });
        onAssetStatus?.(undefined);
        invalidate();
      } else {
        disposeLoadedModel(scene);
      }
    };
    // async-iife: bootstrap — React effects cannot await the load; the cleanup flag owns its lifecycle.
    void load();
    return () => {
      isActive = false;
      if (scene) {
        retired.add(scene);
        setLoaded((current) => (current?.scene === scene ? undefined : current));
        disposeLoadedModel(scene);
      }
    };
  }, [geometry.model, plate, onAssetStatus, invalidate, retired]);
  const surface =
    loaded?.plate === plate && loaded.model === geometry.model && !retired.has(loaded.scene)
      ? loaded.scene
      : flat.object;
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
  beads,
  appearance = 'filament',
  analysisMaximum = 1,
  emphasizeLayer = false,
  geometry,
  store,
  theme,
  filamentColors,
  chamberLight,
  isWholePrinter,
  isHousingVisible = true,
  onAssetStatus,
  plate,
  grouping,
  hiddenGroups,
}: Omit<PrinterSceneProps, 'onContextLost' | 'frameRequest'>): React.JSX.Element {
  'use no memo'; // R3F owns imperative Three.js poses, buffers and uniforms.
  const { invalidate, scene } = useThree();
  const [eye] = useState(() => new THREE.Vector3());
  const [plateStatus, setPlateStatus] = useState<string>();
  const [hotendStatus, setHotendStatus] = useState<string>();
  const lastHeadStyle = useRef('');
  useEffect(() => {
    onAssetStatus?.([plateStatus, hotendStatus].filter(Boolean).join(' ') || undefined);
  }, [onAssetStatus, plateStatus, hotendStatus]);
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const reveal = useMemo(
    () => createToolpathReveal(program, [], { grouping, backend, data: beads }),
    [program, grouping, backend, beads],
  );
  useEffect(
    () => () => {
      reveal.dispose();
    },
    [reveal],
  );
  useEffect(() => {
    const palettes = filamentColors.map((color) => createToolpathPalette(color, theme, plate.color));
    setToolpathPalettes(reveal, palettes);
    invalidate();
  }, [reveal, theme, filamentColors, plate.color, invalidate]);
  useEffect(() => {
    setToolpathAppearance(reveal, { mode: appearance, maximum: analysisMaximum, emphasizeLayer });
    invalidate();
  }, [reveal, appearance, analysisMaximum, emphasizeLayer, invalidate]);
  const machine = useMemo(
    () => buildMachine({ geometry, theme, isWholePrinter, reveal }),
    [geometry, theme, isWholePrinter, reveal],
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
    if (machine.housing) {
      machine.housing.visible = isHousingVisible;
    }
    invalidate();
  }, [machine, isHousingVisible, invalidate]);
  useEffect(() => {
    setToolpathVisibility(machine.reveal, hiddenGroups);
    invalidate();
  }, [hiddenGroups, invalidate, machine]);

  const panels = useMemo(() => {
    const result: THREE.Object3D[] = [];
    machine.housing?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        result.push(object);
      }
    });
    return result;
  }, [machine]);
  useFrame((state, delta) => {
    if (machine.housing) {
      machine.housing.visible = isHousingVisible;
    }
    // Hide only the near enclosure skins. The chassis remains intact in a cutaway.
    for (const object of panels) {
      const [cx, cy] = geometry.enclosure.center;
      if (object.name === 'aluminium-side-panel') {
        object.visible = (object.position.x - cx) * (state.camera.position.x - cx) < 0;
      }
      if (object.name === 'rear-panel') {
        object.visible = state.camera.position.y < cy;
      }
      if (object.name === 'glass-door') {
        object.visible = state.camera.position.y > cy;
      }
      if (object.name === 'glass-lid') {
        object.visible = state.camera.position.z < object.position.z;
      }
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
    const bedY = isWholePrinter ? plateOffsetForY(geometry, head.y) : 0;
    machine.plateGroup.position.y = bedY;
    machine.plateGroup.position.z = isWholePrinter ? plateOffsetForHeight(geometry, head.z) : 0;
    const headZ = isWholePrinter ? toolheadLiftForHeight(geometry, head.z) : head.z;
    machine.toolhead.position.set(head.x, head.y + bedY, headZ);
    if (machine.beam) {
      machine.beam.position.y = head.y + bedY;
      machine.beam.position.z = geometry.gantry.beamZ + headZ;
    }
    if (machine.bed) {
      machine.bed.visible = state.camera.position.z >= machine.plateGroup.position.z;
    }
    state.camera.getWorldDirection(eye);
    const opacity = state.camera.position.z > machine.toolhead.position.z ? toolheadOpacity(-eye.z, 1) : 1;
    const headStyle = `${machine.root.uuid}:${machine.toolhead.children.length}:${opacity}`;
    if (headStyle !== lastHeadStyle.current) {
      lastHeadStyle.current = headStyle;
      machine.toolhead.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        for (const material of Array.isArray((object as THREE.Mesh).material)
          ? ((object as THREE.Mesh).material as THREE.Material[])
          : [(object as THREE.Mesh).material as THREE.Material]) {
          const transparent = opacity < 1;
          if (material.transparent !== transparent) {
            material.transparent = transparent;
            material.depthWrite = !transparent;
            material.needsUpdate = true;
          }
          material.opacity = opacity;
        }
      });
    }
    const { isPlaying } = store.getSnapshot();
    if (isPlaying) {
      invalidate();
    }
  });

  const hotendModel = printerHotendForModel(geometry.model);
  return (
    <>
      {/* Keyed: R3F keeps the first object when a primitive's `object` alone changes. */}
      <primitive key={machine.root.uuid} object={machine.root} />
      <PrinterPlateSurface
        geometry={geometry}
        plate={plate}
        parent={machine.plateGroup}
        onAssetStatus={setPlateStatus}
      />
      {hotendModel ? (
        <PrinterHotendModel
          model={hotendModel}
          toolhead={machine.toolhead}
          standIn={machine.hotendStandIn}
          nozzleMaterial={machine.nozzleMaterial}
          onStatus={setHotendStatus}
        />
      ) : null}
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

/** Observe the completed render, rather than mistaking parsed data or a spinner for first presentation. */
function FirstPresentedFrame({ onFirstFrame }: Readonly<{ onFirstFrame?: () => void }>): undefined {
  const renderer = useThree((state) => state.gl);
  useLayoutEffect(() => {
    const started = performance.now();
    const frames = (): number => {
      const frame: unknown = Reflect.get(renderer.info.render, 'frame');
      return typeof frame === 'number' ? frame : renderer.info.render.calls;
    };
    const initial = frames();
    let presented = false;
    const remove = addAfterEffect(() => {
      if (presented || frames() <= initial) {
        return;
      }
      presented = true;
      performance.clearMeasures('tau.printer.scene-first-frame');
      performance.measure('tau.printer.scene-first-frame', {
        start: started,
        end: performance.now(),
        detail: {
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
        },
      });
      onFirstFrame?.();
    });
    return remove;
  }, [renderer, onFirstFrame]);
}

/** The printer or its plate alone, the toolpath and the camera for one program. */
export function PrinterScene(props: PrinterSceneProps): React.JSX.Element {
  const { geometry, program, frameRequest, isReducedMotion, onContextLost, isWholePrinter } = props;
  // Public viewers stay on WebGL; the existing internal override is used for parity checks.
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const gl = useMemo(() => createTauR3fGlProp(backend, [], onContextLost), [backend, onContextLost]);
  // The whole printer frames the plate and its travel; the plate alone frames the finished part. Neither
  // depends on playback or the G-code filter, so the camera holds still while the part prints.
  const part = useMemo(() => props.preparedBounds ?? partBounds(program), [program, props.preparedBounds]);
  const box = useMemo(
    () =>
      isWholePrinter
        ? {
            min: geometry.enclosure.center.map((value, axis) => value - geometry.enclosure.size[axis]! / 2 - 10) as [
              number,
              number,
              number,
            ],
            max: geometry.enclosure.center.map((value, axis) => value + geometry.enclosure.size[axis]! / 2 + 10) as [
              number,
              number,
              number,
            ],
          }
        : framedPartBox(geometry, part),
    [geometry, isWholePrinter, part],
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
      <FirstPresentedFrame onFirstFrame={props.onFirstFrame} />
    </Canvas>
  );
}
/* oxlint-enable react/immutability */
