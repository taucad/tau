import { parseStoryManifest, parseVariantManifest } from '#www/story-geometry.js';
import { partPose } from '#www/story-kinematics.js';
import { storyFrame, storyPart } from '#www/story-timeline.js';
import * as THREE from 'three';

/** @typedef {import('#www/story-timeline.js').FrameState} FrameState */
/** @typedef {{kind: 'hero', sunAngle: number, narrow: boolean} | {kind: 'story', progress: number, narrow: boolean}} View */

/** @type {(response: Response) => Promise<ArrayBuffer>} */
const decodeGeometry = async (response) => {
  const bytes = await response.arrayBuffer();
  const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  // Hosts may already have removed Content-Encoding; never decompress twice.
  return magic[0] === 31 && magic[1] === 139
    ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
};

/**
 * Fetch and validate the frozen 34-part tessellation and its authored faceWidth variant.
 * @param signal - Aborts the downloads on page exit.
 * @type {(signal: AbortSignal) => Promise<{manifest: import('#www/story-geometry.js').StoryManifest, binary: ArrayBuffer, variant: import('#www/story-geometry.js').VariantManifest, offsets: ArrayBuffer}>}
 */
export const loadAssembly = async (signal) => {
  const urls = ['planetary.json', 'planetary.bin.gz', 'planetary-face18.json', 'planetary-face18.bin.gz'];
  const responses = await Promise.all(urls.map((url) => fetch(`/_www/assets/${url}`, { signal })));
  if (responses.some((response) => !response.ok)) {
    throw new Error('Geometry unavailable');
  }
  const [manifestJson, binary, variantJson, offsets] = await Promise.all([
    /** @type {Promise<unknown>} */ (responses[0].json()),
    decodeGeometry(responses[1]),
    /** @type {Promise<unknown>} */ (responses[2].json()),
    decodeGeometry(responses[3]),
  ]);
  const manifest = parseStoryManifest(manifestJson, binary.byteLength);
  const variant = parseVariantManifest(variantJson, manifest, offsets.byteLength);
  return { manifest, binary, variant, offsets };
};

/**
 * A dark studio with long softboxes, so authored metals read as metal instead of grey plastic.
 * @type {(renderer: THREE.WebGLRenderer) => THREE.WebGLRenderTarget}
 */
const studio = (renderer) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5e_63_68);
  const box = new THREE.BoxGeometry(1, 1, 1);
  /** @type {Array<[number, [number, number, number], [number, number, number]]>} */
  const panels = [
    [7, [0, 9, 0], [14, 0.2, 3]],
    [3.2, [-9, 2, 4], [0.2, 7, 2.2]],
    [1.4, [9, 1, -3], [0.2, 5, 1.4]],
    [0.9, [0, -2, -10], [12, 1.1, 0.2]],
    [0.22, [0, -8, 0], [20, 0.2, 20]],
  ];
  const materials = [];
  for (const [intensity, position, size] of panels) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity) });
    materials.push(material);
    const panel = new THREE.Mesh(box, material);
    panel.position.set(...position);
    panel.scale.set(...size);
    scene.add(panel);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    return pmrem.fromScene(scene, 0.035);
  } finally {
    pmrem.dispose();
    box.dispose();
    for (const material of materials) {
      material.dispose();
    }
  }
};

/**
 * One WebGL context for the whole site. The canvas moves between the hero and story stages,
 * which are never on screen together, so geometry is uploaded once and nothing renders while idle.
 * @param assembly - Validated geometry from {@link loadAssembly}.
 * @type {(assembly: Awaited<ReturnType<typeof loadAssembly>>) => {canvas: HTMLCanvasElement, attach: (host: HTMLElement) => void, draw: (view: View) => void, dispose: () => void, compile: () => Promise<void>}}
 */
export const createScene = ({ manifest, binary, variant, offsets }) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0, 0);
  renderer.localClippingEnabled = true;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  /** @type {Set<{dispose: () => void}>} */
  const owned = new Set();
  /** @type {<T extends {dispose: () => void}>(resource: T) => T} */
  const own = (resource) => {
    owned.add(resource);
    return resource;
  };
  const scene = new THREE.Scene();
  const environment = own(studio(renderer));
  scene.environment = environment.texture;
  scene.add(new THREE.HemisphereLight(0xff_ff_ff, 0x4a_50_56, 0.6));
  const key = new THREE.DirectionalLight(0xff_ff_ff, 1.6);
  key.position.set(-160, 260, 180);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
  const layerPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  scene.add(root);
  const parts = manifest.meshes.map((part, index) => {
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(binary, part.position.offset, part.position.length).slice(), 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(binary, part.normal.offset, part.normal.length), 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(binary, part.index.offset, part.index.length), 1));
    const range = variant.meshes[index]?.dz;
    if (range) {
      const dz = new Float32Array(offsets, range.offset, range.length);
      const morph = new Float32Array(range.length * 3);
      for (const [i, value] of dz.entries()) {
        morph[i * 3 + 2] = value;
      }
      geometry.morphAttributes['position'] = [new THREE.BufferAttribute(morph, 3)];
      geometry.morphTargetsRelative = true;
    }
    // Geometry is authored in place; planets and their bushings rotate about their own axes.
    const home = partPose(part.name, 0);
    geometry.translate(-home.x, -home.y, 0);
    const material = own(
      new THREE.MeshStandardMaterial({
        color: part.color,
        metalness: Math.min(1, part.metalness + 0.08),
        roughness: Math.max(0.12, part.roughness - 0.06),
        clippingPlanes: [layerPlane],
      }),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.morphTargetInfluences = range ? [0] : [];
    const positions = geometry.getAttribute('position');
    const samples = [];
    for (let i = 0; i < positions.count; i += 6) {
      samples.push(positions.getX(i), positions.getY(i), positions.getZ(i));
    }
    const cloudGeometry = own(new THREE.BufferGeometry());
    cloudGeometry.setAttribute('position', new THREE.Float32BufferAttribute(samples, 3));
    const cloudMaterial = own(
      new THREE.PointsMaterial({ color: 0x14_b8_a6, size: 1.8, transparent: true, depthWrite: false }),
    );
    const cloud = new THREE.Points(cloudGeometry, cloudMaterial);
    const group = new THREE.Group();
    group.add(mesh, cloud);
    root.add(group);
    return { name: part.name, index, group, mesh, cloud, cloudMaterial };
  });
  // Print preparation is drawn as line art: an illustration of a build volume, not a machine.
  const printer = new THREE.Group();
  scene.add(printer);
  const lineMaterial = own(new THREE.LineBasicMaterial({ color: 0x8a_94_9c, transparent: true, opacity: 0.85 }));
  /** @type {(size: [number, number, number], position: [number, number, number]) => THREE.LineSegments} */
  const outline = (size, position) => {
    const source = own(new THREE.BoxGeometry(...size));
    const edges = own(new THREE.EdgesGeometry(source));
    const line = new THREE.LineSegments(edges, lineMaterial);
    line.position.set(...position);
    printer.add(line);
    return line;
  };
  outline([256, 256, 256], [0, 128 - 1.5, 0]);
  outline([256, 3, 256], [0, -1.5, 0]);
  const gantry = outline([256, 6, 10], [0, 40, 0]);
  const head = outline([22, 26, 22], [0, 52, 0]);
  const gridSource = own(new THREE.GridHelper(256, 16, 0x7a_84_8c, 0x9a_a4_ac));
  gridSource.position.y = 0.2;
  printer.add(gridSource);
  const plateMaterial = own(
    new THREE.MeshStandardMaterial({ color: 0xd6_dc_e0, metalness: 0.15, roughness: 0.7, transparent: true }),
  );
  const plateGeometry = own(new THREE.BoxGeometry(256, 3, 256));
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.position.y = -1.6;
  printer.add(plate);
  const size = new THREE.Vector2();
  /** @type {ResizeObserver | undefined} */
  let resize;
  /** @type {HTMLElement | undefined} */
  let host;
  const fit = () => {
    if (!host) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    // Size the drawing buffer directly (three.js responsive guidance), capped near three megapixels.
    const ratio = Math.min(devicePixelRatio, 1.75, Math.sqrt(3_000_000 / (width * height)));
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    renderer.getSize(size);
    if (size.x !== w || size.y !== h) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  /** @type {(frame: Pick<FrameState, 'distance' | 'elevation' | 'azimuth' | 'targetY'>) => void} */
  const aim = ({ distance, elevation, azimuth, targetY }) => {
    const portrait = camera.aspect < 0.9 ? 1 / Math.max(0.45, camera.aspect) : 1;
    const d = distance * Math.min(1.7, portrait * 0.92);
    camera.position.set(
      d * Math.sin(azimuth) * Math.cos(elevation),
      d * Math.sin(elevation),
      d * Math.cos(azimuth) * Math.cos(elevation),
    );
    camera.lookAt(0, targetY, 0);
  };
  /** @type {(view: View) => void} */
  const draw = (view) => {
    if (!host) return;
    if (view.kind === 'hero') {
      for (const part of parts) {
        const pose = partPose(part.name, view.sunAngle);
        part.group.position.set(pose.x, pose.y, 0);
        part.group.rotation.set(0, 0, pose.rotation);
        part.group.scale.setScalar(1);
        part.mesh.visible = true;
        part.cloud.visible = false;
        if (part.mesh.morphTargetInfluences?.length) part.mesh.morphTargetInfluences[0] = 0;
      }
      layerPlane.constant = 1e4;
      printer.visible = false;
      root.position.y = 0;
      root.scale.setScalar(1);
      aim({ distance: 400, elevation: 0.72, azimuth: -0.45, targetY: -6 });
    } else {
      const p = view.progress;
      const frame = storyFrame(p);
      for (const part of parts) {
        const state = storyPart(part.name, part.index, p, frame);
        part.group.position.set(state.x, state.y, state.z);
        part.group.rotation.set(0, 0, state.rotation);
        part.group.scale.setScalar(state.scale);
        part.mesh.visible = state.solid > 0.5;
        part.cloud.visible = state.cloud > 0.02 && !part.mesh.visible;
        part.cloudMaterial.opacity = Math.min(0.9, state.cloud);
        if (part.mesh.morphTargetInfluences?.length) part.mesh.morphTargetInfluences[0] = frame.variant;
      }
      // The ring sits on the plate and is revealed layer by layer; an illustration, never G-code.
      printer.visible = frame.print > 0.02;
      printer.scale.setScalar(Math.max(0.001, frame.print));
      lineMaterial.opacity = 0.85 * frame.print;
      plateMaterial.opacity = frame.print;
      root.position.y = 1 * frame.print;
      const ringTop = 15 + 4 * frame.variant + 1;
      layerPlane.constant = frame.print > 0.6 ? -1 + (ringTop + 1) * frame.layer : 1e4;
      gantry.position.y = Math.max(4, -1 + (ringTop + 1) * frame.layer) + 4;
      head.position.set(Math.sin(p * 47) * 70, gantry.position.y + 12, Math.cos(p * 31) * 40);
      root.scale.setScalar(1 - 0.38 * frame.device);
      aim(frame);
    }
    renderer.render(scene, camera);
  };
  return {
    canvas,
    attach: (next) => {
      if (host === next) return;
      host = next;
      next.append(canvas);
      resize?.disconnect();
      resize = new ResizeObserver(fit);
      resize.observe(next);
      fit();
    },
    draw,
    compile: async () => {
      await renderer.compileAsync(scene, camera);
    },
    dispose: () => {
      resize?.disconnect();
      for (const resource of owned) {
        resource.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
};
