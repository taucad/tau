import { describe, expect, it } from 'vitest';
import {
  availableChecksCopy,
  canonicalBrepGeoSpecTestExample,
  canonicalGeoSpecTestExample,
  geospecParameterTestingCopy,
  renderCanonicalExample,
} from '#prompt-examples.js';

describe('canonicalGeoSpecTestExample', () => {
  it('should expose executable GeoSpec syntax keyed by the <file> placeholder', () => {
    expect(canonicalGeoSpecTestExample).toContain("import { describe, expectGeo, it } from 'geospec'");
    expect(canonicalGeoSpecTestExample).toContain("import { loadModel } from 'geospec/model'");
    expect(canonicalGeoSpecTestExample).toContain("file: '<file>'");
  });

  it('should include examples for shape checks and physical measurements', () => {
    expect(canonicalGeoSpecTestExample).toContain('toHaveBoundingBox');
    expect(canonicalGeoSpecTestExample).toContain('toHaveConnectedComponents');
    expect(canonicalGeoSpecTestExample).toContain('toBeWatertight');
    expect(canonicalGeoSpecTestExample).toContain('toHaveSurfaceArea');
    expect(canonicalGeoSpecTestExample).toContain('toHaveVolume');
    expect(canonicalGeoSpecTestExample).toContain('toHaveCenterOfMass');
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
  });

  it('should accept a leading dot on the extension (defensive normalisation)', () => {
    expect(renderCanonicalExample('.ts')).toContain("file: 'main.ts'");
  });

  it('should include BRep examples only when requested', () => {
    expect(renderCanonicalExample('ts')).not.toContain('toHavePlanarFace');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHavePlanarFace');
    expect(renderCanonicalExample('ts', { includeBrepFeatures: true })).toContain('toHaveCircularHole');
  });

  it('should teach exact BRep checks to load STEP evidence explicitly', () => {
    expect(canonicalGeoSpecTestExample).not.toContain("format: 'step'");
    expect(canonicalBrepGeoSpecTestExample).toContain("loadModel({ file: '<file>', format: 'step' })");
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
    expect(availableChecksCopy).toContain('chamferDistance');
    expect(availableChecksCopy).toContain('SIZE / POSITION');
    expect(availableChecksCopy).toContain('SPATIALLY-DISJOINT CHUNKS');
    expect(availableChecksCopy).toContain('CLOSED (manifold / 3D-printable)');
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
});

describe('geospecParameterTestingCopy', () => {
  it('should teach the agent that parameters are mutable GeoSpec test inputs', () => {
    expect(geospecParameterTestingCopy).toContain('Parameter-aware GeoSpec tests');
    expect(geospecParameterTestingCopy).toContain("import { loadModel, parameterGroups } from 'geospec/model'");
    expect(geospecParameterTestingCopy).toContain(
      "import mainParams from '#params/main.ts.json' with { type: 'json' }",
    );
    expect(geospecParameterTestingCopy).toContain('Do not import named `values` from JSON');
    expect(geospecParameterTestingCopy).toContain('Parameters are real test inputs');
    expect(geospecParameterTestingCopy).toContain('"#params/*.json": "./.tau/parameters/*.json"');
    expect(geospecParameterTestingCopy).toContain("import { describe, expectGeo, it } from 'geospec'");
    expect(geospecParameterTestingCopy).not.toContain('@taucad/testing/tau');
  });
});

describe('agent-facing GeoSpec copy', () => {
  it('should not tell the agent to simplify models when tests fail', () => {
    const corpus = [
      availableChecksCopy,
      canonicalGeoSpecTestExample,
      geospecParameterTestingCopy,
      renderCanonicalExample('ts'),
      renderCanonicalExample('ts', { includeBrepFeatures: true }),
    ].join('\n');

    expect(corpus).not.toMatch(
      /try a simpler model|simplify the model|compare simpler mesh evidence|too complex to verify/i,
    );
  });
});
