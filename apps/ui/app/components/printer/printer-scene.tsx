/* oxlint-disable react/immutability -- This uncompiled R3F boundary mutates the Three.js scene it exclusively owns. */
import { useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ToolpathProgram } from '@taucad/slicer/toolpath';
import { createTauR3fGlProp } from '#components/geometry/graphics/three/canvas-three-gl.js';
import { readGraphicsBackendQueryOverride } from '#components/geometry/graphics/graphics-backend.js';
import { TauCameraControls } from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { printerBackground, printerBody } from '#components/printer/printer-colors.constants.js';
import {
  framePrinterCamera,
  plateOffsetForHeight,
  toolheadLiftForHeight,
} from '#components/printer/printer-geometry.js';
import type { PrinterBox, PrinterGeometry } from '#components/printer/printer-geometry.js';
import { eventValueAt } from '#components/printer/printer-playback.js';
import type { PlaybackStore } from '#components/printer/printer-playback.js';
import {
  createToolpathPalette,
  createToolpathReveal,
  updateToolpathReveal,
} from '#components/printer/printer-toolpath.js';
import type { ToolpathReveal } from '#components/printer/printer-toolpath.js';

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
  onContextLost: () => void;
}>;

const cameraFov = 38;
/** Seconds. Frames after a hidden tab must not leap the cursor forward. */
const maximumFrameDelta = 0.1;
/** Degrees Celsius at which the nozzle glow saturates. */
const glowSaturationTemperature = 300;
const plateGridPitch = 10;

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

type MachineParts = Readonly<{
  root: THREE.Group;
  plateGroup: THREE.Group;
  toolhead: THREE.Group;
  beam: THREE.Mesh | undefined;
  nozzleMaterial: THREE.MeshStandardMaterial;
  lightMaterial: THREE.MeshStandardMaterial;
  reveal: ToolpathReveal;
  head: THREE.Vector3;
  dispose: () => void;
}>;

const buildMachine = ({
  geometry,
  program,
  theme,
  filamentColor,
}: Pick<PrinterSceneProps, 'geometry' | 'program' | 'theme' | 'filamentColor'>): MachineParts => {
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

  // Enclosure: opaque base, translucent panels, frame edges, doors with an inset frame.
  const frameMaterial = own(new THREE.LineBasicMaterial({ color: printerBody.frame[theme] }));
  const glassMaterial = own(
    new THREE.MeshStandardMaterial({
      color: printerBody.glass[theme],
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      roughness: 0.15,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );
  const bodyMaterial = own(new THREE.MeshStandardMaterial({ color: printerBody.base[theme], roughness: 0.7 }));
  root.add(track(boxMesh(geometry.base, bodyMaterial)), track(boxEdges(geometry.enclosure, frameMaterial)));
  for (const panel of geometry.panels) {
    root.add(track(boxMesh(panel.box, glassMaterial)));
    if (panel.isDoor) {
      root.add(track(boxEdges(panel.box, frameMaterial, 12)));
    }
  }

  // Gantry: rails, the moving beam and the toolhead carriage with its nozzle.
  const railMaterial = own(new THREE.MeshStandardMaterial({ color: printerBody.rail, roughness: 0.4, metalness: 0.6 }));
  for (const rail of geometry.gantry.rails) {
    root.add(track(boxMesh(rail, railMaterial)));
  }
  const [centerX, centerY] = geometry.enclosure.center;
  let beam: THREE.Mesh | undefined;
  if (geometry.gantry.kind !== 'delta') {
    beam = boxMesh(
      { center: [centerX, centerY, geometry.gantry.beamZ], size: geometry.gantry.beamSize },
      own(new THREE.MeshStandardMaterial({ color: printerBody.beam, roughness: 0.4, metalness: 0.5 })),
    );
    root.add(track(beam));
  }
  const toolhead = new THREE.Group();
  const carriage = new THREE.Mesh(
    new THREE.BoxGeometry(...geometry.gantry.carriageSize),
    own(new THREE.MeshStandardMaterial({ color: printerBody.carriage, roughness: 0.5, metalness: 0.3 })),
  );
  carriage.position.z = geometry.gantry.beamZ;
  const nozzleMaterial = own(
    new THREE.MeshStandardMaterial({
      color: printerBody.nozzle,
      emissive: new THREE.Color(printerBody.nozzleGlow),
      emissiveIntensity: 0,
      roughness: 0.35,
      metalness: 0.8,
    }),
  );
  const heater = new THREE.Mesh(new THREE.BoxGeometry(18, 14, 10), nozzleMaterial);
  heater.position.z = geometry.toolhead.nozzleLength + 5;
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(4, geometry.toolhead.nozzleLength, 12), nozzleMaterial);
  nozzle.rotation.x = -Math.PI / 2;
  nozzle.position.z = geometry.toolhead.nozzleLength / 2;
  toolhead.add(carriage, heater, nozzle);
  root.add(track(toolhead));

  // Material unit on the lid, purge chute at the rear, chamber light at the front.
  if (geometry.materialUnit) {
    const unit = geometry.materialUnit;
    // A clear lid like the real unit's, so the spools inside read through it.
    const unitMaterial = own(
      new THREE.MeshStandardMaterial({
        color: printerBody.materialUnit,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    root.add(track(boxMesh(unit.box, unitMaterial)), track(boxEdges(unit.box, frameMaterial)));
    const spoolMaterial = own(new THREE.MeshStandardMaterial({ color: printerBody.spool, roughness: 0.8 }));
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
  const lightMaterial = own(
    new THREE.MeshStandardMaterial({ color: printerBody.lightOff, emissive: new THREE.Color(printerBody.lightOn) }),
  );
  if (geometry.light) {
    root.add(track(boxMesh(geometry.light, lightMaterial)));
  }

  // The plate group carries the plate, its grid, the usable envelope and the toolpath.
  const plateGroup = new THREE.Group();
  plateGroup.add(
    track(
      boxMesh(geometry.plate, own(new THREE.MeshStandardMaterial({ color: printerBody.plate[theme], roughness: 0.9 }))),
    ),
    track(plateGrid(geometry, own(new THREE.LineBasicMaterial({ color: printerBody.plateGrid[theme] })))),
    track(
      boxEdges(
        geometry.envelope,
        own(new THREE.LineBasicMaterial({ color: printerBody.envelope, transparent: true, opacity: 0.35 })),
      ),
    ),
  );
  const reveal = createToolpathReveal(program, createToolpathPalette(filamentColor, theme));
  plateGroup.add(reveal.lines, reveal.trail);
  root.add(plateGroup);

  return {
    root,
    plateGroup,
    toolhead,
    beam,
    nozzleMaterial,
    lightMaterial,
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

function PrinterObjects({
  program,
  geometry,
  store,
  theme,
  filamentColor,
  chamberLight,
  isReducedMotion,
  liveNozzleTarget,
}: Omit<PrinterSceneProps, 'onContextLost'>): React.JSX.Element {
  'use no memo'; // R3F owns imperative Three.js poses, buffers and uniforms.
  const { invalidate, scene } = useThree();
  const machine = useMemo(
    () => buildMachine({ geometry, program, theme, filamentColor }),
    [geometry, program, theme, filamentColor],
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
    invalidate();
  }, [chamberLight, invalidate, machine]);
  useEffect(() => store.subscribe(invalidate), [invalidate, store]);

  useFrame((state, delta) => {
    store.advance(Math.min(delta, maximumFrameDelta));
    const time = store.getTime();
    const { head } = machine;
    const { segment } = updateToolpathReveal({ reveal: machine.reveal, program, time, head });
    if (segment < 0) {
      head.set(...geometry.toolhead.home);
    }
    machine.plateGroup.position.z = plateOffsetForHeight(geometry, head.z);
    const headZ = toolheadLiftForHeight(geometry, head.z);
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

  return <primitive object={machine.root} />;
}

/** The printer, its toolpath and the camera for one program. */
export function PrinterScene(props: PrinterSceneProps): React.JSX.Element {
  const { geometry, onContextLost } = props;
  // Public viewers stay on WebGL; the existing internal override is used for parity checks.
  const backend = readGraphicsBackendQueryOverride() ?? 'webgl';
  const gl = useMemo(() => createTauR3fGlProp(backend), [backend]);
  const position = useMemo(() => framePrinterCamera(geometry, cameraFov), [geometry]);
  return (
    <Canvas
      key={backend}
      gl={gl}
      data-graphics-backend={backend}
      frameloop='demand'
      dpr={[1, 1.5]}
      camera={{ position, up: [0, 0, 1], fov: cameraFov, near: 5, far: 20_000 }}
      onCreated={({ gl: renderer }) => {
        renderer.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
      }}
    >
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.35} position={[0, 0, 1]} />
      <directionalLight intensity={1.1} position={[300, -400, 600]} />
      <directionalLight intensity={0.35} position={[-300, 200, 300]} />
      <TauCameraControls makeDefault initialTarget={geometry.camera.target} />
      <PrinterObjects {...props} />
    </Canvas>
  );
}
/* oxlint-enable react/immutability */
