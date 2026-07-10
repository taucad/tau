import { describe, expect, it } from 'vitest';
import {
  availableChecksCopy,
  canonicalBrepGeoSpecTestExample,
  canonicalGeoSpecTestExample,
  renderAvailableChecksCopy,
  renderCanonicalExample,
} from '#prompt-examples.js';

describe('canonicalGeoSpecTestExample', () => {
  it('should expose executable GeoSpec syntax keyed by the <file> placeholder', () => {
    expect(canonicalGeoSpecTestExample).toContain("import { describe, expectGeo, it } from 'geospec'");
    expect(canonicalGeoSpecTestExample).toContain("import { loadModel } from 'geospec/model'");
    expect(canonicalGeoSpecTestExample).toContain("file: '<file>'");
  });

  it('should include examples for shape checks and physical measurements', () => {
    expect(canonicalGeoSpecTestExample).toContain("const model = await loadModel({ file: '<file>' })");
    expect(canonicalGeoSpecTestExample).not.toContain('modelPromise');
    expect(canonicalGeoSpecTestExample).not.toContain('stepModelPromise');
    expect(canonicalGeoSpecTestExample).not.toContain('getModel');
    expect(canonicalGeoSpecTestExample).toContain('toHaveBoundingBox');
    expect(canonicalGeoSpecTestExample).toContain('toHaveConnectedComponents');
    expect(canonicalGeoSpecTestExample).toContain('toBeWatertight');
    expect(canonicalGeoSpecTestExample).toContain('toHaveNoComponentInterference');
    expect(canonicalGeoSpecTestExample).toContain('toHaveSurfaceArea');
    expect(canonicalGeoSpecTestExample).toContain('toHaveVolume');
    expect(canonicalGeoSpecTestExample).toContain('toHaveCenterOfMass');
  });

  it('should show default and explicit parameter loads in the canonical suite', () => {
    expect(canonicalGeoSpecTestExample).toContain("loadModel({ file: '<file>' })");
    expect(canonicalGeoSpecTestExample).toContain('parameters: { width, height }');
    expect(canonicalGeoSpecTestExample).toContain('size: { x: width, z: height }');
  });

  it('should never reference legacy requirement-file or deprecated checks', () => {
    expect(canonicalGeoSpecTestExample).not.toContain('legacy requirement file');
    expect(canonicalGeoSpecTestExample).not.toContain('meshCount');
    expect(canonicalGeoSpecTestExample).not.toContain('vertexCount');
  });
});

describe('renderCanonicalExample', () => {
  it('should substitute the supplied file extension into the example key', () => {
    const rendered = renderCanonicalExample('ts');
    expect(rendered).toContain("file: 'main.ts'");
    expect(rendered).not.toContain('<file>');
  });

  it('should produce a fenced TypeScript GeoSpec code block', () => {
    const rendered = renderCanonicalExample('scad');
    expect(rendered).toMatch(/^```ts/);
    expect(rendered).toMatch(/```$/);
    expect(rendered).toContain("loadModel({ file: 'main.scad' })");
    expect(rendered).not.toMatch(/\.ts wrapper|typescript wrapper|fake wrapper/i);
  });

  it('should accept a leading dot on the extension (defensive normalisation)', () => {
    expect(renderCanonicalExample('.ts')).toContain("file: 'main.ts'");
  });

  it('should include BRep examples only when requested', () => {
    expect(renderCanonicalExample('ts')).not.toContain('toHavePlanarFace');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHavePlanarFace');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHaveCircularHole');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toBeValidBrep');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHaveTopologyCounts');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHaveChamferFeature');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHaveMinimumWallThickness');
  });

  it('should teach exact BRep checks to load STEP evidence explicitly', () => {
    expect(canonicalGeoSpecTestExample).not.toContain("format: 'step'");
    expect(canonicalBrepGeoSpecTestExample).toContain(
      "const model = await loadModel({ file: '<file>', format: 'step' })",
    );
    expect(canonicalBrepGeoSpecTestExample).not.toContain('modelPromise');
    expect(canonicalBrepGeoSpecTestExample).not.toContain('stepModelPromise');
    expect(canonicalBrepGeoSpecTestExample).not.toContain('getModel');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain(
      "loadModel({ file: 'main.ts', format: 'step' })",
    );
  });
});

describe('availableChecksCopy', () => {
  it('should mention the core GeoSpec checks with their unique-question framing', () => {
    expect(availableChecksCopy).toContain('boundingBox');
    expect(availableChecksCopy).toContain('connectedComponents');
    expect(availableChecksCopy).toContain('watertight');
    expect(availableChecksCopy).toContain('surfaceArea');
    expect(availableChecksCopy).toContain('volume');
    expect(availableChecksCopy).toContain('centerOfMass');
    expect(availableChecksCopy).toContain('componentInterference');
    expect(availableChecksCopy).toContain('toHaveNoComponentInterference({ tolerance: 0.1 })');
    expect(availableChecksCopy).toContain('pairs: [{ left: /housing/i, right: /planet gear/i }]');
    expect(availableChecksCopy).toContain('chamferDistance');
    expect(availableChecksCopy).toContain('SIZE / POSITION');
    expect(availableChecksCopy).toContain('SPATIALLY-DISJOINT CHUNKS');
    expect(availableChecksCopy).toContain('CLOSED (strict manifold topology)');
  });

  it('should explicitly mention the connectedComponents tolerance knob (mm) and its default', () => {
    expect(availableChecksCopy).toContain('tolerance');
    expect(availableChecksCopy).toContain('mm');
    expect(availableChecksCopy).toContain('default 0.1');
  });

  it('should never reference the deprecated meshCount or vertexCount checks', () => {
    expect(availableChecksCopy).not.toContain('meshCount');
    expect(availableChecksCopy).not.toContain('vertexCount');
  });

  it('should not expose component-overlap implementation knobs or shortcut algorithms', () => {
    expect(availableChecksCopy).not.toContain('components:');
    expect(availableChecksCopy).not.toContain('volumeTolerance');
    expect(availableChecksCopy).not.toContain('sampleCount');
    expect(availableChecksCopy).not.toContain('AABB');
    expect(availableChecksCopy).not.toContain('envelope');
    expect(availableChecksCopy).not.toContain('toHaveNoInterference');
  });

  it('should clarify that "is this one fused solid?" maps to watertight (not connectedComponents:1)', () => {
    expect(availableChecksCopy).toContain('one fused solid');
    expect(availableChecksCopy).toContain('watertight');
  });

  it('should teach agents to use matchers instead of GeometrySubject internals', () => {
    expect(availableChecksCopy).toContain('opaque `GeometrySubject`');
    expect(availableChecksCopy).toContain('do not read `model.boundingBox.bounds`');
    expect(availableChecksCopy).toContain('call `model.volume()`');
    expect(availableChecksCopy).toContain('Assert through `expectGeo(model)`');
  });

  it('should omit BRep-only STEP guidance for mesh-only kernels', () => {
    const meshOnly = renderAvailableChecksCopy({ includeBrepFeatures: false });

    expect(meshOnly).toContain('boundingBox');
    expect(meshOnly).toContain('surfaceArea');
    expect(meshOnly).not.toContain('planarFace');
    expect(meshOnly).not.toContain("format: 'step'");
  });
});

describe('GeoSpec matcher vocabulary is real (anti-drift guard)', () => {
  // Every `toHave*` / `toBe*` token the agent-facing copy teaches must be a
  // matcher that actually exists on geospec's live surface. This is the guard
  // that would have caught the toHaveNoComponentOverlap -> ...Interference
  // rename drift instead of the old hardcoded-name asserts protecting it.
  const corpus = [canonicalGeoSpecTestExample, canonicalBrepGeoSpecTestExample, availableChecksCopy].join('\n');
  const referencedMatchers = [...new Set(corpus.match(/to(?:Have|Be)[A-Za-z]+/g) ?? [])];

  it('references at least the core matchers (sanity that parsing works)', () => {
    expect(referencedMatchers).toContain('toBeValidBrep');
    expect(referencedMatchers).toContain('toHaveNoComponentInterference');
    expect(referencedMatchers.length).toBeGreaterThan(5);
  });

  it.each(referencedMatchers)('%s exists on the geospec matcher surface', async (matcher) => {
    // Geospec is lazy-loaded (heavy WASM), so import it inside the test.
    const { geoSpecMatcherNames } = await import('geospec');
    expect(geoSpecMatcherNames).toContain(matcher);
  });
});

describe('agent-facing GeoSpec copy', () => {
  it('should not tell the agent to simplify models when tests fail', () => {
    const corpus = [
      availableChecksCopy,
      canonicalGeoSpecTestExample,
      renderCanonicalExample('scad'),
      renderCanonicalExample('ts'),
      renderCanonicalExample('ts', { includeBrepFeatures: true }),
    ].join('\n');

    expect(corpus).not.toMatch(
      /try a simpler model|simplify the model|compare simpler mesh evidence|too complex to verify|\.ts wrapper|typescript wrapper|fake wrapper/i,
    );
  });

  it('should not teach unit or preview workarounds for runtime-backed loadModel', () => {
    const corpus = [
      availableChecksCopy,
      canonicalGeoSpecTestExample,
      canonicalBrepGeoSpecTestExample,
      renderCanonicalExample('scad'),
      renderCanonicalExample('kcl'),
      renderCanonicalExample('ts'),
      renderCanonicalExample('ts', { includeBrepFeatures: true }),
    ].join('\n');

    expect(corpus).not.toContain('S = 1000');
    expect(corpus).not.toContain('previewGeometry');
    expect(corpus).not.toContain('test.json');
    expect(corpus).not.toMatch(/loadModel\([^)]*(?:scale|sourceUnit|coordinateSystem)/);
    expect(corpus).not.toMatch(/loadModel\([^)]*unit\s*:/);
    expect(corpus).not.toMatch(/loadModel\([^)]*kernel\s*:/);
  });
});
