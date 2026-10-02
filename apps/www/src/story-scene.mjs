import { partPose } from './story-kinematics.mjs';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const blend = (from, to, progress) => from + (to - from) * progress;
const decodeGeometry = async (response) => {
  const bytes = await response.arrayBuffer();
  const magic = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  return magic[0] === 31 && magic[1] === 139
    ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : bytes;
};
const labels = [
  'A specification becomes a starting point',
  'Ring · Gears · Carrier & hardware',
  '34 individually modeled parts',
  'Fixed ring · 4:1 reduction',
  'An editable design, another iteration',
  'Declared requirements. Measurable geometry.',
  'Ring gear · Print workflow preview',
  'Your browser. Your next idea.',
];

/** Shared owner of the marketing canvas, demand scheduler and GPU resources. */
export async function mountStory(stage) {
  const surface = stage.querySelector('.story-surface');
  const section = stage.closest('.story-section');
  const chapters = [...section.querySelectorAll('[data-story-chapter]')];
  const toggle = stage.querySelector('[data-story-toggle]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const controller = new AbortController();
  const resources = new Set();
  let renderer, environment, observer, resizeObserver;
  let disposed = false,
    active = false,
    paused = false,
    frame = 0,
    rendered = 0,
    lastProgress = -1;
  const own = (resource) => {
    resources.add(resource);
    return resource;
  };
  const cleanup = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    cancelAnimationFrame(frame);
    controller.abort();
    observer?.disconnect();
    resizeObserver?.disconnect();
    environment?.dispose();
    for (const resource of resources) {
      resource.dispose();
    }
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    stage.classList.remove('is-live');
    toggle.hidden = true;
  };
  try {
    const responses = await Promise.all([
      fetch('/_www/assets/planetary.json', { signal: controller.signal }),
      fetch('/_www/assets/planetary.bin.gz', { signal: controller.signal }),
    ]);
    if (responses.some((response) => !response.ok)) {
      throw new Error('Geometry unavailable');
    }
    const [manifest, binary] = await Promise.all([responses[0].json(), decodeGeometry(responses[1])]);
    if (manifest.parts !== 34 || manifest.meshes.length !== 34) {
      throw new Error('Unexpected assembly');
    }
    if (reduced.matches || document.hidden) {
      cleanup();
      return;
    }
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0, 0);
    renderer.localClippingEnabled = true;
    surface.append(renderer.domElement);
    const scene = new THREE.Scene();
    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(studio, 0.04);
    studio.dispose();
    pmrem.dispose();
    scene.environment = environment.texture;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
    const printPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    root.rotation.z = -0.25;
    scene.add(root);
    scene.add(new THREE.HemisphereLight(0xff_ff_ff, 0x68_74_7b, 0.8));
    const key = new THREE.DirectionalLight(0xff_ff_ff, 2);
    key.position.set(-160, 220, 140);
    scene.add(key);
    const objects = manifest.meshes.map((part, index) => {
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
      const planet = /^(?:Planet Gear|Flanged Bushing) (\d)$/u.exec(part.name);
      const angle = planet ? ((Number(planet[1]) - 1) * Math.PI * 2) / 3 : 0;
      if (planet) {
        geometry.translate(-48 * Math.cos(angle), -48 * Math.sin(angle), 0);
      }
      const material = own(
        new THREE.MeshStandardMaterial({
          color: part.color,
          metalness: part.metalness,
          roughness: part.roughness,
          clippingPlanes: [printPlane],
        }),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = part.name;
      const group = new THREE.Group();
      group.add(mesh);
      root.add(group);
      const positions = geometry.attributes.position.array;
      const samples = [];
      for (let i = 0; i < positions.length; i += 24) {
        samples.push(positions[i], positions[i + 1], positions[i + 2]);
      }
      const dotsGeometry = own(new THREE.BufferGeometry());
      dotsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(samples, 3));
      const dotsMaterial = own(
        new THREE.PointsMaterial({ color: part.color, size: 1.2, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      const dots = new THREE.Points(dotsGeometry, dotsMaterial);
      group.add(dots);
      let lift = 0;
      if (part.name.includes('Front Socket')) {
        lift = 100;
      } else if (part.name.includes('Front Screw')) {
        lift = 85;
      } else if (part.name.includes('Carrier Front')) {
        lift = 70;
      } else if (part.name.includes('Front Thrust')) {
        lift = 48;
      } else if (part.name.includes('Thrust Washer')) {
        lift = 36;
      } else if (part.name.startsWith('Planet Gear')) {
        lift = 23;
      } else if (part.name.includes('Flanged Bushing')) {
        lift = 16;
      } else if (part.name.startsWith('Sun')) {
        lift = 19;
      } else if (part.name.includes('Carrier Rear')) {
        lift = -25;
      } else if (part.name.includes('Rear')) {
        lift = -44;
      }
      return { group, mesh, dots, part, planet, angle, lift, index };
    });
    const printer = new THREE.Group();
    scene.add(printer);
    const frameMaterial = own(new THREE.MeshStandardMaterial({ color: 0x69_73_7a, metalness: 0.65, roughness: 0.4 }));
    const beam = ([x, y, z], [width, height, depth]) => {
      const geometry = own(new THREE.BoxGeometry(width, height, depth));
      const mesh = new THREE.Mesh(geometry, frameMaterial);
      mesh.position.set(x, y, z);
      printer.add(mesh);
      return mesh;
    };
    beam([0, -68, 0], [220, 9, 190]);
    beam([-105, 45, 0], [7, 230, 7]);
    beam([105, 45, 0], [7, 230, 7]);
    beam([0, 157, 0], [217, 7, 7]);
    const gantry = beam([0, 40, 0], [210, 6, 6]);
    const nozzle = beam([0, 31, 0], [14, 16, 14]);
    const bounds = own(new THREE.EdgesGeometry(new THREE.BoxGeometry(182, 76, 182)));
    const outline = new THREE.LineSegments(
      bounds,
      own(
        new THREE.LineBasicMaterial({
          color: 0x16_84_78,
          transparent: true,
          opacity: 0.7,
          depthTest: true,
          depthWrite: false,
        }),
      ),
    );
    scene.add(outline);
    const fit = () => {
      const { width, height } = surface.getBoundingClientRect();
      if (!width || !height) {
        return;
      }
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      lastProgress = -1;
      request();
    };
    const progress = () => {
      const anchor = innerHeight * (innerWidth <= 760 ? 0.76 : 0.52);
      const tops = chapters.map((chapter) => chapter.getBoundingClientRect().top);
      let index = 0;
      for (let i = 1; i < tops.length; i++) {
        if (tops[i] <= anchor) {
          index = i;
        }
      }
      if (index === 7) {
        return 7;
      }
      return clamp(index + (anchor - tops[index]) / (tops[index + 1] - tops[index]), 0, 7);
    };
    const draw = () => {
      frame = 0;
      if (disposed || paused || document.hidden || !active || reduced.matches) {
        return;
      }
      const p = progress();
      if (Math.abs(p - lastProgress) < 0.001) {
        return;
      }
      lastProgress = p;
      const chapter = Math.min(7, Math.floor(p + 0.15));
      stage.dataset.chapter = String(chapter);
      stage.querySelector('[data-scene-label]').textContent = labels[chapter];
      stage.querySelector('[data-scene-caption]').textContent =
        `${String(chapter + 1).padStart(2, '0')} / ${['Describe', 'Create', 'Shape', 'Assemble', 'Refine', 'Verify', 'Print', 'Everywhere'][chapter]}`;
      const formed = ease((p - 0.55) / 1.2);
      const assembled = ease(p - 2.15);
      const print = ease((p - 5.7) / 0.7) * (1 - ease((p - 6.7) / 0.3));
      const device = ease((p - 6.7) / 0.3);
      const sun = ease((p - 3) / 1.65) * Math.PI * 4;
      const explode = (1 - assembled) * 0.7;
      for (const object of objects) {
        const { group, mesh, dots, part, planet, lift, index } = object;
        const pose = partPose(part.name, sun);
        group.position.set(pose.x, pose.y, lift * explode);
        group.rotation.set(0, 0, pose.rotation);
        const lane = part.name.startsWith('Internal') ? -1 : part.name.startsWith('Sun') || planet !== null ? 0 : 1;
        group.position.x += lane * 115 * (1 - formed);
        group.position.z += ((index % 4) - 1.5) * 18 * (1 - formed);
        const growth = blend(0.75, 1, formed);
        group.scale.setScalar(growth);
        mesh.visible = p > 1.2 + (index % 5) * 0.09 && (print < 0.8 || part.name.startsWith('Internal'));
        dots.visible = p < 2 && !mesh.visible;
        dots.material.opacity = blend(0.45, 0.9, formed);
      }
      root.scale.setScalar(blend(1, 0.73, device));
      root.position.y = blend(0, -62, print);
      // Print frame describes a workflow; the complete example remains inspectable.
      printer.visible = print > 0.01;
      printer.scale.setScalar(Math.max(0.01, print));
      const printHeight = blend(-62, -45, ease((p - 6) / 0.65));
      printPlane.constant = print > 0.8 ? printHeight : 1000;
      nozzle.position.x = Math.sin(p * 35) * 55;
      gantry.position.y = printHeight + 18;
      nozzle.position.y = printHeight + 9;
      outline.visible = chapter === 5;
      outline.position.y = 0;
      const narrow = innerWidth <= 760;
      const distance = blend(blend(475, narrow ? 260 : 390, assembled), narrow ? 440 : 560, print);
      camera.position.set(distance * 0.7, distance * 0.68, distance * 0.9);
      camera.lookAt(0, blend(blend(10, -6, assembled), 35, print), 0);
      renderer.render(scene, camera);
      rendered++;
      stage.dataset.frames = String(rendered);
      stage.classList.add('is-live');
    };
    const request = () => {
      if (!frame && !disposed && !paused && active && !document.hidden && !reduced.matches) {
        frame = requestAnimationFrame(draw);
      }
    };
    observer = new IntersectionObserver(
      ([entry]) => {
        active = entry.isIntersecting;
        if (active) {
          lastProgress = -1;
          request();
        } else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { threshold: 0.01 },
    );
    observer.observe(stage);
    resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(surface);
    window.addEventListener('scroll', request, { passive: true, signal: controller.signal });
    window.addEventListener('resize', fit, { passive: true, signal: controller.signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        cancelAnimationFrame(frame);
        frame = 0;
        if (!document.hidden) {
          lastProgress = -1;
          request();
        }
      },
      { signal: controller.signal },
    );
    reduced.addEventListener(
      'change',
      () => {
        if (reduced.matches) {
          cleanup();
        }
      },
      { signal: controller.signal },
    );
    toggle.hidden = false;
    toggle.addEventListener(
      'click',
      () => {
        paused = !paused;
        toggle.setAttribute('aria-pressed', String(paused));
        toggle.textContent = paused ? 'Resume motion' : 'Pause motion';
        if (paused) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else {
          lastProgress = -1;
          request();
        }
      },
      { signal: controller.signal },
    );
    renderer.domElement.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        cleanup();
      },
      { signal: controller.signal },
    );
    window.addEventListener('pagehide', cleanup, { once: true, signal: controller.signal });
    fit();
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
