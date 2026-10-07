import { heroCamera } from '#www/hero-view.js';
import { parseStoryManifest, parseVariantManifest } from '#www/story-geometry.js';
import { partPose } from '#www/story-kinematics.js';
import { ease, storyFrame, storyPart } from '#www/story-timeline.js';
import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

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
  const responses = await Promise.all(urls.map(async (url) => fetch(`/_www/assets/${url}`, { signal })));
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

/** @type {(hex: string, intensity: number) => THREE.Color} */
const radiance = (hex, intensity) => new THREE.Color(hex).multiplyScalar(intensity);

/**
 * Softboxes as [colour, intensity, azimuth°, elevation°, distance, width, height], aimed at the model.
 * Azimuth 0 faces the camera side and grows towards +x; the hero camera sits at about -26°.
 * @type {Array<[string, number, number, number, number, number, number]>}
 */
const softboxes = [
  // Top-back softbox: flat faces reflect this region, so it sweeps a gradient across the ring and gears.
  ['#ffffff', 3.2, 160, 40, 20, 14, 9],
  // An overhead fill keeps the tops even without washing out their colour.
  ['#ffffff', 2, 0, 85, 20, 12, 12],
  // Tall strips either side draw highlight bands down the ring wall, the hub and the gear teeth.
  ['#fff3e6', 6, -100, -20, 20, 3, 22],
  ['#eef4ff', 5, 70, -20, 20, 3, 22],
  // A strip above and behind the camera catches the front chamfers.
  ['#ffffff', 2, -26, 50, 20, 14, 3],
  // A dim bounce card below the camera lifts the near walls just enough to read as blue metal.
  ['#ffffff', 0.5, -26, -35, 20, 14, 6],
];

/**
 * A high-key product studio, prefiltered once. Metal shows what it reflects, so this is built for the
 * hero camera: a soft grey dome with a bright horizon for chamfer glints, the softboxes above, and a
 * darker floor that the vertical faces pick up.
 * @type {(renderer: THREE.WebGLRenderer) => THREE.WebGLRenderTarget}
 */
const studio = (renderer) => {
  const scene = new THREE.Scene();
  const dome = new THREE.SphereGeometry(50, 64, 32);
  const top = radiance('#f4f6f8', 0.5);
  const horizon = radiance('#ffffff', 0.9);
  const floor = radiance('#b8bdc2', 0.25);
  const position = dome.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i) / 50;
    color
      .copy(horizon)
      .lerp(y >= 0 ? top : floor, Math.abs(y) ** 0.7)
      .toArray(colors, i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  scene.add(new THREE.Mesh(dome, domeMaterial));
  const panel = new THREE.PlaneGeometry(1, 1);
  const materials = [domeMaterial];
  for (const [hex, intensity, azimuth, elevation, distance, width, height] of softboxes) {
    const material = new THREE.MeshBasicMaterial({ color: radiance(hex, intensity), side: THREE.DoubleSide });
    materials.push(material);
    const mesh = new THREE.Mesh(panel, material);
    const theta = (azimuth * Math.PI) / 180;
    const phi = (elevation * Math.PI) / 180;
    mesh.position.set(
      distance * Math.sin(theta) * Math.cos(phi),
      distance * Math.sin(phi),
      distance * Math.cos(theta) * Math.cos(phi),
    );
    mesh.scale.set(width, height, 1);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    return pmrem.fromScene(scene, 0.02);
  } finally {
    pmrem.dispose();
    dome.dispose();
    panel.dispose();
    for (const material of materials) {
      material.dispose();
    }
  }
};

/**
 * Contact shadow under the ring: a tight dark line where the 174 mm base meets the floor and a faint
 * wide penumbra, so the model sits on its drawing instead of floating above the page.
 * @type {() => THREE.DataTexture}
 */
const contactShadow = () => {
  const size = 256;
  // The texture spans a 240 mm square plane.
  const rim = 87 / 120;
  const data = new Uint8Array(size * size * 4);
  /** @type {(from: number, to: number, value: number) => number} */
  const step = (from, to, value) => {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
      const line = Math.exp(-(((r - rim) / 0.05) ** 2)) * step(rim * 0.9, rim * 1.1, r);
      const alpha = 0.06 * (1 - step(rim * 0.7, 1, r)) + 0.3 * line;
      data[(y * size + x) * 4 + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

/**
 * Final pass: the scene, rendered linear and premultiplied into a multisampled target, darkened by the
 * ambient occlusion and then tone mapped and encoded exactly as a direct render would be. Where the
 * floor is transparent the occlusion is printed as black coverage, so the gearbox stays seated on the
 * drafting beneath the canvas.
 * @type {(beauty: THREE.Texture, occlusion: THREE.Texture) => THREE.ShaderMaterial}
 */
const compositeMaterial = (beauty, occlusion) =>
  new THREE.ShaderMaterial({
    uniforms: {
      tBeauty: { value: beauty },
      tOcclusion: { value: occlusion },
      floorShade: { value: 0.8 },
    },
    vertexShader: `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `uniform sampler2D tBeauty;
uniform sampler2D tOcclusion;
uniform float floorShade;
varying vec2 vUv;
void main() {
  vec4 beauty = texture2D(tBeauty, vUv);
  float ao = texture2D(tOcclusion, vUv).r;
  float alpha = beauty.a + (1.0 - beauty.a) * (1.0 - ao) * floorShade;
  gl_FragColor = vec4(beauty.rgb / max(beauty.a, 1e-4) * ao, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * beauty.a, alpha);
}`,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });

/**
 * One WebGL context for the whole site. The canvas moves between the hero and story stages,
 * which are never on screen together, so geometry is uploaded once and nothing renders while idle.
 * @param assembly - Validated geometry from {@link loadAssembly}.
 * @type {(assembly: Awaited<ReturnType<typeof loadAssembly>>) => {canvas: HTMLCanvasElement, attach: (host: HTMLElement) => void, draw: (view: View) => void, dispose: () => void, compile: () => Promise<void>}}
 */
export const createScene = ({ manifest, binary, variant, offsets }) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'default' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral keeps the authored colours true; ACES greyed and darkened them.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0, 0);
  renderer.localClippingEnabled = true;
  // The floor shadow is redrawn only on frames that show the floor.
  renderer.shadowMap.enabled = true;
  // Variance shadows and the occlusion pass both render to half-float targets; without them the
  // shadow falls back to filtered PCF and the occlusion is skipped.
  const halfFloat =
    renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  renderer.shadowMap.type = halfFloat ? THREE.VSMShadowMap : THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
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
  // A high key from the back left: specular sparkle on the teeth, and a shadow that falls across the
  // planets, into the ring and onto the floor towards the viewer, the way a product shot is lit.
  const key = new THREE.DirectionalLight(0xff_ff_ff, 1.5);
  key.position.set(-200, 330, -60);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 900 });
  key.shadow.radius = 4;
  key.shadow.blurSamples = 12;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.15;
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(heroCamera.fov, 1, 1, 3000);
  // Ambient occlusion darkens the roots between teeth, the planets under the carrier and the floor
  // around the base. The scene renders into a multisampled linear target, the occlusion is computed
  // from its own depth and normals, and one pass composites, tone maps and encodes the result.
  const beauty = own(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const occlusion = new GTAOPass(scene, camera, 1, 1);
  own(occlusion);
  occlusion.output = GTAOPass.OUTPUT.Off;
  const composite = own(compositeMaterial(beauty.texture, occlusion.pdRenderTarget.texture));
  const quad = new FullScreenQuad(composite);
  own(quad);
  // Quality tiers: full occlusion, half the samples, then a direct render with shadows only. A device
  // that cannot render to half-float targets starts on the last tier; a slow one steps down (pace).
  const tiers = [
    { samples: 16, denoise: 24 },
    { samples: 8, denoise: 12 },
  ];
  let tier = halfFloat ? 0 : tiers.length;
  const applyTier = () => {
    const settings = tiers[tier];
    if (settings) {
      occlusion.updateGtaoMaterial({
        radius: 12,
        distanceExponent: 1.2,
        thickness: 20,
        scale: 1.3,
        samples: settings.samples,
      });
      occlusion.updatePdMaterial({
        lumaPhi: 10,
        depthPhi: 2,
        normalPhi: 3,
        radius: 10,
        rings: 3,
        samples: settings.denoise,
      });
    }
  };
  applyTier();
  // Frames arrive only while the input, scroll or size changes, so back-to-back draws are an
  // interaction; when those settle below 25 fps the next tier takes over for the rest of the visit.
  let lastDraw = 0;
  let pacedFrames = 0;
  let pacedTime = 0;
  /** @type {(now: number) => void} */
  const pace = (now) => {
    const gap = now - lastDraw;
    lastDraw = now;
    if (gap > 120 || tier >= tiers.length) {
      return;
    }
    pacedFrames += 1;
    pacedTime += gap;
    if (pacedFrames >= 12) {
      if (pacedTime / pacedFrames > 40) {
        tier += 1;
        applyTier();
        if (tier >= tiers.length) {
          // The direct render needs none of the occlusion buffers.
          beauty.dispose();
          occlusion.dispose();
        }
      }
      pacedFrames = 0;
      pacedTime = 0;
    }
  };
  const layerPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
  // Printed layers are clipped in the occlusion buffer too, so nothing above the cut casts occlusion.
  occlusion.normalMaterial.clippingPlanes = [layerPlane];
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  scene.add(root);
  // The floor is the ring's base plane: a soft cast shadow plus a contact line, never an opaque surface,
  // so the drafting drawn beneath the canvas stays visible around and through the gearbox.
  // Neither floor layer writes depth, so they never fight each other and the model always occludes them.
  const floorShadow = own(new THREE.ShadowMaterial({ opacity: 0.28, depthWrite: false }));
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(600, 600)), floorShadow);
  floor.position.z = heroCamera.floorY;
  floor.receiveShadow = true;
  const contactMaterial = own(
    new THREE.MeshBasicMaterial({ map: own(contactShadow()), transparent: true, depthWrite: false, toneMapped: false }),
  );
  const contact = new THREE.Mesh(own(new THREE.PlaneGeometry(240, 240)), contactMaterial);
  contact.position.z = heroCamera.floorY;
  contact.renderOrder = -1;
  root.add(floor, contact);
  /** @type {(weight: number) => void} */
  const ground = (weight) => {
    floor.visible = weight > 0.01;
    contact.visible = floor.visible;
    floorShadow.opacity = 0.28 * weight;
    contactMaterial.opacity = weight;
    renderer.shadowMap.needsUpdate = floor.visible;
  };
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
      geometry.morphAttributes.position = [new THREE.BufferAttribute(morph, 3)];
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
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
    if (!host) {
      return;
    }
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) {
      return;
    }
    // Size the drawing buffer directly (three.js responsive guidance), capped near three megapixels.
    const ratio = Math.min(devicePixelRatio, 1.75, Math.sqrt(3_000_000 / (width * height)));
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    renderer.getSize(size);
    if (size.x !== w || size.y !== h) {
      renderer.setSize(w, h, false);
      beauty.setSize(w, h);
      // Full resolution: at half, the upsampled occlusion grains the floor and haloes the teeth.
      occlusion.setSize(w, h);
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
    if (!host) {
      return;
    }
    if (view.kind === 'hero') {
      for (const part of parts) {
        const pose = partPose(part.name, view.sunAngle);
        part.group.position.set(pose.x, pose.y, 0);
        part.group.rotation.set(0, 0, pose.rotation);
        part.group.scale.setScalar(1);
        part.mesh.visible = true;
        part.cloud.visible = false;
        if (part.mesh.morphTargetInfluences?.length) {
          part.mesh.morphTargetInfluences[0] = 0;
        }
      }
      layerPlane.constant = 1e4;
      printer.visible = false;
      root.position.y = 0;
      root.scale.setScalar(1);
      ground(1);
      // The drafting beneath the canvas is projected with this exact camera (hero-view.mjs).
      const { distance, elevation, azimuth, floorY } = heroCamera;
      camera.position.set(
        distance * Math.sin(azimuth) * Math.cos(elevation),
        floorY + distance * Math.sin(elevation),
        distance * Math.cos(azimuth) * Math.cos(elevation),
      );
      camera.lookAt(0, floorY, 0);
      camera.setViewOffset(1, 1, 0, heroCamera.shift, 1, 1);
    } else {
      const p = view.progress;
      const frame = storyFrame(p);
      for (const part of parts) {
        const state = storyPart(part, p, frame);
        part.group.position.set(state.x, state.y, state.z);
        part.group.rotation.set(0, 0, state.rotation);
        part.group.scale.setScalar(state.scale);
        part.mesh.visible = state.solid > 0.5;
        part.cloud.visible = state.cloud > 0.02 && !part.mesh.visible;
        part.cloudMaterial.opacity = Math.min(0.9, state.cloud);
        if (part.mesh.morphTargetInfluences?.length) {
          part.mesh.morphTargetInfluences[0] = frame.variant;
        }
      }
      // The ring sits on the plate and is revealed layer by layer; an illustration, never G-code.
      printer.visible = frame.print > 0.02;
      printer.scale.setScalar(Math.max(0.001, frame.print));
      lineMaterial.opacity = 0.85 * frame.print;
      plateMaterial.opacity = frame.print;
      root.position.y = Number(frame.print);
      const ringTop = 15 + 4 * frame.variant + 1;
      layerPlane.constant = frame.print > 0.6 ? -1 + (ringTop + 1) * frame.layer : 1e4;
      gantry.position.y = Math.max(4, -1 + (ringTop + 1) * frame.layer) + 4;
      head.position.set(Math.sin(p * 47) * 70, gantry.position.y + 12, Math.cos(p * 31) * 40);
      root.scale.setScalar(1 - 0.38 * frame.device);
      // The assembled gearbox stands on the same soft floor as the hero; it lifts away for printing.
      ground(ease((p - 4.3) / 0.4) * (1 - ease((p - 6.85) / 0.2)));
      camera.clearViewOffset();
      aim(frame);
    }
    pace(performance.now());
    if (tier >= tiers.length) {
      renderer.render(scene, camera);
      return;
    }
    renderer.setRenderTarget(beauty);
    renderer.render(scene, camera);
    occlusion.render(renderer, beauty, beauty);
    renderer.setRenderTarget(null);
    quad.render(renderer);
  };
  return {
    canvas,
    attach: (next) => {
      if (host === next) {
        return;
      }
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
