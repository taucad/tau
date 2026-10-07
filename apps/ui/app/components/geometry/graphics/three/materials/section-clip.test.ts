// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import {
  BoxGeometry,
  Group,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  MeshStandardMaterial,
  ShaderLib,
} from 'three';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import {
  applyModelMaterialAppearance,
  getOrCaptureModelMaterialAppearance,
} from '#components/geometry/graphics/three/materials/model-component-appearance.js';
import { MeshBasicNodeMaterial, MeshMatcapNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { bool } from 'three/tsl';
import RenderObject from 'three/src/renderers/common/RenderObject.js';
import { toRenderPoint } from '@taucad/spatial';
import type { RenderFrame } from '@taucad/spatial';
import {
  isSectionRemoved,
  maxSectionPieces,
  resolveSectionPieces,
  toRenderSectionPieces,
} from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionVector } from '#components/geometry/graphics/section-cuts.js';
import {
  createSectionClip,
  getSectionClip,
  installSectionClip,
  transferSectionClip,
  writeSectionClip,
} from '#components/geometry/graphics/three/materials/section-clip.js';
import type { SectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { applyGltfSurfaceDepthBias } from '#components/geometry/graphics/three/materials/gltf-surface-depth-bias.js';
import { Line2NodeMaterial } from '#components/geometry/graphics/three/materials/line2.material.js';

type ShaderSource = Readonly<{ vertexShader: string; fragmentShader: string }>;

const programSources = {
  standard: ShaderLib.physical,
  matcap: ShaderLib.matcap,
  basic: ShaderLib.basic,
  points: ShaderLib.points,
} as const;

/** What `WebGLPrograms` hands `onBeforeCompile`: the program's sources before includes resolve. */
const compile = (material: Material, source: ShaderSource): WebGLProgramParametersWithUniforms => {
  const shader = {
    vertexShader: source.vertexShader,
    fragmentShader: source.fragmentShader,
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, mock<WebGLRenderer>());
  return shader;
};

/** Everything a WebGL program is built from: its cache key and the sources the hook produces. */
const programInputs = (material: Material, source: ShaderSource) => {
  const { vertexShader, fragmentShader } = compile(material, source);
  return { key: material.customProgramCacheKey(), vertexShader, fragmentShader };
};

/** The WebGPU render object's material cache key, from three's own implementation. */
const webGpuMaterialCacheKey = (material: Material): number =>
  (RenderObject.prototype.getMaterialCacheKey as (this: unknown) => number).call({
    object: new Mesh(new BoxGeometry(), material),
    material,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- three's own renderer flag
    renderer: { backend: { isWebGPUBackend: true } },
    clippingContextCacheKey: '',
    context: { id: 0 },
    getGeometryCacheKey: () => '',
  });

/** The fragment test `tauSectionRemoved` runs, over the packed uniforms, line for line. */
const isRemovedByClip = (clip: SectionClip, [x, y, z]: SectionVector): boolean => {
  for (let index = 0; index < maxSectionPieces; index++) {
    if (index >= clip.settings.x) {
      break;
    }
    const first = clip.first[index]!;
    const second = clip.second[index]!;
    if (
      x * first.x + y * first.y + z * first.z - first.w > clip.settings.y &&
      x * second.x + y * second.y + z * second.z - second.w > clip.settings.y
    ) {
      return true;
    }
  }
  return false;
};

const narrowCutawaysAndPlane: readonly SectionCut[] = [
  { id: 'a', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 20, sweep: 70 },
  { id: 'b', kind: 'revolution', axis: 'x', origin: [0.2, 0.1, -0.1], start: 200, sweep: 120 },
  { id: 'c', kind: 'plane', plane: 'xy', offset: 0.35, isFlipped: false },
];

const wideCutaways: readonly SectionCut[] = [
  { id: 'a', kind: 'revolution', axis: 'z', origin: [0, 0, 0], start: 0, sweep: 190 },
  { id: 'b', kind: 'revolution', axis: 'z', origin: [0.02, 0, 0], start: 20, sweep: 190 },
  { id: 'c', kind: 'revolution', axis: 'x', origin: [0, 0.03, 0], start: 0, sweep: 190 },
  { id: 'd', kind: 'revolution', axis: 'y', origin: [0, 0, -0.02], start: 0, sweep: 190 },
];

const renderFrame: RenderFrame = {
  anchorFrameId: 'tau:root',
  originMeters: [0.05, -0.02, 0.1],
  metersPerRenderUnit: 0.25,
};

// A lattice offset off the cut planes, so no sample sits on a boundary where rounding could decide.
const samplePoints: SectionVector[] = [];
for (let i = 0; i < 11; i++) {
  for (let j = 0; j < 11; j++) {
    for (let k = 0; k < 11; k++) {
      samplePoints.push([-0.5 + i * 0.1 + 0.0137, -0.5 + j * 0.1 - 0.0071, -0.5 + k * 0.1 + 0.0043]);
    }
  }
}

describe('section clip regions', () => {
  it.each([
    ['two narrow cutaways and a plane', narrowCutawaysAndPlane, 3],
    ['four cutaways past 180°', wideCutaways, maxSectionPieces],
  ] as const)('should remove what the cut model removes for %s', (_case, cuts, pieceCount) => {
    const pieces = resolveSectionPieces(cuts);
    const clip = createSectionClip('webgl');
    writeSectionClip(clip, toRenderSectionPieces(pieces, renderFrame));

    expect(clip.settings.x).toBe(pieceCount);
    let removed = 0;
    for (const point of samplePoints) {
      const expected = isSectionRemoved(point, pieces);
      expect(isRemovedByClip(clip, toRenderPoint({ renderFrame, point })), `${point.join(', ')}`).toBe(expected);
      removed += expected ? 1 : 0;
    }
    // Both outcomes are well represented, so agreement is not a trivial all-or-nothing.
    expect(removed).toBeGreaterThan(20);
    expect(samplePoints.length - removed).toBeGreaterThan(20);
  });

  it('should repeat the half-space of a one-half-space piece and carry the epsilon', () => {
    const clip = createSectionClip('webgl');
    const [plane] = resolveSectionPieces([{ id: 'p', kind: 'plane', plane: 'yz', offset: 0.2, isFlipped: true }]);

    writeSectionClip(clip, [plane!], 0.001);

    expect(clip.settings.toArray()).toEqual([1, 0.001]);
    expect(clip.first[0]!.toArray()).toEqual([-1, 0, 0, -0.2]);
    expect(clip.second[0]!.toArray()).toEqual(clip.first[0]!.toArray());
    expect(isRemovedByClip(clip, [0.1, 0, 0])).toBe(true);
    expect(isRemovedByClip(clip, [0.1995, 0, 0])).toBe(false);
  });

  it('should refuse more pieces than the arrays hold rather than drop one', () => {
    const clip = createSectionClip('webgl');
    const pieces = resolveSectionPieces(wideCutaways);

    expect(() => {
      writeSectionClip(clip, [...pieces, pieces[0]!]);
    }).toThrow(RangeError);
  });
});

describe('section clip updates', () => {
  it.each(['webgl', 'webgpu'] as const)('should write every cut count into the same objects on %s', (backend) => {
    const clip = createSectionClip(backend);
    const held = { settings: clip.settings, first: clip.first, second: clip.second, vectors: [...clip.first] };
    const heldBinding = clip.backend === 'webgl' ? clip.uniforms : clip.mask;

    for (const cuts of [[], narrowCutawaysAndPlane.slice(0, 1), narrowCutawaysAndPlane, []]) {
      writeSectionClip(clip, toRenderSectionPieces(resolveSectionPieces(cuts), renderFrame));
      expect(clip.settings).toBe(held.settings);
      expect(clip.first).toBe(held.first);
      expect(clip.second).toBe(held.second);
      expect(clip.first.every((vector, index) => vector === held.vectors[index])).toBe(true);
      expect(clip.backend === 'webgl' ? clip.uniforms : clip.mask).toBe(heldBinding);
    }
    if (clip.backend === 'webgl') {
      expect(clip.uniforms.tauSectionFirst.value).toBe(clip.first);
      expect(clip.uniforms.tauSectionClip.value).toBe(clip.settings);
    }
  });

  it('should keep every WebGL program input as cuts go from none to one to three to none', () => {
    const clip = createSectionClip('webgl');
    const fatLine = new LineMaterial();
    const cases = [
      { material: new MeshStandardMaterial(), source: programSources.standard },
      { material: new MeshMatcapMaterial(), source: programSources.matcap },
      { material: new LineBasicMaterial(), source: programSources.basic },
      { material: fatLine, source: fatLine },
    ];
    for (const { material } of cases) {
      installSectionClip(material, clip);
    }
    const before = cases.map(({ material, source }) => ({
      version: material.version,
      ...programInputs(material, source),
    }));

    for (const cuts of [narrowCutawaysAndPlane.slice(0, 1), narrowCutawaysAndPlane, []]) {
      writeSectionClip(clip, resolveSectionPieces(cuts));
      expect(
        cases.map(({ material, source }) => ({ version: material.version, ...programInputs(material, source) })),
      ).toEqual(before);
    }
  });

  it('should keep the WebGPU material cache keys and versions as cuts go from none to one to three to none', () => {
    const clip = createSectionClip('webgpu');
    const materials = [
      new MeshStandardMaterial(),
      new MeshBasicMaterial(),
      new MeshMatcapNodeMaterial(),
      new Line2NodeMaterial(),
    ];
    for (const material of materials) {
      installSectionClip(material, clip);
    }
    const before = materials.map((material) => [material.version, webGpuMaterialCacheKey(material)]);

    for (const cuts of [narrowCutawaysAndPlane.slice(0, 1), narrowCutawaysAndPlane, []]) {
      writeSectionClip(clip, resolveSectionPieces(cuts));
      expect(materials.map((material) => [material.version, webGpuMaterialCacheKey(material)])).toEqual(before);
    }
  });
});

describe('section clip installation', () => {
  it.each(Object.entries(programSources))(
    'should compile the clip into the %s program once, after the existing hooks',
    (_name, source) => {
      const material = new MeshStandardMaterial();
      const priorHook = vi.fn();
      material.onBeforeCompile = priorHook;
      const clip = createSectionClip('webgl');

      installSectionClip(material, clip);
      installSectionClip(material, clip);
      const shader = compile(material, source);

      expect(priorHook).toHaveBeenCalledOnce();
      expect(shader.vertexShader.match(/vTauSectionWorld = \( modelMatrix \* tauSectionWorld \)/g)).toHaveLength(1);
      expect(shader.fragmentShader.match(/if \( tauSectionRemoved\( vTauSectionWorld \) \) discard;/g)).toHaveLength(1);
      expect(shader.uniforms['tauSectionFirst']).toBe(clip.uniforms.tauSectionFirst);
      expect(material.customProgramCacheKey()).toContain('|tau-section-clip-v1');
    },
  );

  it('should take the fat-line position from the trimmed view-space segment end', () => {
    const material = new LineMaterial();
    installSectionClip(material, createSectionClip('webgl'));

    const shader = compile(material, material);

    expect(shader.vertexShader).toContain('vTauSectionWorld = ( inverse( viewMatrix ) * mvPosition ).xyz;');
    expect(shader.vertexShader).not.toContain('transformed');
    expect(shader.fragmentShader.indexOf('tauSectionRemoved( vTauSectionWorld )')).toBeGreaterThan(
      shader.fragmentShader.indexOf('void main()'),
    );
  });

  it.each([
    ['absent', { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: 'void main() {}' }],
    [
      'duplicated',
      {
        vertexShader: ShaderLib.basic.vertexShader,
        fragmentShader: `${ShaderLib.basic.fragmentShader}\n#include <clipping_planes_fragment>`,
      },
    ],
  ])('should fail compilation when a clipping chunk is %s', (_case, source) => {
    const material = new MeshBasicMaterial();
    installSectionClip(material, createSectionClip('webgl'));

    expect(() => compile(material, source)).toThrow('Section clip requires exactly one');
  });

  it('should keep the clip when the surface depth bias composed under it turns off', () => {
    const material = new MeshStandardMaterial();
    const snapshot = getOrCaptureModelMaterialAppearance(material);
    applyGltfSurfaceDepthBias(material, 'webgl');
    installSectionClip(material, createSectionClip('webgl'));
    applyModelMaterialAppearance(material, snapshot, 0.5);
    const shader = compile(material, programSources.standard);

    expect(shader.fragmentShader).toContain('tauSectionRemoved');
    expect(shader.fragmentShader).not.toContain('tauSurfaceDepthOffset');
    expect(material.customProgramCacheKey()).toContain('|tau-section-clip-v1');
    expect(material.customProgramCacheKey()).not.toContain('tau-gltf-surface-depth-bias');
    applyModelMaterialAppearance(material, snapshot, 1);
    const restored = compile(material, programSources.standard);
    expect(restored.fragmentShader).toContain('tauSectionRemoved');
    expect(restored.fragmentShader.match(/float tauSurfaceDepthOffset/g)).toHaveLength(1);
  });

  it('should set one mask node on converted, node and fat-line materials alike on WebGPU', () => {
    const clip = createSectionClip('webgpu');
    const materials = [new MeshStandardMaterial(), new MeshMatcapNodeMaterial(), new Line2NodeMaterial()];

    for (const material of materials) {
      installSectionClip(material, clip);
    }

    expect(materials.map((material) => (material as { maskNode?: Node }).maskNode)).toEqual([
      clip.mask,
      clip.mask,
      clip.mask,
    ]);
    expect(materials.every((material) => material.onBeforeCompile === Material.prototype.onBeforeCompile)).toBe(true);
  });

  it('should keep an existing mask node and add the clip to it', () => {
    const clip = createSectionClip('webgpu');
    const material = new MeshBasicNodeMaterial();
    const ownMask = bool(true);
    material.maskNode = ownMask;

    installSectionClip(material, clip);

    expect(material.maskNode).not.toBe(ownMask);
    expect(material.maskNode).not.toBe(clip.mask);
    expect(JSON.stringify(material.toJSON())).toContain(ownMask.uuid);
  });

  it('should hand the clip to a replacement material and nothing to one replacing an unclipped material', () => {
    const clip = createSectionClip('webgl');
    const clipped = new MeshStandardMaterial();
    installSectionClip(clipped, clip);
    const replacement = new MeshMatcapMaterial();
    const unrelated = new MeshMatcapMaterial();

    transferSectionClip(clipped, replacement);
    transferSectionClip(new MeshStandardMaterial(), unrelated);

    expect(compile(replacement, programSources.matcap).fragmentShader).toContain('tauSectionRemoved');
    expect(unrelated.onBeforeCompile).toBe(Material.prototype.onBeforeCompile);
  });

  it('should give each viewer its own clip and refuse to share a material between them', () => {
    const [first, second] = [new Group(), new Group()].map((scene) => getSectionClip(scene, 'webgl'));
    const material = new MeshStandardMaterial();

    expect(first).not.toBe(second);
    expect(first!.settings).not.toBe(second!.settings);
    installSectionClip(material, first!);
    expect(() => {
      installSectionClip(material, second!);
    }).toThrow('A material takes the section clip of one viewer only.');
  });
});
